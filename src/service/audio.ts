import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import type { NotificationService } from './notification';

interface Range {
  min: number;
  max: number;
}

type AudioId = ReturnType<typeof setTimeout>;

const MIN_FREQUENCY = 200;
const MAX_FREQUENCY = 1000;
const NULL_FREQUENCY = 100;

const DEFAULT_DURATION = 0.3;
const DEFAULT_VOLUME = 0.5;

enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

export class AudioService implements Observer<SubplotState | TraceState>, Disposable {
  private readonly notification: NotificationService;

  private isCombinedAudio: boolean;
  private mode: AudioMode;

  private readonly activeAudioIds: Map<AudioId, OscillatorNode | OscillatorNode[]>;

  private readonly volume: number;
  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  public constructor(notification: NotificationService, state: PlotState) {
    this.notification = notification;

    this.isCombinedAudio = false;
    this.mode = AudioMode.SEPARATE;
    this.updateMode(state);

    this.activeAudioIds = new Map();

    this.volume = DEFAULT_VOLUME;
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
    if (Array.isArray(audio.value)) {
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
          this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++);
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
        this.playTone(audio.min, audio.max, value, audio.size, audio.index);
      }
    }
  }

  private playTone(
    minFrequency: number,
    maxFrequency: number,
    rawFrequency: number,
    panningSize: number,
    rawPanning: number,
  ): AudioId {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = { min: MIN_FREQUENCY, max: MAX_FREQUENCY };
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(rawPanning, fromPanning, toPanning), -1, 1);

    return this.playOscillator(frequency, panning);
  }

  private playOscillator(
    frequency: number,
    panning: number,
    wave: OscillatorType = 'sine',
  ): AudioId {
    const duration = DEFAULT_DURATION;
    const volume = this.volume;

    // Start with a constant tone.
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;

    // Add volume.
    const gainNode = this.audioContext.createGain();
    const startTime = this.audioContext.currentTime;
    const valueCurve = [
      0.5 * volume,
      volume,
      0.5 * volume,
      0.5 * volume,
      0.5 * volume,
      0.1 * volume,
      1e-4 * volume,
    ];
    gainNode.gain.setValueCurveAtTime(valueCurve, startTime, duration);

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
    oscillator.connect(gainNode);
    gainNode.connect(stereoPannerNode);
    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);
    oscillator.start();

    // Clean up after the audio stops.
    const cleanUp = (audioId: AudioId): void => {
      pannerNode.disconnect(this.compressor);
      stereoPannerNode.disconnect(pannerNode);
      gainNode.disconnect(stereoPannerNode);

      oscillator.stop();
      oscillator.disconnect(gainNode);

      this.activeAudioIds.delete(audioId);
    };
    const audioId = setTimeout(() => cleanUp(audioId), duration * 1e3 * 2);
    this.activeAudioIds.set(audioId, oscillator);
    return audioId;
  }

  private playEmptyTone(): AudioId {
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.2;

    const frequencies = [500, 1000, 1500, 2100, 2700];
    const gains = [1, 0.6, 0.4, 0.2, 0.1];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3, now);
    masterGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    masterGain.connect(this.compressor);

    const oscillators: OscillatorNode[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.value = frequencies[i];
      osc.type = 'sine';

      gain.gain.setValueAtTime(gains[i] * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

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
    const frequency = NULL_FREQUENCY;
    const panning = 0;
    const wave = 'triangle';

    return this.playOscillator(frequency, panning, wave);
  }

  public playWaitingTone(): AudioId {
    return setTimeout(() => {});
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
    this.activeAudioIds.entries().forEach(([audioId, node]) => {
      clearTimeout(audioId);
      const nodes = Array.isArray(node) ? node : [node];
      nodes.forEach((node) => {
        node.disconnect();
        node.stop();
      });
    });
    this.activeAudioIds.clear();
  }
}
