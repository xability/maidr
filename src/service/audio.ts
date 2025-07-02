import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import type { AudioPaletteEntry } from './audioPalette';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { AudioPaletteIndex, AudioPaletteService } from './audioPalette';

interface Range {
  min: number;
  max: number;
}

type AudioId = ReturnType<typeof setTimeout>;

const NULL_FREQUENCY = 100;
const WAITING_FREQUENCY = 440;
const COMPLETE_FREQUENCY = 880;

const DEFAULT_DURATION = 0.3;
const DEFAULT_PALETTE_INDEX = AudioPaletteIndex.SINE_BASIC;

enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

export class AudioService
implements Observer<SubplotState | TraceState>, Observer<Settings>, Disposable {
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

  public dispose(): void {
    this.stopAll();
    this.audioPalette.dispose();
    if (this.audioContext.state !== 'closed') {
      this.compressor.disconnect();
      void this.audioContext.close();
    }
    this.settings.removeObserver(this);
  }

  public update(state: Settings | SubplotState | TraceState): void {
    if ('general' in state) {
      this.onSettingsChange(state);
    } else {
      this.onStateChange(state);
    }
  }

  private onSettingsChange(settings: Settings): void {
    this.currentVolume = settings.general.volume / 100;
    this.currentMinFrequency = settings.general.minFrequency;
    this.currentMaxFrequency = settings.general.maxFrequency;
  }

  private onStateChange(state: SubplotState | TraceState): void {
    this.updateMode(state);
    // TODO: Clean up previous audio state once syncing with Autoplay interval.

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF || state.type !== 'trace') {
      return;
    }

    if (state.empty) {
      this.playEmptyTone(state.audio.size, state.audio.index);
      return;
    }

    const audio = state.audio;
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
        audio.slope,
        audio.navigationDirection,
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

  private getVolume(): number {
    return Math.min(Math.max(this.currentVolume, 0), 1);
  }

  private getFrequencyRange(): { min: number; max: number } {
    return {
      min: this.currentMinFrequency,
      max: this.currentMaxFrequency,
    };
  }

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

  private playSmooth(
    values: number[],
    min: number,
    max: number,
    size: number,
    index: number,
    paletteEntry?: AudioPaletteEntry,
    slope?: number,
    navigationDirection?: 'FORWARD' | 'BACKWARD',
  ): void {
    const ctx = this.audioContext;
    const startTime = ctx.currentTime;
    const duration = DEFAULT_DURATION;
    const freqRange = this.getFrequencyRange();
    const currentVolume = this.getVolume();

    // Use default sine wave if no palette entry provided
    const waveType = paletteEntry?.waveType || 'sine';

    // Create slope-based frequency transitions if slope information is available
    let freqs: number[];
    if (slope !== undefined) {
      // Use slope to create angled continuous sound
      freqs = this.createSlopeBasedFrequencies(values, min, max, freqRange, slope, navigationDirection);
    } else {
      // Fallback to original smooth interpolation
      freqs = values.map(v =>
        this.interpolate(
          v,
          { min, max },
          freqRange,
        ),
      );
    }

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
   * Creates slope-based frequency transitions for angled continuous sound.
   * @param values Array of Y values [prev, curr, next]
   * @param min Minimum Y value for normalization
   * @param max Maximum Y value for normalization
   * @param freqRange Frequency range object
   * @param freqRange.min Minimum frequency value
   * @param freqRange.max Maximum frequency value
   * @param slope Calculated slope value
   * @param navigationDirection Direction of navigation ('FORWARD' or 'BACKWARD')
   * @returns Array of frequencies representing the slope-based audio
   */
  private createSlopeBasedFrequencies(
    values: number[],
    min: number,
    max: number,
    freqRange: { min: number; max: number },
    slope: number,
    navigationDirection?: 'FORWARD' | 'BACKWARD',
  ): number[] {
    if (values.length < 3) {
      // Fallback to basic interpolation if insufficient data
      return values.map(v => this.interpolate(v, { min, max }, freqRange));
    }

    const [prev, curr, next] = values;

    // Normalize slope for audio processing
    const dataRange = max - min;
    const normalizedSlope = dataRange > 0 ? slope / dataRange : 0;

    // Create frequency transitions based on slope direction
    // Positive slope = increasing frequency, Negative slope = decreasing frequency
    const startFreq = this.interpolate(prev, { min, max }, freqRange);
    const endFreq = this.interpolate(next, { min, max }, freqRange);
    const currentFreq = this.interpolate(curr, { min, max }, freqRange);

    // Generate frequency curve that emphasizes the slope direction
    const numPoints = 8; // Number of intermediate points for smooth transition
    const frequencies: number[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;

      // Create a frequency curve that reflects the slope
      let frequency: number;

      if (normalizedSlope > 0) {
        // Upward slope: create increasing frequency pattern
        const slopeIntensity = Math.min(Math.abs(normalizedSlope) * 2, 1); // Cap intensity
        frequency = this.interpolate(
          t * slopeIntensity + (1 - slopeIntensity) * 0.5,
          { min: 0, max: 1 },
          { min: startFreq, max: endFreq },
        );
      } else if (normalizedSlope < 0) {
        // Downward slope: create decreasing frequency pattern
        const slopeIntensity = Math.min(Math.abs(normalizedSlope) * 2, 1); // Cap intensity
        frequency = this.interpolate(
          (1 - t) * slopeIntensity + (1 - slopeIntensity) * 0.5,
          { min: 0, max: 1 },
          { min: endFreq, max: startFreq },
        );
      } else {
        // Flat slope: maintain current frequency
        frequency = currentFreq;
      }

      frequencies.push(frequency);
    }

    // Reverse frequency array if moving backward to maintain directional consistency
    if (navigationDirection === 'BACKWARD') {
      frequencies.reverse();
    }

    return frequencies;
  }

  /**
   * Plays a spatialized tone indicating an "empty" or out-of-bounds state.
   *
   * Panning Calculation:
   * The `index` is interpolated within the range `[0, size]` to a stereo pan range `[-1, 1]`.
   * This allows the tone to be played with directional spatial cues, helping users infer
   * where the empty state occurs within the overall layout.
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

  private playZeroTone(): AudioId {
    // Always use original triangle wave for zero values, regardless of groups
    return this.playOscillator(NULL_FREQUENCY, 0, { index: DEFAULT_PALETTE_INDEX, waveType: 'triangle' });
  }

  public playWaitingTone(): AudioId {
    return setInterval(
      () => this.playOscillator(WAITING_FREQUENCY, 0, { index: DEFAULT_PALETTE_INDEX, waveType: 'sine' }),
      1000,
    );
  }

  public playCompleteTone(): AudioId {
    return this.playOscillator(COMPLETE_FREQUENCY, 0, { index: DEFAULT_PALETTE_INDEX, waveType: 'sine' });
  }

  private interpolate(value: number, from: Range, to: Range): number {
    if (from.min === 0 && from.max === 0) {
      return 0;
    }

    return (
      ((value - from.min) / (from.max - from.min)) * (to.max - to.min) + to.min
    );
  }

  private clamp(value: number, from: number, to: number): number {
    return Math.max(from, Math.min(value, to));
  }

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
}
