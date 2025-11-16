import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { AudioPaletteIndex } from './audioPalette';

interface HarmonicComponent {
  type: OscillatorType;
  gain: number;
  multiplier: number;
}

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

//Warning
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
  MIN_FREQUENCY = 'general.minFrequency',
  MAX_FREQUENCY = 'general.maxFrequency',
}

export class AudioService implements Observer<PlotState>, Disposable {
  private readonly notification: NotificationService;

  private isCombinedAudio: boolean;
  private mode: AudioMode;
  private readonly activeAudioIds: Map<AudioId, OscillatorNode | OscillatorNode[]>;

  private volume: number;
  private minFrequency: number;
  private maxFrequency: number;
  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  public constructor(notification: NotificationService, settings: SettingsService, state: PlotState) {
    this.notification = notification;

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
  }

  public dispose(): void {
    this.stopAll();

    if (this.audioContext.state !== 'closed') {
      this.compressor.disconnect();
      void this.audioContext.close();
    }
    this.settings.removeObserver(this);
  }

  public update(state: Settings | SubplotState | TraceState | FigureState): void {
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

  private handleTraceState(traceState: TraceState): void {
    // Play audio only if turned on and it's a trace state
    if (this.mode === AudioMode.OFF || traceState.type !== 'trace') {
      return;
    }

    if (traceState.empty) {

      // Stop any existing audio first to prevent overlap
      this.stopAll();
      if (traceState.warning) {
        this.playWarningTone();
      }
      else {
        this.playEmptyTone(traceState.audio.size, traceState.audio.index);
      }
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

  public update(state: PlotState): void {
    this.updateMode(state);
    // TODO: Clean up previous audio state once syncing with Autoplay interval.

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF) {
      return;
    }

    if (state.empty) {
      this.playEmptyTone({
        x: 0,
        y: 0,
        rows: 0,
        cols: 0,
      });
      return;
    }
    if (state.type !== 'trace') {
      return;
    }

    const audio = state.audio;
    if (audio.isContinuous) {
      this.playSmooth(
        audio.freq,
        audio.panning,
        'sine',
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
            audio.group,
          );
          activeIds.push(setTimeout(playNext, playRate));
        } else {
          this.stop(activeIds);
        }
      };

      playNext();
    } else {
      const value = audio.freq.raw as number;
      if (value === 0) {
        this.playZeroTone(audio.panning);
      } else {
        this.playTone(audio.freq, audio.panning, audio.group);
      }
    }
  }

  private playTone(freq: Frequency, panning: Panning, group: number = 0): AudioId {
    const fromFreq = { min: freq.min, max: freq.max };
    const toFreq = { min: this.minFrequency, max: this.maxFrequency };
    const frequency = this.interpolate(freq.raw as number, fromFreq, toFreq);

    const x = this.clamp(this.interpolate(panning.x, { min: 0, max: panning.cols }, { min: -1, max: 1 }), -1, 1);
    const y = this.clamp(this.interpolate(panning.y, { min: 0, max: panning.rows }, { min: -1, max: 1 }), -1, 1);
    return this.playOscillator(frequency, { x, y }, group);
  }

  private getHarmony(group: number): HarmonicComponent[] {
    const fundamental: HarmonicComponent = { type: 'sine', gain: 1.0, multiplier: 1 };
    if (group === 0) {
      return [fundamental];
    }

    const overtones: HarmonicComponent[] = [
      { type: 'triangle', gain: 0.8, multiplier: 2 },
      { type: 'sine', gain: 0.6, multiplier: 1.5 },
      { type: 'triangle', gain: 0.4, multiplier: 3 },
      { type: 'sine', gain: 0.3, multiplier: 4 },
    ];
    const config: HarmonicComponent[] = [fundamental];
    let totalGain = fundamental.gain;

    let index = group;
    for (let i = 0; i < overtones.length && index > 0; i++) {
      if ((index & 1) === 1) { // Check the last bit
        config.push(overtones[i]);
        totalGain += overtones[i].gain;
      }
      index >>= 1;
    }

    for (const part of config) {
      part.gain /= totalGain;
    }

    return config;
  }

  private playOscillator(
    frequency: number,
    position: SpatialPosition = { x: 0, y: 0 },
    group: number = 0,
  ): AudioId {
    const duration = DEFAULT_DURATION;
    const startTime = this.audioContext.currentTime;
    const oscillators: OscillatorNode[] = [];

    const masterGainNode = this.audioContext.createGain();
    const pannerNode = new PannerNode(this.audioContext, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      positionX: position.x,
      positionY: position.y,
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

    masterGainNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    const valueCurve = [0.5 * this.volume, this.volume, 0.5 * this.volume, 0.5 * this.volume, 0.5 * this.volume, 0.1 * this.volume, 1e-4 * this.volume];
    masterGainNode.gain.setValueCurveAtTime(valueCurve, startTime, duration);

    const harmony = this.getHarmony(group);
    for (const part of harmony) {
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = part.type;
      oscillator.frequency.value = frequency * part.multiplier;

      const mixGainNode = this.audioContext.createGain();
      mixGainNode.gain.value = part.gain;

      oscillator.connect(mixGainNode);
      mixGainNode.connect(masterGainNode);

      oscillator.start(startTime);
      oscillators.push(oscillator);
    }

    const cleanUp = (audioId: AudioId): void => {
      pannerNode.disconnect();
      masterGainNode.disconnect();

      oscillators.forEach((osc) => {
        osc.stop();
        osc.disconnect();
      });

      this.activeAudioIds.delete(audioId);
    };

    const audioId = setTimeout(() => cleanUp(audioId), duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, oscillators);
    this.activeAudioIds.set(audioId, oscillators);
    return audioId;
  }

  private playSmooth(
    freq: Frequency,
    panning: Panning,
    wave: OscillatorType = 'sine',
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
    const yPos = this.clamp(this.interpolate(panning.y, { min: 0, max: panning.rows - 1 }, { min: -1, max: 1 }), -1, 1);

    const oscillator = ctx.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueCurveAtTime(freqs, startTime, duration);

    const gainNode = ctx.createGain();
    const gainCurve = [
      1e-4 * currentVolume,
      0.5 * currentVolume,
      1e-4 * currentVolume,
    ];
    gainNode.gain.setValueCurveAtTime(gainCurve, startTime, duration);

    const panner = new PannerNode(this.audioContext, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      positionX: xPos,
      positionY: yPos,
      positionZ: 0,
      orientationX: 0.0,
      orientationY: 0.0,
      orientationZ: -1.0,
    });

    oscillator.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.compressor);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    const audioId = setTimeout(() => {
      oscillator.disconnect();
      gainNode.disconnect();
      panner.disconnect();
      this.activeAudioIds.delete(audioId);
    }, duration * 1000 * 2);

    this.activeAudioIds.set(audioId, oscillator);
  }

  private playEmptyTone(panning: Panning): AudioId {
    const xPos = this.interpolate(panning.x, { min: 0, max: panning.cols - 1 }, { min: -1, max: 1 });
    const yPos = this.interpolate(panning.y, { min: 0, max: panning.rows - 1 }, { min: -1, max: 1 });

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.2;

    const panner = new PannerNode(this.audioContext, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      positionX: xPos,
      positionY: yPos,
      positionZ: 0,
      orientationX: 0.0,
      orientationY: 0.0,
      orientationZ: -1.0,
    });

    const frequencies = [500, 1000, 1500, 2100, 2700];
    const gains = [1, 0.6, 0.4, 0.2, 0.1];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3 * this.volume, now);
    masterGain.gain.exponentialRampToValueAtTime(0.01 * this.volume, now + duration);

    masterGain.connect(panner);
    panner.connect(this.compressor);

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

      gain.gain.setValueAtTime(gains[i] * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, now + duration);

      osc.connect(gain);
      gain.connect(stereoPannerNode);
      stereoPannerNode.connect(pannerNode);
      pannerNode.connect(masterGain);

      osc.start(now);
      osc.stop(now + duration);

      oscillators.push(osc);
    }

    const cleanUp = (audioId: AudioId): void => {
      panner.disconnect();
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

  private playOneWarningBeep(freq: number, startTime: number) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;
    let vol = 1;
    if (osc.type != 'sine') vol = .5;

    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + WARNING_DURATION);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(startTime);
    osc.stop(startTime + WARNING_DURATION);
  }

  public playWarningTone(): void {
    const now = this.audioContext.currentTime;
    this.playOneWarningBeep(WARNING_FREQUENCY, now);
    this.playOneWarningBeep(WARNING_FREQUENCY / Math.pow(2, 1 / 12), now + WARNING_SPACE); // half step down
    // setTimeout(() => this.audioContext.close(), (WARNING_SPACE + WARNING_DURATION + 0.1) * 1000);
  }

  private playZeroTone(panning: Panning): AudioId {
    const xPos = this.clamp(this.interpolate(panning.x, { min: 0, max: panning.cols - 1 }, { min: -1, max: 1 }), -1, 1);
    const yPos = this.clamp(this.interpolate(panning.y, { min: 0, max: panning.rows - 1 }, { min: -1, max: 1 }), -1, 1);
    return this.playOscillator(NULL_FREQUENCY, { x: xPos, y: yPos });
  }

  public playWaitingTone(): AudioId {
    return setInterval(
      () => this.playOscillator(WAITING_FREQUENCY, { x: 0, y: 0 }, DEFAULT_PALETTE_INDEX),
      1000,
    );
  }

  public playCompleteTone(): AudioId {
    return this.playOscillator(COMPLETE_FREQUENCY, { x: 0, y: 0 }, DEFAULT_PALETTE_INDEX);
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
}
