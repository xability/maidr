import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import type { AudioState, FigureState, PlotState, SubplotState, TraceState } from '@type/state';
import type { AudioPaletteEntry } from './audioPalette';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { AudioPaletteIndex, AudioPaletteService } from './audioPalette';

/**
 * Represents a numeric range with minimum and maximum values.
 */
interface Range {
  min: number;
  max: number;
}

type AudioId = ReturnType<typeof setTimeout>;

type ObservableStates = SubplotState | TraceState | FigureState;

const NULL_FREQUENCY = 100;
const WAITING_FREQUENCY = 440;
const COMPLETE_FREQUENCY = 880;

const DEFAULT_DURATION = 0.3;
const DEFAULT_PALETTE_INDEX = AudioPaletteIndex.SINE_BASIC;

/**
 * Audio playback modes for the service.
 */
enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

/**
 * Service responsible for managing audio feedback for data visualization, including tone generation and spatial audio.
 */
export class AudioService
implements Observer<ObservableStates>, Observer<Settings>, Disposable {
  private readonly notification: NotificationService;
  private readonly audioPalette: AudioPaletteService;
  private readonly settings: SettingsService;

  private isCombinedAudio: boolean;
  private mode: AudioMode;

  private readonly activeAudioIds: Map<AudioId, OscillatorNode[]>;

  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  private currentVolume: number;
  private currentMinFrequency: number;
  private currentMaxFrequency: number;

  /**
   * Creates an instance of AudioService.
   * @param notification - Service for user notifications
   * @param state - Initial plot state
   * @param settings - Service for managing settings
   */
  public constructor(notification: NotificationService, state: PlotState, settings: SettingsService) {
    this.notification = notification;
    this.audioPalette = new AudioPaletteService();
    this.settings = settings;

    this.isCombinedAudio = false;
    this.mode = AudioMode.SEPARATE;
    this.updateMode(state);

    this.activeAudioIds = new Map();

    this.audioContext = new AudioContext();
    this.compressor = this.initCompressor();

    const initialSettings = this.settings.loadSettings();
    this.currentVolume = initialSettings.general.volume / 100;
    this.currentMinFrequency = initialSettings.general.minFrequency;
    this.currentMaxFrequency = initialSettings.general.maxFrequency;

    this.settings.addObserver(this);
  }

  /**
   * Cleans up all audio resources and disconnects from the audio context.
   */
  public dispose(): void {
    this.stopAll();
    this.audioPalette.dispose();
    if (this.audioContext.state !== 'closed') {
      this.compressor.disconnect();
      void this.audioContext.close();
    }
    this.settings.removeObserver(this);
  }

  /**
   * Updates the audio service based on state or settings changes.
   * @param state - Updated settings or plot state
   */
  public update(state: Settings | SubplotState | TraceState | FigureState): void {
    if ('general' in state) {
      this.onSettingsChange(state);
    } else {
      this.onStateChange(state);
    }
  }

  /**
   * Handles settings changes by updating volume and frequency ranges.
   * @param settings - Updated settings object
   */
  private onSettingsChange(settings: Settings): void {
    this.currentVolume = settings.general.volume / 100;
    this.currentMinFrequency = settings.general.minFrequency;
    this.currentMaxFrequency = settings.general.maxFrequency;
  }

  /**
   * Handles plot state changes and plays appropriate audio feedback.
   * @param state - Updated plot state
   */
  private onStateChange(state: SubplotState | TraceState | FigureState): void {
    // Do not play any sound if audio is off
    if (this.mode === AudioMode.OFF) {
      return;
    }
    this.updateMode(state);
    // TODO: Clean up previous audio state once syncing with Autoplay interval.

    // Handle FigureState - no audio for normal subplot navigation
    if (state.type === 'figure') {
      if (state.empty) {
        this.playEmptyTone(1, 0);
        return;
      }
      return;
    }

    // Extract trace state from subplot state if needed
    let traceState: TraceState;
    if (state.type === 'subplot') {
      if (state.empty) {
        // Empty subplot state - no trace to play audio for
        return;
      }
      traceState = state.trace;
    } else {
      traceState = state;
    }

    this.handleTraceState(traceState);
  }

  /**
   * Processes trace state and generates corresponding audio based on data values.
   * @param traceState - The trace state to sonify
   */
  private handleTraceState(traceState: TraceState): void {
    // Play audio only if turned on and it's a trace state
    if (this.mode === AudioMode.OFF || traceState.type !== 'trace') {
      return;
    }

    if (traceState.empty) {
      // Stop any existing audio first to prevent overlap
      this.stopAll();
      this.playEmptyTone(traceState.audio.size, traceState.audio.index);
      return;
    }

    // --- INTERSECTION LOGIC FOR LINE PLOTS ---
    if (
      traceState.traceType === 'line'
      && !traceState.empty
      && Array.isArray(traceState.intersections)
      && traceState.intersections.length > 1
    ) {
      // Stop any existing audio to prevent interference
      this.stopAll();
      // Play all intersecting lines' tones simultaneously
      this.playSimultaneousTones(traceState.intersections);
      return;
    }
    // --- END INTERSECTION LOGIC ---

    const audio = traceState.audio;
    let groupIndex = audio.groupIndex;

    // Handle candlestick trend-based audio selection
    if (audio.trend && groupIndex === undefined) {
      groupIndex = this.audioPalette.getCandlestickGroupIndex(audio.trend);
    }

    // Determine if we need to use multiclass audio based on whether groupIndex is defined
    // If groupIndex is defined (including 0), we have multiple groups and should use palette entries
    // If groupIndex is undefined, we have a single group and should use default audio
    //
    // Fix: Previously used groupIndex > 0 which incorrectly skipped palette entry 0 for the first group
    const shouldUseMulticlassAudio = groupIndex !== undefined;
    const paletteEntry = shouldUseMulticlassAudio
      ? this.audioPalette.getPaletteEntry(groupIndex!)
      : undefined;

    if (audio.isContinuous) {
      // continuous
      this.playSmooth(
        audio.value as number[],
        audio.min,
        audio.max,
        audio.size,
        Array.isArray(audio.index) ? audio.index[0] : audio.index,
        paletteEntry,
      );
    } else if (Array.isArray(audio.value)) {
      // multiple discrete values
      const values = audio.value as number[];
      if (values.length === 0) {
        // no tone to play
        this.playZeroTone(); // Always use original zero tone, regardless of groups
        return;
      }

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;
      const activeIds = new Array<AudioId>();
      const playNext = (): void => {
        // queue up next tone
        if (currentIndex < values.length) {
          const index = Array.isArray(audio.index)
            ? audio.index[currentIndex]
            : audio.index;
          this.playTone(
            audio.min,
            audio.max,
            values[currentIndex++],
            audio.size,
            index,
            paletteEntry,
          );
          activeIds.push(setTimeout(playNext, playRate));
        } else {
          this.stop(activeIds);
        }
      };

      playNext();
    } else {
      // just one discrete value
      const value = audio.value as number;
      if (value === 0) {
        this.playZeroTone(); // Always use original zero tone, regardless of groups
      } else {
        const index = Array.isArray(audio.index) ? audio.index[0] : audio.index;
        this.playTone(
          audio.min,
          audio.max,
          value,
          audio.size,
          index,
          paletteEntry,
        );
      }
    }
  }

  /**
   * Gets the current volume level clamped between 0 and 1.
   * @returns Normalized volume value
   */
  private getVolume(): number {
    return Math.min(Math.max(this.currentVolume, 0), 1);
  }

  /**
   * Gets the current frequency range for audio output.
   * @returns Object containing min and max frequency values
   */
  private getFrequencyRange(): { min: number; max: number } {
    return {
      min: this.currentMinFrequency,
      max: this.currentMaxFrequency,
    };
  }

  /**
   * Initializes and configures the audio compressor node for smooth output.
   * @returns Configured dynamics compressor node
   */
  private initCompressor(): DynamicsCompressorNode {
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    const smoothGain = this.audioContext.createGain();
    smoothGain.gain.value = 0.5;

    compressor.connect(smoothGain);
    smoothGain.connect(this.audioContext.destination);

    return compressor;
  }

  /**
   * Updates the audio mode based on plot state characteristics.
   * @param state - Plot state to determine audio mode
   */
  private updateMode(state: PlotState): void {
    if (state.empty || state.type === 'figure') {
      return;
    }

    const traceState = state.type === 'subplot' ? state.trace : state;
    if (
      traceState.empty
      || traceState.hasMultiPoints === this.isCombinedAudio
    ) {
      return;
    }

    this.isCombinedAudio = traceState.hasMultiPoints;
    if (this.mode === AudioMode.OFF) {
      return;
    }

    if (this.isCombinedAudio) {
      this.mode = AudioMode.COMBINED;
    } else {
      this.mode = AudioMode.SEPARATE;
    }
  }

  /**
   * Plays a single tone with specified frequency and spatial positioning.
   * @param minFrequency - Minimum frequency in the data range
   * @param maxFrequency - Maximum frequency in the data range
   * @param rawFrequency - Raw frequency value to map
   * @param panningSize - Total size for panning calculation
   * @param rawPanning - Raw panning position
   * @param paletteEntry - Optional audio palette entry for custom wave types
   * @returns Audio ID for tracking the playing tone
   */
  private playTone(
    minFrequency: number,
    maxFrequency: number,
    rawFrequency: number,
    panningSize: number,
    rawPanning: number,
    paletteEntry?: AudioPaletteEntry,
  ): AudioId {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = this.getFrequencyRange();
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(
      this.interpolate(rawPanning, fromPanning, toPanning),
      -1,
      1,
    );

    return this.playOscillator(frequency, panning, paletteEntry);
  }

  /**
   * Creates oscillators for the given palette entry and frequency.
   * @param paletteEntry - The audio palette entry defining wave type and harmonics
   * @param frequency - The base frequency for the primary oscillator
   * @returns Array of configured oscillator nodes
   */
  private createOscillators(
    paletteEntry: AudioPaletteEntry,
    frequency: number,
  ): OscillatorNode[] {
    const oscillators: OscillatorNode[] = [];

    // Create primary oscillator
    const primaryOscillator = this.audioContext.createOscillator();
    primaryOscillator.type = paletteEntry.waveType;
    primaryOscillator.frequency.value = frequency;
    oscillators.push(primaryOscillator);

    // Create harmonic oscillators if harmonic mix is present
    if (paletteEntry.harmonicMix) {
      for (const harmonic of paletteEntry.harmonicMix.harmonics) {
        const harmonicOscillator = this.audioContext.createOscillator();
        harmonicOscillator.type = paletteEntry.waveType; // Use same wave type for harmonics
        harmonicOscillator.frequency.value = harmonic.frequency * frequency;
        oscillators.push(harmonicOscillator);
      }
    }

    return oscillators;
  }

  /**
   * Creates gain nodes with ADSR envelopes for the given oscillators.
   * @param oscillators - Array of oscillator nodes to create gain nodes for
   * @param paletteEntry - The audio palette entry defining envelope and harmonic amplitudes
   * @param volume - The base volume level
   * @param duration - The duration of the audio in seconds
   * @returns Array of configured gain nodes
   */
  private createGainNodes(
    oscillators: OscillatorNode[],
    paletteEntry: AudioPaletteEntry,
    volume: number,
    duration: number,
  ): GainNode[] {
    const gainNodes: GainNode[] = [];
    const startTime = this.audioContext.currentTime;
    const currentVolume = this.getVolume();

    for (let i = 0; i < oscillators.length; i++) {
      const gainNode = this.audioContext.createGain();

      // Apply timbre modulation envelope or use default
      let oscillatorVolume = currentVolume;

      if (i === 0) {
        // Primary oscillator - use fundamental amplitude if specified
        if (paletteEntry.harmonicMix) {
          oscillatorVolume *= paletteEntry.harmonicMix.fundamental;
        }
      } else {
        // Harmonic oscillator - use harmonic amplitude
        const harmonic = paletteEntry.harmonicMix!.harmonics[i - 1];
        oscillatorVolume *= harmonic.amplitude;
      }

      // Create ADSR envelope using the shared helper function
      const envelope = this.createAdsrEnvelope(
        gainNode,
        paletteEntry,
        oscillatorVolume,
        startTime,
        duration,
      );

      // Apply envelope curve only if we haven't already used precise scheduling
      if (envelope !== null) {
        gainNode.gain.setValueCurveAtTime(envelope, startTime, duration);
      }
      gainNodes.push(gainNode);
    }

    return gainNodes;
  }

  /**
   * Creates and plays an oscillator with spatial panning and optional custom audio palette.
   * @param frequency - Frequency in Hz for the oscillator
   * @param panning - Stereo panning value between -1 (left) and 1 (right)
   * @param paletteEntry - Optional audio palette entry for custom wave types
   * @returns Audio ID for tracking the playing oscillator
   */
  private playOscillator(
    frequency: number,
    panning: number = 0,
    paletteEntry?: AudioPaletteEntry,
  ): AudioId {
    const duration = DEFAULT_DURATION;
    const volume = this.getVolume();

    // Use base palette entry (index 0) if no palette entry provided (for backwards compatibility)
    if (!paletteEntry) {
      paletteEntry = this.audioPalette.getPaletteEntry(0);
    }

    const oscillators: OscillatorNode[] = this.createOscillators(
      paletteEntry,
      frequency,
    );
    const gainNodes: GainNode[] = this.createGainNodes(
      oscillators,
      paletteEntry,
      volume,
      duration,
    );

    // Pane the audio.
    const stereoPannerNode = this.audioContext.createStereoPanner();
    stereoPannerNode.pan.value = panning;

    // Coordinate the audio slightly in front of the listener.
    const pannerNode = new PannerNode(this.audioContext, {
      distanceModel: 'linear',
      positionX: 0.0,
      positionY: 0.0,
      positionZ: 0.0,
      orientationX: 0.0,
      orientationY: 0.0,
      orientationZ: -1.0,
      refDistance: 1,
      maxDistance: 1e4,
      rolloffFactor: 10,
      coneInnerAngle: 40,
      coneOuterAngle: 50,
      coneOuterGain: 0.4,
    });

    // Create and start the audio graph.
    for (let i = 0; i < oscillators.length; i++) {
      oscillators[i].connect(gainNodes[i]);
      gainNodes[i].connect(stereoPannerNode);
    }
    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    // Start all oscillators
    oscillators.forEach(osc => osc.start());

    // Clean up after the audio stops.
    const cleanUp = (audioId: AudioId): void => {
      pannerNode.disconnect(this.compressor);
      stereoPannerNode.disconnect(pannerNode);

      for (let i = 0; i < oscillators.length; i++) {
        gainNodes[i].disconnect(stereoPannerNode);
        oscillators[i].stop();
        oscillators[i].disconnect(gainNodes[i]);
      }

      this.activeAudioIds.delete(audioId);
    };
    const audioId = setTimeout(() => cleanUp(audioId), duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, oscillators);
    return audioId;
  }

  /**
   * Creates an ADSR envelope for gain modulation or returns a default curve.
   * @param gainNode - Gain node to apply envelope to
   * @param paletteEntry - Audio palette entry with timbre modulation settings
   * @param volume - Base volume level
   * @param startTime - Start time in audio context time
   * @param duration - Total duration in seconds
   * @returns Envelope curve array or null if precise scheduling was used
   */
  private createAdsrEnvelope(
    gainNode: GainNode,
    paletteEntry: AudioPaletteEntry | undefined,
    volume: number,
    startTime: number,
    duration: number,
  ): number[] | null {
    if (paletteEntry?.timbreModulation) {
      // Create ADSR envelope with proper timing
      const { attack, decay, sustain, release } = paletteEntry.timbreModulation;
      const attackTime = duration * attack;
      const decayTime = duration * decay;
      const releaseTime = duration * release;
      const sustainTime = duration - attackTime - decayTime - releaseTime;

      // Use Web Audio API's precise ADSR envelope scheduling
      gainNode.gain.setValueAtTime(1e-4 * volume, startTime);

      // Attack phase - ramp up to full volume
      gainNode.gain.linearRampToValueAtTime(volume, startTime + attackTime);

      // Decay phase - ramp down to sustain level
      gainNode.gain.linearRampToValueAtTime(
        sustain * volume,
        startTime + attackTime + decayTime,
      );

      // Sustain phase - hold at sustain level (only if sustainTime > 0)
      if (sustainTime > 0) {
        gainNode.gain.setValueAtTime(
          sustain * volume,
          startTime + attackTime + decayTime + sustainTime,
        );
      }

      // Release phase - ramp down to silence
      gainNode.gain.linearRampToValueAtTime(
        1e-4 * volume,
        startTime + duration,
      );

      // Return null to indicate we used precise scheduling
      return null;
    } else {
      // Use default envelope curve for simple audio
      return [
        0.5 * volume,
        volume,
        0.5 * volume,
        0.5 * volume,
        0.5 * volume,
        0.1 * volume,
        1e-4 * volume,
      ];
    }
  }

  /**
   * Plays a smooth continuous tone by sweeping through multiple frequency values.
   * @param values - Array of values to map to frequencies
   * @param min - Minimum value in the data range
   * @param max - Maximum value in the data range
   * @param size - Total size for panning calculation
   * @param index - Current position for panning
   * @param paletteEntry - Optional audio palette entry for custom wave types
   */
  private playSmooth(
    values: number[],
    min: number,
    max: number,
    size: number,
    index: number,
    paletteEntry?: AudioPaletteEntry,
  ): void {
    const ctx = this.audioContext;
    const startTime = ctx.currentTime;
    const duration = DEFAULT_DURATION;
    const freqRange = this.getFrequencyRange();
    const currentVolume = this.getVolume();

    // Use default sine wave if no palette entry provided
    const waveType = paletteEntry?.waveType || 'sine';

    // Normalize values to frequency
    const freqs = values.map(v =>
      this.interpolate(
        v,
        { min, max },
        freqRange,
      ),
    );

    // Ensure minimum of 2 frequencies
    if (freqs.length < 2) {
      freqs.push(freqs[0]);
    }

    // Calculate stereo pan (-1 to 1)
    const pan = this.clamp(
      this.interpolate(index, { min: 0, max: size - 1 }, { min: -1, max: 1 }),
      -1,
      1,
    );

    // Oscillator
    const oscillator = ctx.createOscillator();
    oscillator.type = waveType;
    oscillator.frequency.setValueCurveAtTime(freqs, startTime, duration);

    // Gain envelope - use shared ADSR helper function
    const gainNode = ctx.createGain();
    const envelope = this.createAdsrEnvelope(
      gainNode,
      paletteEntry,
      currentVolume,
      startTime,
      duration,
    );

    // Apply envelope curve only if we haven't already used precise scheduling
    if (envelope !== null) {
      gainNode.gain.setValueCurveAtTime(envelope, startTime, duration);
    }

    // Panner
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    // Connect and play
    oscillator.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.compressor);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    const audioId = setTimeout(
      () => {
        oscillator.disconnect();
        gainNode.disconnect();
        panner.disconnect();
        this.activeAudioIds.delete(audioId);
      },
      duration * 1000 * 2,
    );

    this.activeAudioIds.set(audioId, [oscillator]);
  }

  /**
   * Plays a spatialized tone indicating an empty or out-of-bounds state.
   * @param size - Total size for panning calculation
   * @param index - Current position for spatial positioning
   * @returns Audio ID for tracking the playing tone
   */
  private playEmptyTone(size: number, index: number): AudioId {
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.2;
    const currentVolume = this.getVolume();

    const frequencies = [500, 1000, 1500, 2100, 2700];
    const gains = [1, 0.6, 0.4, 0.2, 0.1];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3 * currentVolume, now);
    masterGain.gain.exponentialRampToValueAtTime(0.01 * currentVolume, now + duration);
    masterGain.connect(this.compressor);

    const fromPanning = { min: 0, max: size };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(index, fromPanning, toPanning), -1, 1);

    const oscillators: OscillatorNode[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const stereoPannerNode = this.audioContext.createStereoPanner();
      const pannerNode = new PannerNode(this.audioContext, {
        distanceModel: 'linear',
        positionX: 0.0,
        positionY: 0.0,
        positionZ: 0.0,
        orientationX: 0.0,
        orientationY: 0.0,
        orientationZ: -1.0,
        refDistance: 1,
        maxDistance: 1e4,
        rolloffFactor: 10,
        coneInnerAngle: 40,
        coneOuterAngle: 50,
        coneOuterGain: 0.4,
      });

      osc.frequency.value = frequencies[i];
      osc.type = 'sine';

      gain.gain.setValueAtTime(gains[i] * currentVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001 * currentVolume, now + duration);

      stereoPannerNode.pan.value = panning;

      osc.connect(gain);
      gain.connect(stereoPannerNode);
      stereoPannerNode.connect(pannerNode);
      pannerNode.connect(masterGain);

      osc.start(now);
      osc.stop(now + duration);

      oscillators.push(osc);
    }

    const cleanUp = (audioId: AudioId): void => {
      masterGain.disconnect();
      oscillators.forEach((osc) => {
        osc.disconnect();
      });
      this.activeAudioIds.delete(audioId);
    };

    const audioId = setTimeout(() => cleanUp(audioId), duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, oscillators);
    return audioId;
  }

  /**
   * Plays a distinctive tone indicating a zero value.
   * @returns Audio ID for tracking the playing tone
   */
  private playZeroTone(): AudioId {
    // Always use original triangle wave for zero values, regardless of groups
    return this.playOscillator(NULL_FREQUENCY, 0, { index: DEFAULT_PALETTE_INDEX, waveType: 'triangle' });
  }

  /**
   * Plays a periodic waiting tone at regular intervals.
   * @returns Audio ID for tracking the interval
   */
  public playWaitingTone(): AudioId {
    return setInterval(
      () => this.playOscillator(WAITING_FREQUENCY, 0, { index: DEFAULT_PALETTE_INDEX, waveType: 'sine' }),
      1000,
    );
  }

  /**
   * Plays a completion tone to signal the end of a process.
   * @returns Audio ID for tracking the playing tone
   */
  public playCompleteTone(): AudioId {
    return this.playOscillator(COMPLETE_FREQUENCY, 0, { index: DEFAULT_PALETTE_INDEX, waveType: 'sine' });
  }

  /**
   * Linearly interpolates a value from one range to another.
   * @param value - Value to interpolate
   * @param from - Source range
   * @param to - Target range
   * @returns Interpolated value in the target range
   */
  private interpolate(value: number, from: Range, to: Range): number {
    if (from.min === 0 && from.max === 0) {
      return 0;
    }

    return (
      ((value - from.min) / (from.max - from.min)) * (to.max - to.min) + to.min
    );
  }

  /**
   * Clamps a value between minimum and maximum bounds.
   * @param value - Value to clamp
   * @param from - Minimum bound
   * @param to - Maximum bound
   * @returns Clamped value
   */
  private clamp(value: number, from: number, to: number): number {
    return Math.max(from, Math.min(value, to));
  }

  /**
   * Toggles audio mode between OFF, SEPARATE, and COMBINED modes.
   */
  public toggle(): void {
    switch (this.mode) {
      case AudioMode.OFF:
        this.mode = this.isCombinedAudio
          ? AudioMode.COMBINED
          : AudioMode.SEPARATE;
        break;

      case AudioMode.SEPARATE:
        this.mode = AudioMode.OFF;
        break;

      case AudioMode.COMBINED:
        this.mode = AudioMode.SEPARATE;
        break;
    }

    const mode
      = this.isCombinedAudio && this.mode === AudioMode.SEPARATE
        ? 'separate'
        : this.mode;
    const message = `Sound is ${mode}`;
    this.notification.notify(message);
  }

  /**
   * Stops one or more active audio streams by their IDs.
   * @param audioId - Single audio ID or array of audio IDs to stop
   */
  public stop(audioId: AudioId | AudioId[]): void {
    const audioIds = Array.isArray(audioId) ? audioId : [audioId];
    audioIds.forEach((audioId) => {
      const activeNodes = this.activeAudioIds.get(audioId);
      if (!activeNodes) {
        clearInterval(audioId);
        return;
      }

      activeNodes.forEach((node) => {
        node?.disconnect();
        node?.stop();
      });

      clearTimeout(audioId);
      this.activeAudioIds.delete(audioId);
    });
  }

  /**
   * Stops all currently playing audio streams.
   */
  private stopAll(): void {
    this.activeAudioIds.entries().forEach(([audioId, nodes]) => {
      clearTimeout(audioId);
      nodes.forEach((node) => {
        node.disconnect();
        node.stop();
      });
    });
    this.activeAudioIds.clear();
  }

  /**
   * Plays multiple tones simultaneously at the same frequency using different wave types.
   * @param tones - Array of audio states representing intersecting lines
   */
  public playSimultaneousTones(
    tones: AudioState[],
  ): void {
    const baseVolume = this.getVolume();
    const duration = DEFAULT_DURATION;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const freqRange = this.getFrequencyRange();

    // --- REGULARIZED FREQUENCY ---
    // Use the value from the first tone as the shared value (all intersecting lines have same (x, y))
    const sharedValue = Array.isArray(tones[0].value)
      ? (tones[0].value[1] ?? tones[0].value[0])
      : (tones[0].value as number);
    const sharedMin = tones[0].min;
    const sharedMax = tones[0].max;
    const sharedFrequency = this.interpolate(
      sharedValue,
      { min: sharedMin, max: sharedMax },
      freqRange,
    );

    tones.forEach((tone, idx) => {
      // All tones use the same frequency for intersection
      const frequency = sharedFrequency;

      // Use AudioPaletteService for maximum distinction
      const paletteEntry = this.audioPalette.getPaletteEntry(idx);
      const waveType = paletteEntry.waveType;

      // Simple oscillator with assigned wave type
      const oscillator = ctx.createOscillator();
      oscillator.type = waveType;
      oscillator.frequency.value = frequency;

      // Simple gain node
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(baseVolume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01 * baseVolume, now + duration);

      // Connect and play
      oscillator.connect(gainNode);
      gainNode.connect(this.compressor);

      oscillator.start(now);
      oscillator.stop(now + duration);

      // Clean up
      const audioId = setTimeout(() => {
        oscillator.disconnect();
        gainNode.disconnect();
      }, duration * 1000 * 2);

      this.activeAudioIds.set(audioId, [oscillator]);
    });
  }
}
