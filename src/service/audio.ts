import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';

interface HarmonicComponent {
  type: OscillatorType;
  gain: number;
  multiplier: number;
}

interface Range {
  min: number;
  max: number;
}

type AudioId = ReturnType<typeof setTimeout>;

const NULL_FREQUENCY = 100;
const WAITING_FREQUENCY = 440;
const COMPLETE_FREQUENCY = 880;

const DEFAULT_DURATION = 0.3;

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

export class AudioService implements Observer<SubplotState | TraceState>, Disposable {
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
    if (traceState.empty || traceState.hasMultiPoints === this.isCombinedAudio) {
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

  public update(state: SubplotState | TraceState): void {
    this.updateMode(state);
    // TODO: Clean up previous audio state once syncing with Autoplay interval.

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF || state.type !== 'trace') {
      return;
    }

    if (state.empty) {
      this.playEmptyTone();
      return;
    }

    const audio = state.audio;
    if (audio.isContinuous) {
      this.playSmooth(audio.value as number[], audio.min, audio.max, audio.size, audio.index);
    } else if (Array.isArray(audio.value)) {
      const values = audio.value as number[];
      if (values.length === 0) {
        this.playZeroTone();
        return;
      }

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;
      const activeIds = new Array<AudioId>();
      const playNext = (): void => {
        if (currentIndex < values.length) {
          this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++, audio.group);
          activeIds.push(setTimeout(playNext, playRate));
        } else {
          this.stop(activeIds);
        }
      };

      playNext();
    } else {
      const value = audio.value as number;
      if (value === 0) {
        this.playZeroTone();
      } else {
        this.playTone(audio.min, audio.max, value, audio.size, audio.index, audio.group);
      }
    }
  }

  private playTone(
    minFrequency: number,
    maxFrequency: number,
    rawFrequency: number,
    panningSize: number,
    rawPanning: number,
    group: number = 0,
  ): AudioId {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = { min: this.minFrequency, max: this.maxFrequency };
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(rawPanning, fromPanning, toPanning), -1, 1);

    return this.playOscillator(frequency, panning, group);
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
    panning: number = 0,
    group: number = 0,
  ): AudioId {
    const duration = DEFAULT_DURATION;
    const startTime = this.audioContext.currentTime;
    const oscillators: OscillatorNode[] = [];

    const masterGainNode = this.audioContext.createGain();
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

    masterGainNode.connect(stereoPannerNode);
    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    const valueCurve = [0.5 * this.volume, this.volume, 0.5 * this.volume, 0.5 * this.volume, 0.5 * this.volume, 0.1 * this.volume, 1e-4 * this.volume];
    masterGainNode.gain.setValueCurveAtTime(valueCurve, startTime, duration);
    stereoPannerNode.pan.value = panning;

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
      stereoPannerNode.disconnect();
      masterGainNode.disconnect();

      oscillators.forEach((osc) => {
        osc.stop();
        osc.disconnect();
      });

      this.activeAudioIds.delete(audioId);
    };

    const audioId = setTimeout(() => cleanUp(audioId), duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, oscillators);
    return audioId;
  }

  private playSmooth(
    values: number[],
    min: number,
    max: number,
    size: number,
    index: number,
    wave: OscillatorType = 'sine',
  ): void {
    const ctx = this.audioContext;
    const startTime = ctx.currentTime;
    const duration = DEFAULT_DURATION;
    const freqs = values.map(v => this.interpolate(v, { min, max }, { min: this.minFrequency, max: this.maxFrequency }));

    if (freqs.length < 2) {
      freqs.push(freqs[0]);
    }

    const pan = this.clamp(this.interpolate(index, { min: 0, max: size - 1 }, { min: -1, max: 1 }), -1, 1);

    const oscillator = ctx.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueCurveAtTime(freqs, startTime, duration);

    const gainNode = ctx.createGain();
    const gainCurve = [1e-4 * this.volume, 0.5 * this.volume, 1e-4 * this.volume];
    gainNode.gain.setValueCurveAtTime(gainCurve, startTime, duration);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

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

  private playEmptyTone(): AudioId {
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.2;

    const frequencies = [500, 1000, 1500, 2100, 2700];
    const gains = [1, 0.6, 0.4, 0.2, 0.1];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3 * this.volume, now);
    masterGain.gain.exponentialRampToValueAtTime(0.01 * this.volume, now + duration);
    masterGain.connect(this.compressor);

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
    return this.playOscillator(NULL_FREQUENCY, 0, 0);
  }

  public playWaitingTone(): AudioId {
    return setInterval(() => this.playOscillator(WAITING_FREQUENCY), 1000);
  }

  public playCompleteTone(): AudioId {
    return this.playOscillator(COMPLETE_FREQUENCY);
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
        this.mode = this.isCombinedAudio ? AudioMode.COMBINED : AudioMode.SEPARATE;
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
