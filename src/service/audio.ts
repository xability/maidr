import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { AudioState, PlotState } from '@type/state';
import type { AudioPaletteEntry } from './audioPalette';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { AudioPaletteIndex, AudioPaletteService } from './audioPalette';

interface Range {
  min: number;
  max: number;
}

interface SpatialPosition {
  x: number;
  y: number;
}

interface Frequency {
  raw: number | number[];
  min: number;
  max: number;
}

interface Panning {
  x: number;
  y: number;
  rows: number;
  cols: number;
}

type AudioId = ReturnType<typeof setTimeout>;

const NULL_FREQUENCY = 100;
const WAITING_FREQUENCY = 440;
const COMPLETE_FREQUENCY = 880;

// Warning
const WARNING_FREQUENCY = 180;
const WARNING_DURATION = 0.2;
const WARNING_SPACE = 0.1;

const DEFAULT_DURATION = 0.3;
const DEFAULT_PALETTE_INDEX = AudioPaletteIndex.SINE_BASIC;

enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

enum AudioSettings {
  VOLUME = 'general.volume',
  ECHO_COUNT = 'general.echoCount',
  ECHO_VOLUME = 'general.echoVolume',
  ECHO_DURATION = 'general.echoDuration',
  MIN_FREQUENCY = 'general.minFrequency',
  MAX_FREQUENCY = 'general.maxFrequency',
}

// Synthetic impulse response parameters (reference: ellvix/reverb-testing).
const REVERB_IR_DECAY = 2;
const REVERB_IR_DURATION = 1.5;
// Per-echo reverb ramp. The original tone gets none; each subsequent echo's
// wet-gain and tail length scale with its position out of `maxEchoCount`,
// reaching these caps at the conceptual final echo position. Kept subtle on
// purpose — the echoes themselves carry the 3D cue, the reverb is colour.
const MAX_ECHO_REVERB_WET = 1.6;
const MAX_ECHO_REVERB_TAIL = 0.3;

/**
 * Service responsible for audio sonification of plot data.
 * Implements the Observer pattern to receive state updates from plot models
 * and converts data values to audio frequencies with spatial panning.
 *
 * Features:
 * - Frequency mapping based on data value ranges
 * - Stereo panning based on x-position in plot
 * - Distinct timbres for multiclass/multiline plots via AudioPaletteService
 * - ADSR envelope shaping for natural tone attack/decay
 * - Simultaneous tone playback for intersection points
 * - Warning and notification tones for boundaries and completion
 */
export class AudioService implements Observer<PlotState>, Disposable {
  private readonly notification: NotificationService;
  private readonly audioPalette: AudioPaletteService;

  private isCombinedAudio: boolean;
  private mode: AudioMode;
  private readonly activeAudioIds: Map<AudioId, OscillatorNode | OscillatorNode[]>;
  // Pending setTimeouts for queued echoes. Tracked separately from
  // activeAudioIds so navigation can cancel queued echoes without disturbing
  // already-sounding tones.
  private readonly pendingEchoTimeouts: Set<AudioId>;

  private volume: number;
  private maxEchoCount: number;
  // Multiplier (0-1) applied to the main tone's volume for the Nth echo.
  // Each echo position lerps from 1.0 (original tone) to this value at i = maxEchoCount.
  private echoVolume: number;
  // Delay between successive echoes, in seconds.
  private echoDuration: number;
  private minFrequency: number;
  private maxFrequency: number;
  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;
  private reverbIR: AudioBuffer | null = null;

  /**
   * Creates an instance of AudioService.
   * Initializes the Web Audio API context, compressor, and audio palette.
   * Subscribes to settings changes for volume and frequency range updates.
   *
   * @param notification - Service for displaying audio mode notifications to users
   * @param settings - Service providing user preferences for volume and frequency range
   * @param state - Initial plot state used to configure audio mode
   */
  public constructor(notification: NotificationService, settings: SettingsService, state: PlotState) {
    this.notification = notification;
    this.audioPalette = new AudioPaletteService();

    this.isCombinedAudio = false;
    this.mode = AudioMode.SEPARATE;
    this.updateMode(state);
    this.activeAudioIds = new Map();
    this.pendingEchoTimeouts = new Set();

    this.volume = this.normalizeVolume(settings.get<number>(AudioSettings.VOLUME));
    this.maxEchoCount = this.normalizeEchoCount(settings.get<number>(AudioSettings.ECHO_COUNT));
    this.echoVolume = this.normalizeEchoVolume(settings.get<number>(AudioSettings.ECHO_VOLUME));
    this.echoDuration = this.normalizeEchoDuration(settings.get<number>(AudioSettings.ECHO_DURATION));
    this.minFrequency = settings.get<number>(AudioSettings.MIN_FREQUENCY);
    this.maxFrequency = settings.get<number>(AudioSettings.MAX_FREQUENCY);
    settings.onChange((event) => {
      if (event.affectsSetting(AudioSettings.VOLUME)) {
        this.volume = this.normalizeVolume(event.get<number>(AudioSettings.VOLUME));
      }
      if (event.affectsSetting(AudioSettings.ECHO_COUNT)) {
        this.maxEchoCount = this.normalizeEchoCount(event.get<number>(AudioSettings.ECHO_COUNT));
      }
      if (event.affectsSetting(AudioSettings.ECHO_VOLUME)) {
        this.echoVolume = this.normalizeEchoVolume(event.get<number>(AudioSettings.ECHO_VOLUME));
      }
      if (event.affectsSetting(AudioSettings.ECHO_DURATION)) {
        this.echoDuration = this.normalizeEchoDuration(event.get<number>(AudioSettings.ECHO_DURATION));
      }
      if (event.affectsSetting(AudioSettings.MIN_FREQUENCY)) {
        this.minFrequency = event.get<number>(AudioSettings.MIN_FREQUENCY);
      }
      if (event.affectsSetting(AudioSettings.MAX_FREQUENCY)) {
        this.maxFrequency = event.get<number>(AudioSettings.MAX_FREQUENCY);
      }
    });

    this.audioContext = new AudioContext();
    this.compressor = this.initCompressor();
  }

  /**
   * Disposes of all audio resources and cleans up the service.
   * Stops all active audio, disposes the audio palette, disconnects
   * the compressor, and closes the AudioContext.
   */
  public dispose(): void {
    this.stopAll();
    this.audioPalette.dispose();

    if (this.audioContext.state !== 'closed') {
      this.compressor.disconnect();
      void this.audioContext.close();
    }
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

  /**
   * Observer callback invoked when plot state changes.
   * Plays appropriate audio based on the current data point, including:
   * - Empty/warning tones for out-of-bounds navigation
   * - Simultaneous tones for multiline intersection points
   * - Single tones with frequency mapped to data value
   * - Continuous smooth tones for violin/density plots
   *
   * @param state - The updated plot state containing audio parameters
   */
  public update(state: PlotState): void {
    this.updateMode(state);
    // TODO: Clean up previous audio state once syncing with Autoplay interval.

    // Cancel any echoes queued from the previous navigation so they don't
    // bleed into the new point's playback. Already-sounding tones are left
    // alone to avoid an audible click from cutting them off mid-envelope.
    this.cancelPendingEchoes();

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF) {
      return;
    }

    if (state.empty) {
      if (state.warning) {
        this.playWarningTone();
      } else if (state.type === 'trace' && state.audio) {
        // Use the panning from state.audio which contains the boundary position
        this.playEmptyTone({
          x: state.audio.x,
          y: state.audio.y,
          rows: state.audio.rows,
          cols: state.audio.cols,
        });
      } else {
        // Subplot/Figure empty state - no spatial audio info available
        this.playEmptyTone({ x: 0, y: 0, rows: 1, cols: 1 });
      }
      return;
    }
    if (state.type !== 'trace') {
      return;
    }

    // Handle intersection logic for multiline plots
    if (
      state.traceType === 'line'
      && !state.empty
      && Array.isArray(state.intersections)
      && state.intersections.length > 1
    ) {
      this.stopAll();
      this.playSimultaneousTones(state.intersections);
      return;
    }

    const audio = state.audio;

    // Resolve palette entry from group index or candlestick trend
    let groupIndex = audio.group;
    if (audio.trend && groupIndex === undefined) {
      groupIndex = this.audioPalette.getCandlestickGroupIndex(audio.trend);
    }
    const paletteEntry = groupIndex !== undefined
      ? this.audioPalette.getPaletteEntry(groupIndex)
      : undefined;

    if (audio.isContinuous) {
      this.playSmooth(
        audio.freq,
        this.resolvePanning(audio.panning),
        paletteEntry,
        audio.volumeMultiplier,
        audio.volumeScale,
      );
    } else if (Array.isArray(audio.freq.raw)) {
      const values = audio.freq.raw as number[];
      if (values.length === 0) {
        this.playZeroTone(this.resolvePanning(audio.panning));
        return;
      }

      const zArray = Array.isArray(audio.zIntensity) ? audio.zIntensity : undefined;
      const zScalar = typeof audio.zIntensity === 'number' ? audio.zIntensity : undefined;

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;
      const activeIds = new Array<AudioId>();
      const playNext = (): void => {
        if (currentIndex < values.length) {
          const idx = currentIndex++;
          const toneFreq = {
            min: audio.freq.min,
            max: audio.freq.max,
            raw: values[idx],
          };
          const tonePanning = this.resolvePanning(audio.panning, idx);
          this.playTone(toneFreq, tonePanning, paletteEntry);
          const zForTone = zArray !== undefined ? zArray[idx] : zScalar;
          this.scheduleEchoes(toneFreq, tonePanning, paletteEntry, zForTone);
          activeIds.push(setTimeout(playNext, playRate));
        } else {
          this.stop(activeIds);
        }
      };

      playNext();
    } else {
      const value = audio.freq.raw as number;
      const panning = this.resolvePanning(audio.panning);
      if (value === 0) {
        this.playZeroTone(panning);
      } else {
        this.playTone(audio.freq, panning, paletteEntry);
        const zScalar = typeof audio.zIntensity === 'number' ? audio.zIntensity : undefined;
        this.scheduleEchoes(audio.freq, panning, paletteEntry, zScalar);
      }
    }
  }

  /**
   * Collapses AudioState.panning (whose x may be scalar or per-tone array) into
   * the local scalar-x Panning used by playback helpers. When x is an array and
   * idx is provided, selects that entry; otherwise falls back to the first entry.
   */
  private resolvePanning(panning: AudioState['panning'], idx?: number): Panning {
    const x = Array.isArray(panning.x)
      ? (panning.x[idx ?? 0] ?? 0)
      : panning.x;
    return {
      x,
      y: panning.y,
      rows: panning.rows,
      cols: panning.cols,
    };
  }

  private playTone(
    freq: Frequency,
    panning: Panning,
    paletteEntry?: AudioPaletteEntry,
    volumeScale: number = 1,
    reverbAmount: number = 0,
  ): AudioId {
    const fromFreq = { min: freq.min, max: freq.max };
    const toFreq = { min: this.minFrequency, max: this.maxFrequency };
    const frequency = this.interpolate(freq.raw as number, fromFreq, toFreq);

    const x = this.clamp(this.interpolate(panning.x, { min: 0, max: panning.cols - 1 }, { min: -1, max: 1 }), -1, 1);
    // Y-axis not used for stereo panning
    return this.playOscillator(frequency, { x, y: 0 }, paletteEntry, volumeScale, reverbAmount);
  }

  /**
   * Creates an ADSR gain envelope for a palette entry, or returns a default curve.
   * When timbreModulation is present, uses precise Web Audio scheduling and returns null.
   * Otherwise, returns a value curve array for setValueCurveAtTime.
   */
  private createAdsrEnvelope(
    gainNode: GainNode,
    paletteEntry: AudioPaletteEntry | undefined,
    volume: number,
    startTime: number,
    duration: number,
  ): number[] | null {
    if (paletteEntry?.timbreModulation) {
      const { attack, decay, sustain, release } = paletteEntry.timbreModulation;
      const attackTime = duration * attack;
      const decayTime = duration * decay;
      const releaseTime = duration * release;
      const sustainTime = duration - attackTime - decayTime - releaseTime;

      gainNode.gain.setValueAtTime(1e-4 * volume, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + attackTime);
      gainNode.gain.linearRampToValueAtTime(
        sustain * volume,
        startTime + attackTime + decayTime,
      );
      if (sustainTime > 0) {
        gainNode.gain.setValueAtTime(
          sustain * volume,
          startTime + attackTime + decayTime + sustainTime,
        );
      }
      gainNode.gain.linearRampToValueAtTime(1e-4 * volume, startTime + duration);

      return null;
    } else {
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

  private playOscillator(
    frequency: number,
    position: SpatialPosition = { x: 0, y: 0 },
    paletteEntry?: AudioPaletteEntry,
    volumeScale: number = 1,
    reverbAmount: number = 0,
  ): AudioId {
    const duration = DEFAULT_DURATION;
    const startTime = this.audioContext.currentTime;

    // Fall back to default palette entry (sine) if none provided
    if (!paletteEntry) {
      paletteEntry = this.audioPalette.getPaletteEntry(DEFAULT_PALETTE_INDEX);
    }

    // Create oscillators from palette entry
    const oscillators: OscillatorNode[] = [];
    const gainNodes: GainNode[] = [];

    // Primary oscillator
    const primaryOsc = this.audioContext.createOscillator();
    primaryOsc.type = paletteEntry.waveType;
    primaryOsc.frequency.value = frequency;
    oscillators.push(primaryOsc);

    // Harmonic oscillators
    if (paletteEntry.harmonicMix) {
      for (const harmonic of paletteEntry.harmonicMix.harmonics) {
        const harmonicOsc = this.audioContext.createOscillator();
        harmonicOsc.type = paletteEntry.waveType;
        harmonicOsc.frequency.value = harmonic.frequency * frequency;
        oscillators.push(harmonicOsc);
      }
    }

    const scaledVolume = this.volume * Math.max(0, volumeScale);

    // Create gain nodes with ADSR envelope for each oscillator
    for (let i = 0; i < oscillators.length; i++) {
      const gainNode = this.audioContext.createGain();
      let oscillatorVolume = scaledVolume;

      if (i === 0) {
        // Primary oscillator uses fundamental amplitude
        if (paletteEntry.harmonicMix) {
          oscillatorVolume *= paletteEntry.harmonicMix.fundamental;
        }
      } else {
        // Harmonic oscillator uses its amplitude
        const harmonic = paletteEntry.harmonicMix!.harmonics[i - 1];
        oscillatorVolume *= harmonic.amplitude;
      }

      const envelope = this.createAdsrEnvelope(
        gainNode,
        paletteEntry,
        oscillatorVolume,
        startTime,
        duration,
      );

      if (envelope !== null) {
        gainNode.gain.setValueCurveAtTime(envelope, startTime, duration);
      }

      gainNodes.push(gainNode);
    }

    // Use StereoPannerNode for smooth left-right stereo panning
    // This is simpler and more direct than PannerNode for stereo-only panning
    const stereoPanner = this.audioContext.createStereoPanner();
    stereoPanner.pan.value = position.x; // position.x is already -1 (left) to 1 (right)

    // Connect oscillators → gain nodes → stereo panner.
    for (let i = 0; i < oscillators.length; i++) {
      oscillators[i].connect(gainNodes[i]);
      gainNodes[i].connect(stereoPanner);
    }

    // Echoes layer a small reverb tail on top, scaled by their position out of
    // maxEchoCount so the effect ramps from none on the original tone to
    // MAX_ECHO_REVERB_* at the conceptual final echo. The dry path is left
    // unattenuated so echo volume stays controlled by `volumeScale` alone.
    const reverb = Math.max(0, Math.min(1, reverbAmount));
    const reverbActive = reverb > 0;
    const tailLen = reverbActive ? MAX_ECHO_REVERB_TAIL * reverb : 0;
    let convolver: ConvolverNode | null = null;
    let wetGain: GainNode | null = null;
    if (reverbActive) {
      convolver = this.audioContext.createConvolver();
      convolver.buffer = this.getReverbIR();

      const wetAmount = MAX_ECHO_REVERB_WET * reverb;
      wetGain = this.audioContext.createGain();
      wetGain.gain.setValueAtTime(wetAmount, startTime);
      wetGain.gain.setValueAtTime(wetAmount, startTime + duration);
      wetGain.gain.linearRampToValueAtTime(1e-4, startTime + duration + tailLen);

      stereoPanner.connect(this.compressor);
      stereoPanner.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(this.compressor);
    } else {
      stereoPanner.connect(this.compressor);
    }

    // Start all oscillators
    oscillators.forEach(osc => osc.start(startTime));

    const cleanUp = (audioId: AudioId): void => {
      stereoPanner.disconnect();
      wetGain?.disconnect();
      convolver?.disconnect();
      for (let i = 0; i < oscillators.length; i++) {
        oscillators[i].stop();
        oscillators[i].disconnect();
        gainNodes[i].disconnect();
      }
      this.activeAudioIds.delete(audioId);
    };

    // When reverb is active, wait for the tail to finish before tearing down
    // so it doesn't get clipped mid-fade.
    const lifetimeMs = reverbActive
      ? (duration + tailLen) * 1e3 + 50
      : duration * 1e3 * 2;
    const audioId = setTimeout(() => cleanUp(audioId), lifetimeMs);
    this.activeAudioIds.set(audioId, oscillators);
    return audioId;
  }

  /**
   * Schedules echo tones for a 3D point.
   *
   * Number of echoes scales with z: round(zIntensity * maxEchoCount). Each
   * echo at index i is identical to the original tone except the volume is
   * lerped between 1.0 (i=0, the original) and {@link echoVolume} (i=maxEchoCount).
   * Volumes are pinned to position, not count — the 2nd echo always sounds at
   * the same level whether 2 or 5 total echoes play. Echoes fire at i *
   * echoDuration after the original.
   *
   * Skipped entirely when zIntensity is undefined (non-3D traces) or 0, and
   * when maxEchoCount is 0.
   */
  private scheduleEchoes(
    freq: Frequency,
    panning: Panning,
    paletteEntry: AudioPaletteEntry | undefined,
    zIntensity: number | undefined,
  ): void {
    if (zIntensity === undefined || this.maxEchoCount <= 0) {
      return;
    }
    const z = Math.max(0, Math.min(1, zIntensity));
    const numEchoes = Math.round(z * this.maxEchoCount);
    if (numEchoes <= 0) {
      return;
    }

    for (let i = 1; i <= numEchoes; i++) {
      const delayMs = i * this.echoDuration * 1000;
      const positionFraction = i / this.maxEchoCount;
      const volumeScale = 1 - positionFraction * (1 - this.echoVolume);
      // Reverb ramps with echo position out of the configured max — so the
      // last echo when z = zMax gets the full small tail, while a mid-z
      // point's last echo gets a proportionally smaller one.
      const reverbAmount = positionFraction;
      const timeoutId: AudioId = setTimeout(() => {
        this.pendingEchoTimeouts.delete(timeoutId);
        this.playTone(freq, panning, paletteEntry, volumeScale, reverbAmount);
      }, delayMs);
      this.pendingEchoTimeouts.add(timeoutId);
    }
  }

  private cancelPendingEchoes(): void {
    this.pendingEchoTimeouts.forEach(id => clearTimeout(id));
    this.pendingEchoTimeouts.clear();
  }

  private playSmooth(
    freq: Frequency,
    panning: Panning,
    paletteEntry?: AudioPaletteEntry,
    volumeMultiplier?: number,
    volumeScale?: number,
  ): void {
    const ctx = this.audioContext;
    const startTime = ctx.currentTime;
    const duration = DEFAULT_DURATION;
    const freqs = (freq.raw as number[]).map(v =>
      this.interpolate(
        v,
        { min: freq.min, max: freq.max },
        { min: this.minFrequency, max: this.maxFrequency },
      ),
    );

    // Base volume from user settings (0–1, quadratic scaling)
    const baseVolume = this.volume;

    // Use volumeScale if provided (normalized 0-1 range), otherwise use volumeMultiplier.
    // volumeScale takes precedence as the preferred approach; volumeMultiplier is kept for backward compatibility.
    let currentVolume: number;
    if (volumeScale !== undefined) {
      currentVolume = baseVolume * Math.max(0, volumeScale);
    } else {
      // Fall back to volumeMultiplier for backward compatibility
      currentVolume = baseVolume * (volumeMultiplier ?? 1.0);
    }

    if (freqs.length < 2) {
      freqs.push(freqs[0]);
    }

    const xPos = this.clamp(this.interpolate(panning.x, { min: 0, max: panning.cols - 1 }, { min: -1, max: 1 }), -1, 1);

    // Use palette wave type if available, otherwise default sine
    const waveType = paletteEntry?.waveType || 'sine';

    const oscillator = ctx.createOscillator();
    oscillator.type = waveType;
    oscillator.frequency.setValueCurveAtTime(freqs, startTime, duration);

    // Apply ADSR envelope from palette entry or use default curve
    const gainNode = ctx.createGain();
    const envelope = this.createAdsrEnvelope(
      gainNode,
      paletteEntry,
      currentVolume,
      startTime,
      duration,
    );

    if (envelope !== null) {
      gainNode.gain.setValueCurveAtTime(envelope, startTime, duration);
    }

    // Use StereoPannerNode for smooth left-right stereo panning
    const stereoPanner = ctx.createStereoPanner();
    stereoPanner.pan.value = xPos; // xPos is already -1 to 1

    oscillator.connect(gainNode);
    gainNode.connect(stereoPanner);
    stereoPanner.connect(this.compressor);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    const audioId = setTimeout(() => {
      oscillator.disconnect();
      gainNode.disconnect();
      stereoPanner.disconnect();
      this.activeAudioIds.delete(audioId);
    }, duration * 1000 * 2);

    this.activeAudioIds.set(audioId, oscillator);
  }

  /**
   * Plays a spatialized tone indicating an "empty" or out-of-bounds state.
   * Uses multiple harmonic frequencies to create a distinct "null" sound.
   *
   * The panning position from the Panning object provides directional spatial cues,
   * helping users infer where the empty state occurs within the overall layout.
   *
   * @param panning - Position information for spatial audio placement
   * @returns AudioId for the played tone
   */
  private playEmptyTone(panning: Panning): AudioId {
    const xPos = this.interpolate(panning.x, { min: 0, max: panning.cols - 1 }, { min: -1, max: 1 });

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.2;

    // Use StereoPannerNode for smooth left-right stereo panning
    const stereoPanner = ctx.createStereoPanner();
    stereoPanner.pan.value = xPos; // xPos is already -1 to 1

    const frequencies = [500, 1000, 1500, 2100, 2700];
    const gains = [1, 0.6, 0.4, 0.2, 0.1];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3 * this.volume, now);
    masterGain.gain.exponentialRampToValueAtTime(0.01 * this.volume, now + duration);

    masterGain.connect(stereoPanner);
    stereoPanner.connect(this.compressor);

    const oscillators: OscillatorNode[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.value = frequencies[i];
      osc.type = 'sine';

      gain.gain.setValueAtTime(gains[i] * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + duration);

      oscillators.push(osc);
    }

    const cleanUp = (audioId: AudioId): void => {
      stereoPanner.disconnect();
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

  private playOneWarningBeep(freq: number, startTime: number): void {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;
    let vol = 1;
    if (osc.type !== 'sine')
      vol = 0.5;

    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + WARNING_DURATION);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(startTime);
    osc.stop(startTime + WARNING_DURATION);
  }

  /**
   * Plays a warning tone to indicate navigation boundary or invalid state.
   * Consists of two descending beeps (half-step down) to clearly signal a warning.
   */
  public playWarningTone(): void {
    const now = this.audioContext.currentTime;
    this.playOneWarningBeep(WARNING_FREQUENCY, now);
    this.playOneWarningBeep(WARNING_FREQUENCY / 2 ** (1 / 12), now + WARNING_SPACE); // half step down
    // setTimeout(() => this.audioContext.close(), (WARNING_SPACE + WARNING_DURATION + 0.1) * 1000);
  }

  /**
   * Plays a warning tone only if audio mode is enabled.
   * Use this for conditional warnings that should respect user's audio preferences.
   */
  public playWarningToneIfEnabled(): void {
    if (this.mode === AudioMode.OFF) {
      return;
    }
    this.playWarningTone();
  }

  private playZeroTone(panning: Panning): AudioId {
    const xPos = this.clamp(this.interpolate(panning.x, { min: 0, max: panning.cols - 1 }, { min: -1, max: 1 }), -1, 1);
    // Y-axis not used for stereo panning
    return this.playOscillator(NULL_FREQUENCY, { x: xPos, y: 0 }, { index: DEFAULT_PALETTE_INDEX, waveType: 'triangle' });
  }

  /**
   * Plays a repeating waiting tone to indicate an ongoing async operation.
   * The tone repeats every second until stopped.
   *
   * @returns AudioId that can be passed to stop() to cancel the waiting tone
   */
  public playWaitingTone(): AudioId {
    const paletteEntry = this.audioPalette.getPaletteEntry(DEFAULT_PALETTE_INDEX);
    return setInterval(
      () => this.playOscillator(WAITING_FREQUENCY, { x: 0, y: 0 }, paletteEntry),
      1000,
    );
  }

  /**
   * Plays a completion tone to indicate an async operation has finished.
   * Uses a higher frequency than the waiting tone for clear distinction.
   *
   * @returns AudioId for the played tone
   */
  public playCompleteTone(): AudioId {
    const paletteEntry = this.audioPalette.getPaletteEntry(DEFAULT_PALETTE_INDEX);
    return this.playOscillator(COMPLETE_FREQUENCY, { x: 0, y: 0 }, paletteEntry);
  }

  /**
   * Plays multiple tones simultaneously for intersection points in multiline plots.
   * Each intersecting line gets a distinct timbre from the audio palette.
   */
  private playSimultaneousTones(tones: AudioState[]): void {
    const duration = DEFAULT_DURATION;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Use the value from the first tone as the shared value (all intersecting lines share the same point)
    const sharedValue = Array.isArray(tones[0].freq.raw)
      ? (tones[0].freq.raw[1] ?? tones[0].freq.raw[0])
      : (tones[0].freq.raw as number);
    const sharedFrequency = this.interpolate(
      sharedValue,
      { min: tones[0].freq.min, max: tones[0].freq.max },
      { min: this.minFrequency, max: this.maxFrequency },
    );

    tones.forEach((tone, idx) => {
      const paletteEntry = this.audioPalette.getPaletteEntry(tone.group ?? idx);
      const waveType = paletteEntry.waveType;

      const oscillator = ctx.createOscillator();
      oscillator.type = waveType;
      oscillator.frequency.value = sharedFrequency;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(this.volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01 * this.volume, now + duration);

      oscillator.connect(gainNode);
      gainNode.connect(this.compressor);

      oscillator.start(now);
      oscillator.stop(now + duration);

      const audioId = setTimeout(() => {
        oscillator.disconnect();
        gainNode.disconnect();
        this.activeAudioIds.delete(audioId);
      }, duration * 1000 * 2);

      this.activeAudioIds.set(audioId, [oscillator]);
    });
  }

  private interpolate(value: number, from: Range, to: Range): number {
    if (from.min === from.max) {
      return to.min;
    }

    return (
      ((value - from.min) / (from.max - from.min)) * (to.max - to.min) + to.min
    );
  }

  private clamp(value: number, from: number, to: number): number {
    return Math.max(from, Math.min(value, to));
  }

  /**
   * Toggles the audio mode between off, separate, and combined states.
   * Cycles through modes and notifies the user of the current state.
   * - OFF: No audio playback
   * - SEPARATE: Sequential playback for multi-point data
   * - COMBINED: Simultaneous playback for multi-point data
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
   * Stops one or more active audio tones by their IDs.
   * Disconnects oscillators and clears associated timeouts/intervals.
   *
   * @param audioId - Single AudioId or array of AudioIds to stop
   */
  public stop(audioId: AudioId | AudioId[]): void {
    const audioIds = Array.isArray(audioId) ? audioId : [audioId];
    audioIds.forEach((audioId) => {
      const activeNode = this.activeAudioIds.get(audioId);
      if (!activeNode) {
        clearInterval(audioId);
        return;
      }
      const activeNodes = Array.isArray(activeNode) ? activeNode : [activeNode];
      activeNodes.forEach((node) => {
        node?.disconnect();
        node?.stop();
      });

      clearTimeout(audioId);
      this.activeAudioIds.delete(audioId);
    });
  }

  private stopAll(): void {
    this.cancelPendingEchoes();
    this.activeAudioIds.forEach((node, audioId) => {
      clearTimeout(audioId);
      const nodes = Array.isArray(node) ? node : [node];
      nodes.forEach((node) => {
        node.disconnect();
        node.stop();
      });
    });
    this.activeAudioIds.clear();
  }

  private normalizeVolume(volume: number): number {
    return (volume / 100) * (volume / 100);
  }

  /**
   * Clamps the configured maximum echo count to a non-negative integer.
   * 0 disables echoes entirely.
   */
  private normalizeEchoCount(value: number): number {
    if (!Number.isFinite(value)) {
      return 5;
    }
    return Math.max(0, Math.floor(value));
  }

  /**
   * Normalizes the echo-volume setting (0-100 percent) to a 0-1 multiplier
   * that's applied to the main tone volume for the Nth echo.
   */
  private normalizeEchoVolume(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, value / 100));
  }

  /**
   * Clamps the echo-duration setting to a sensible delay (in seconds) between
   * consecutive echoes. Floors well above zero so echoes are distinguishable.
   */
  private normalizeEchoDuration(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.3;
    }
    return Math.max(0.05, Math.min(2, value));
  }

  /**
   * Lazily builds a stereo impulse response (random noise × exponential decay).
   * Reference: https://github.com/ellvix/reverb-testing/blob/master/main.js
   */
  private getReverbIR(): AudioBuffer {
    if (this.reverbIR) {
      return this.reverbIR;
    }
    const rate = this.audioContext.sampleRate;
    const length = Math.max(1, Math.floor(rate * REVERB_IR_DURATION));
    const impulse = this.audioContext.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const channel = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        channel[i] = (Math.random() * 2 - 1) * (1 - i / length) ** REVERB_IR_DECAY;
      }
    }
    this.reverbIR = impulse;
    return impulse;
  }
}
