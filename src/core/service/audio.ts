import {PlotState} from '../../model/state';
import {Observer} from '../interface';
import {NotificationService} from './notification';

type Range = {
  min: number;
  max: number;
};

const MIN_FREQUENCY = 200;
const MAX_FREQUENCY = 1000;
const NULL_FREQUENCY = 100;
const DEFAULT_DURATION = 0.3;

enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

export class AudioService implements Observer {
  private mode: AudioMode;
  private timeoutId?: NodeJS.Timeout | null = null;
  private readonly isCombinedAudio: boolean;

  private volume: number;
  private readonly notification: NotificationService;

  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  public constructor(
    notification: NotificationService,
    isCombinedAudio: boolean
  ) {
    this.isCombinedAudio = isCombinedAudio;
    this.mode = isCombinedAudio ? AudioMode.COMBINED : AudioMode.SEPARATE;

    this.volume = 0.5;
    this.notification = notification;

    this.audioContext = new AudioContext();
    this.compressor = this.initCompressor();
  }

  public destroy(): void {
    this.stop();
    if (this.audioContext.state !== 'closed') {
      this.compressor.disconnect();
      this.audioContext.close().finally();
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

  public update(state: PlotState): void {
    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF) {
      return;
    }

    // TODO: Play empty sound.
    if (state.empty) {
      return;
    }

    this.stop();
    // TODO: Handle point.
    const audio = state.audio;
    this.stop();
    // TODO: Handle point.
    if (Array.isArray(audio.value)) {
      const values = audio.value as number[];
      if (values.length === 0) {
        this.playZero();
        return;
      }

      let currentIndex = 0;
      const playNext = () => {
        if (currentIndex < values.length) {
          this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++);
          this.timeoutId = setTimeout(playNext, 50);
        } else {
          this.stop();
        }
      };

      playNext();
    } else {
      const value = audio.value as number;
      if (value === 0) {
        this.playZero();
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
    rawPanning: number
  ): void {
    const fromFreq = {min: minFrequency, max: maxFrequency};
    const toFreq = {min: MIN_FREQUENCY, max: MAX_FREQUENCY};
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = {min: 0, max: panningSize};
    const toPanning = {min: -1, max: 1};
    const panning = this.interpolate(rawPanning, fromPanning, toPanning);

    this.playOscillator(frequency, panning);
  }

  private playOscillator(
    frequency: number,
    panning: number,
    wave: OscillatorType = 'sine'
  ) {
    const duration = DEFAULT_DURATION;
    const volume = this.volume;

    // Start with a constant tone.
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    oscillator.start();

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

    // Create the audio graph.
    oscillator.connect(gainNode);
    gainNode.connect(stereoPannerNode);
    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    // Clean up after the audio stops.
    this.timeoutId = setTimeout(
      () => {
        pannerNode.disconnect();
        stereoPannerNode.disconnect();
        gainNode.disconnect();

        oscillator.stop();
        oscillator.disconnect();
      },
      duration * 1e3 * 2
    );
  }

  private playZero(): void {
    const frequency = NULL_FREQUENCY;
    const panning = 0;
    const wave = 'triangle';

    this.playOscillator(frequency, panning, wave);
  }

  private interpolate(value: number, from: Range, to: Range): number {
    if (from.min === 0 && from.max === 0) {
      return 0;
    }

    return (
      ((value - from.min) / (from.max - from.min)) * (to.max - to.min) + to.min
    );
  }

  public toggle() {
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
    }

    const mode =
      this.isCombinedAudio && this.mode === AudioMode.SEPARATE
        ? 'separate'
        : this.mode;
    const message = `Sound is ${mode}`;
    this.notification.notify(message);
  }

  private stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  public updateVolume(volume: number): void {
    this.volume = volume;
  }
}
