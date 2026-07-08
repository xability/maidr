import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { AudioState, PlotState, PointerGuidanceState } from '@type/state';
import type { AudioPaletteEntry } from './audioPalette';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { MathUtil } from '@util/math';
import { AudioPaletteIndex, AudioPaletteService } from './audioPalette';
import { resolvePointerGuidanceBeep } from './pointerGuidance';

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

// Menu open/close cue (Go-To modal). A short two-note "tick" arpeggio that
// reads as UI chrome — rising when the pull-down menu opens, falling when it
// closes — kept brighter and quieter than the low descending warning pair so
// the two are never confused.
const MENU_TONE_DURATION = 0.06; // snappy tick, matches the guidance beep length
const MENU_TONE_SPACE = 0.05; // gap so the two notes read as an arpeggio, not a chord
const MENU_TONE_VOLUME_SCALE = 0.5; // quieter than data tones: "this is navigation"
const MENU_OPEN_FREQUENCIES = [660, 990]; // rising: menu drops down
const MENU_CLOSE_FREQUENCIES = [990, 660]; // falling: menu retracts

// 60 ms is short enough that rapid beeps don't blur together at the fastest
// throttle interval, while still being long enough to be clearly audible as
// a discrete tone rather than a click.
const POINTER_GUIDANCE_BEEP_DURATION = 0.06;
// 35 % of the master volume keeps guidance audibly quieter than data tones,
// so the user perceives it as a navigational cue rather than as data.
const POINTER_GUIDANCE_VOLUME = 0.35;

const DEFAULT_DURATION = 0.3;
const DEFAULT_PALETTE_INDEX = AudioPaletteIndex.SINE_BASIC;

enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

enum AudioSettings {
  VOLUME = 'general.volume',
  MIN_FREQUENCY = 'general.minFrequency',
  MAX_FREQUENCY = 'general.maxFrequency',
}

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
  private readonly activeAudioIds: Map<AudioId, AudioNode | AudioNode[]>;

  private volume: number;
  private minFrequency: number;
  private maxFrequency: number;
  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;
  private nextPointerGuidanceBeepAt: number;

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

    this.volume = this.normalizeVolume(settings.get<number>(AudioSettings.VOLUME));
    this.minFrequency = settings.get<number>(AudioSettings.MIN_FREQUENCY);
    this.maxFrequency = settings.get<number>(AudioSettings.MAX_FREQUENCY);
    settings.onChange((event) => {
      if (event.affectsSetting(AudioSettings.VOLUME)) {
        this.volume = this.normalizeVolume(event.get<number>(AudioSettings.VOLUME));
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
    this.nextPointerGuidanceBeepAt = 0;
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
        audio.panning,
        paletteEntry,
        audio.volumeMultiplier,
        audio.volumeScale,
      );
    } else if (Array.isArray(audio.freq.raw)) {
      const values = audio.freq.raw as number[];
      if (values.length === 0) {
        this.playZeroTone(audio.panning);
        return;
      }

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;
      const activeIds = new Array<AudioId>();
      const playNext = (): void => {
        if (currentIndex < values.length) {
          this.playTone(
            {
              min: audio.freq.min,
              max: audio.freq.max,
              raw: values[currentIndex++],
            },
            {
              x: audio.panning.x,
              y: audio.panning.y,
              rows: audio.panning.rows,
              cols: audio.panning.cols,
            },
            paletteEntry,
          );
          // Register the chain timer so stopAll()/dispose() can cancel a
          // pending step; otherwise a queued tone fires against a closed
          // AudioContext after disposal. The timer removes itself when it runs.
          const chainId = setTimeout(() => {
            this.activeAudioIds.delete(chainId);
            playNext();
          }, playRate);
          this.activeAudioIds.set(chainId, []);
          activeIds.push(chainId);
        } else {
          this.stop(activeIds);
        }
      };

      playNext();
    } else {
      const value = audio.freq.raw as number;
      if (value === 0) {
        // A trace can opt into a percussive click for exact zeros (e.g. the
        // candlestick delta layer, where zero means "on the reference line").
        if (audio.zeroClick) {
          this.playClickTone(audio.panning);
        } else {
          this.playZeroTone(audio.panning);
        }
      } else {
        this.playTone(audio.freq, audio.panning, paletteEntry);
      }
    }
  }

  private playTone(freq: Frequency, panning: Panning, paletteEntry?: AudioPaletteEntry): AudioId {
    const frequency = MathUtil.interpolate(freq.raw as number, freq.min, freq.max, this.minFrequency, this.maxFrequency);
    const x = MathUtil.clamp(MathUtil.interpolate(panning.x, 0, panning.cols - 1, -1, 1), -1, 1);
    // Y-axis not used for stereo panning
    return this.playOscillator(frequency, { x, y: 0 }, paletteEntry);
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

    // Create gain nodes with ADSR envelope for each oscillator
    for (let i = 0; i < oscillators.length; i++) {
      const gainNode = this.audioContext.createGain();
      let oscillatorVolume = this.volume;

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

    // Connect audio graph: oscillators → gain nodes → stereo panner → compressor
    for (let i = 0; i < oscillators.length; i++) {
      oscillators[i].connect(gainNodes[i]);
      gainNodes[i].connect(stereoPanner);
    }
    stereoPanner.connect(this.compressor);

    // Start all oscillators
    oscillators.forEach(osc => osc.start(startTime));

    const cleanUp = (audioId: AudioId): void => {
      stereoPanner.disconnect();
      for (let i = 0; i < oscillators.length; i++) {
        oscillators[i].stop();
        oscillators[i].disconnect();
        gainNodes[i].disconnect();
      }
      this.activeAudioIds.delete(audioId);
    };

    const audioId = setTimeout(() => cleanUp(audioId), duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, oscillators);
    return audioId;
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
      MathUtil.interpolate(v, freq.min, freq.max, this.minFrequency, this.maxFrequency),
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

    const xPos = MathUtil.clamp(MathUtil.interpolate(panning.x, 0, panning.cols - 1, -1, 1), -1, 1);

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
    // At volume 0 every exponential ramp target below collapses to 0, which
    // the Web Audio spec rejects with a RangeError. The tone would be silent
    // anyway, so skip scheduling and return a harmless, self-clearing id.
    if (this.volume <= 0) {
      const audioId = setTimeout(() => this.activeAudioIds.delete(audioId), 0);
      this.activeAudioIds.set(audioId, []);
      return audioId;
    }

    const xPos = MathUtil.interpolate(panning.x, 0, panning.cols - 1, -1, 1);

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
    // Scale by the user volume and route through the shared compressor chain
    // so boundary beeps match the loudness of data tones. A volume of 0 would
    // also make the exponential ramp target collapse to 0 (a RangeError).
    if (this.volume <= 0) {
      return;
    }

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(this.volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, startTime + WARNING_DURATION);

    osc.connect(gain);
    gain.connect(this.compressor);

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

  /**
   * Plays the "menu open" cue — a short rising two-note tick — when the Go-To
   * modal opens. A navigational affordance, so it plays in any audio mode
   * except OFF (mirroring playWarningToneIfEnabled).
   */
  public playMenuOpenTone(): void {
    this.playMenuTone(MENU_OPEN_FREQUENCIES);
  }

  /**
   * Plays the "menu close" cue — a short falling two-note tick — when the Go-To
   * modal is dismissed. Plays in any audio mode except OFF.
   */
  public playMenuCloseTone(): void {
    this.playMenuTone(MENU_CLOSE_FREQUENCIES);
  }

  /**
   * Schedules a sequence of short menu-cue beeps. Shared by the open/close
   * cues; the frequency order encodes direction (rising = open, falling = close).
   * @param frequencies - Beep frequencies in play order.
   */
  private playMenuTone(frequencies: number[]): void {
    // Menu cues are navigational: silence only when the user turned sound OFF.
    if (this.mode === AudioMode.OFF) {
      return;
    }
    // At volume 0 the exponential ramp target collapses to 0 (a RangeError) and
    // nothing would be audible anyway.
    if (this.volume <= 0) {
      return;
    }
    // A suspended context reports currentTime === 0; scheduling start(0)/stop()
    // now would fire an unexpected beep the instant the context resumes.
    if (this.audioContext.state !== 'running') {
      return;
    }

    const now = this.audioContext.currentTime;
    frequencies.forEach((freq, i) => {
      this.playMenuBeep(freq, now + i * (MENU_TONE_DURATION + MENU_TONE_SPACE));
    });
  }

  /**
   * Plays a single menu-cue beep and tracks its nodes for disposal.
   * @param freq - Oscillator frequency in Hz.
   * @param startTime - AudioContext time at which to start the beep.
   */
  private playMenuBeep(freq: number, startTime: number): void {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    const menuVolume = this.volume * MENU_TONE_VOLUME_SCALE;
    gain.gain.setValueAtTime(menuVolume, startTime);
    // Scale the ramp target with menuVolume (like playPointerGuidanceBeep) so
    // the fade-out never inverts (tone swells) at low user volume.
    gain.gain.exponentialRampToValueAtTime(0.001 * menuVolume, startTime + MENU_TONE_DURATION);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(startTime);
    osc.stop(startTime + MENU_TONE_DURATION);

    // Register the nodes and a self-clearing cleanup timer so stopAll()/dispose()
    // can cancel a pending beep and disconnect the graph (mirrors the guidance
    // beep). The 2x margin lets the fade-out tail finish before disconnecting.
    const nodes: AudioNode[] = [osc, gain];
    const audioId = setTimeout(() => {
      nodes.forEach(node => node.disconnect());
      this.activeAudioIds.delete(audioId);
    }, MENU_TONE_DURATION * 1000 * 2);
    this.activeAudioIds.set(audioId, nodes);
  }

  /**
   * @param guidance - Pointer guidance state from the active trace, or null to reset guidance
   */
  public playPointerGuidance(guidance: PointerGuidanceState | null): void {
    // Reset throttle only when the pointer leaves the trace entirely. On an
    // `onCurve: true` event we deliberately keep the throttle intact: a
    // cursor sitting at the `isPointInBounds` boundary alternates on/off at
    // frame rate, and resetting on each on-curve frame would let every
    // following off-curve frame bypass the rate limit, producing a 60 Hz
    // buzz instead of discrete beeps. The cost of letting the throttle
    // carry over is at most one `minInterval` delay before the first
    // off-curve beep — an intentional, imperceptible debounce.
    if (!guidance) {
      this.nextPointerGuidanceBeepAt = 0;
      return;
    }
    if (guidance.onCurve) {
      return;
    }
    // Guidance is intentionally mode-agnostic across SEPARATE / COMBINED /
    // future audio variants: it serves a navigational role that is
    // orthogonal to how data tones are rendered. Only the explicit "audio
    // off" choice suppresses it.
    if (this.mode === AudioMode.OFF) {
      return;
    }

    // `audioContext.currentTime` returns 0 while the context is suspended
    // (before the first user gesture resumes it). The rate-limit gate
    // below would otherwise pass freely in that state; `playPointerGuidanceBeep`
    // guards against actually arming oscillators on a suspended context.
    const now = this.audioContext.currentTime;
    if (now < this.nextPointerGuidanceBeepAt) {
      return;
    }

    const beep = resolvePointerGuidanceBeep(guidance);
    if (!beep) {
      // Off-curve but out of range: leave the throttle untouched. If the
      // cursor oscillates across the maxDistancePx boundary the user would
      // otherwise hear a beep on every re-entry, since each out-of-range
      // event would reset and unblock the next in-range one.
      return;
    }

    if (!this.playPointerGuidanceBeep(beep.frequency, beep.pan, now)) {
      // Beep was skipped (volume = 0 or AudioContext not yet resumed). Don't
      // advance the throttle: doing so would silently delay the next valid
      // beep after the user turns volume back up or completes a user gesture.
      return;
    }
    this.nextPointerGuidanceBeepAt = now + beep.interval;
  }

  private playPointerGuidanceBeep(
    frequency: number,
    pan: number,
    startTime: number,
  ): boolean {
    // Skip while the AudioContext is suspended — its `currentTime` is 0, so
    // scheduling `start(0)` / `stop(0.06)` would fire an unexpected beep the
    // moment the context resumes (e.g. when the user clicks to focus after
    // hovering).
    if (this.audioContext.state !== 'running') {
      return false;
    }
    const guidanceVolume = this.volume * POINTER_GUIDANCE_VOLUME;
    if (guidanceVolume <= 0) {
      return false;
    }

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(guidanceVolume, startTime);
    // Scale the ramp target with guidanceVolume so the fade-out stays below
    // the starting value at any user volume. A fixed 0.001 inverts the ramp
    // (tone swells) when guidanceVolume drops below 0.001 at low user volumes.
    gainNode.gain.exponentialRampToValueAtTime(0.001 * guidanceVolume, startTime + POINTER_GUIDANCE_BEEP_DURATION);

    // `createStereoPanner` is unavailable on Safari < 14.5. Degrade
    // gracefully: still emit the directional beep (high/low pitch already
    // conveys vertical direction); horizontal direction is lost on
    // unsupported platforms, which is preferable to a runtime throw.
    const stereoPanner = typeof this.audioContext.createStereoPanner === 'function'
      ? this.audioContext.createStereoPanner()
      : null;
    if (stereoPanner) {
      stereoPanner.pan.value = MathUtil.clamp(pan, -1, 1);
    }

    oscillator.connect(gainNode);
    if (stereoPanner) {
      gainNode.connect(stereoPanner);
      stereoPanner.connect(this.compressor);
    } else {
      gainNode.connect(this.compressor);
    }

    oscillator.start(startTime);
    oscillator.stop(startTime + POINTER_GUIDANCE_BEEP_DURATION);

    // Schedule cleanup after 2× the beep duration to let the
    // exponentialRampToValueAtTime tail finish before disconnecting the
    // nodes — disconnecting mid-ramp would clip the fade-out.
    const nodes: AudioNode[] = stereoPanner
      ? [oscillator, gainNode, stereoPanner]
      : [oscillator, gainNode];
    const audioId = setTimeout(() => {
      nodes.forEach(node => node.disconnect());
      this.activeAudioIds.delete(audioId);
    }, POINTER_GUIDANCE_BEEP_DURATION * 1000 * 2);
    this.activeAudioIds.set(audioId, nodes);
    return true;
  }

  /**
   * Plays a short percussive click, spatialized by x-position. Used for
   * zero-delta points in the candlestick delta layer, where "exactly on the
   * reference line" needs a sound clearly distinct from both the pitched
   * data tones and the low "null value" tone.
   *
   * The click is a ~40 ms band-passed noise burst with a quadratic decay —
   * a tick rather than a tone, so it cannot be confused with a pitch.
   *
   * @param panning - Position information for stereo placement
   * @returns AudioId for the played click
   */
  private playClickTone(panning: Panning): AudioId {
    // Silent at volume 0; return a harmless self-clearing id (see playEmptyTone).
    if (this.volume <= 0) {
      const audioId = setTimeout(() => this.activeAudioIds.delete(audioId), 0);
      this.activeAudioIds.set(audioId, []);
      return audioId;
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.04;

    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / frameCount) ** 2;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2500;
    bandpass.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.value = this.volume;

    const xPos = MathUtil.clamp(
      MathUtil.interpolate(panning.x, 0, panning.cols - 1, -1, 1),
      -1,
      1,
    );
    // createStereoPanner is unavailable on Safari < 14.5; degrade to mono.
    const stereoPanner = typeof ctx.createStereoPanner === 'function'
      ? ctx.createStereoPanner()
      : null;
    if (stereoPanner) {
      stereoPanner.pan.value = xPos;
    }

    source.connect(bandpass);
    bandpass.connect(gain);
    if (stereoPanner) {
      gain.connect(stereoPanner);
      stereoPanner.connect(this.compressor);
    } else {
      gain.connect(this.compressor);
    }

    source.start(now);

    const nodes: AudioNode[] = stereoPanner
      ? [source, bandpass, gain, stereoPanner]
      : [source, bandpass, gain];
    const audioId = setTimeout(() => {
      nodes.forEach(node => node.disconnect());
      this.activeAudioIds.delete(audioId);
    }, duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, [source]);
    return audioId;
  }

  private playZeroTone(panning: Panning): AudioId {
    const xPos = MathUtil.clamp(MathUtil.interpolate(panning.x, 0, panning.cols - 1, -1, 1), -1, 1);
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
    const audioId = setInterval(
      () => this.playOscillator(WAITING_FREQUENCY, { x: 0, y: 0 }, paletteEntry),
      1000,
    );
    // Track the interval so stopAll()/dispose() can clear it; otherwise it
    // keeps firing against a closed AudioContext after disposal.
    this.activeAudioIds.set(audioId, []);
    return audioId;
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
    // At volume 0 the exponential ramp target below collapses to 0, which the
    // Web Audio spec rejects with a RangeError. Nothing would be audible, so
    // skip playback entirely.
    if (this.volume <= 0) {
      return;
    }

    const duration = DEFAULT_DURATION;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Use the value from the first tone as the shared value (all intersecting lines share the same point)
    const sharedValue = Array.isArray(tones[0].freq.raw)
      ? (tones[0].freq.raw[1] ?? tones[0].freq.raw[0])
      : (tones[0].freq.raw as number);
    const sharedFrequency = MathUtil.interpolate(
      sharedValue,
      tones[0].freq.min,
      tones[0].freq.max,
      this.minFrequency,
      this.maxFrequency,
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
        this.stopAudioNode(node);
      });

      clearTimeout(audioId);
      this.activeAudioIds.delete(audioId);
    });
  }

  private stopAudioNode(node: AudioNode): void {
    node.disconnect();
    if ('stop' in node) {
      try {
        // `stop` is defined on AudioScheduledSourceNode — the common parent
        // of OscillatorNode, AudioBufferSourceNode, and ConstantSourceNode —
        // so this is the right granularity if a future palette entry adds a
        // sample-based source.
        (node as AudioScheduledSourceNode).stop();
      } catch {
        // Node may have already been stopped; safe to ignore.
      }
    }
  }

  private stopAll(): void {
    this.activeAudioIds.forEach((node, audioId) => {
      clearTimeout(audioId);
      const nodes = Array.isArray(node) ? node : [node];
      nodes.forEach((node) => {
        this.stopAudioNode(node);
      });
    });
    this.activeAudioIds.clear();
  }

  private normalizeVolume(volume: number): number {
    return (volume / 100) * (volume / 100);
  }
}
