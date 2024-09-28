import NotificationManager from './notification';
import {PlotState} from '../../plot/plot';

type Range = {
  min: number;
  max: number;
};

const MIN_FREQUENCY = 200;
const MAX_FREQUENCY = 1000;

export default class AudioManager {
  private enabled: boolean;
  private volume: number;
  private readonly notification: NotificationManager;

  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  constructor(notification: NotificationManager) {
    this.enabled = true;
    this.volume = 0.5;
    this.notification = notification;

    this.audioContext = new AudioContext();
    this.compressor = this.initCompressor();
  }

  public destroy(): void {
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

  public play(state: PlotState): void {
    // Play audio only if turned on.
    console.log(state.audio);
    console.log(state.empty);
    if (!this.enabled || !state.empty) {
      console.log('Audio is off or plot is unitialized');
      return;
    }

    // TODO: Handle point, segmented, and boxplot.
    const audioState = state.audio;
    const fromFreq = {min: audioState.min, max: audioState.max};
    const toFreq = {min: MIN_FREQUENCY, max: MAX_FREQUENCY};
    const frequency = this.interpolate(audioState.value, fromFreq, toFreq);
    // Handling boundary conditions
    if (isNaN(frequency)) {
      return;
    }

    const fromPanning = {min: 0, max: audioState.size};
    const toPanning = {min: -1, max: 1};
    const panning = this.interpolate(audioState.index, fromPanning, toPanning);
    console.log(frequency, panning);
    const volume = this.volume;
    const duration = 0.3;

    // Start with a constant tone.
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
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
    setTimeout(
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

  private interpolate(value: number, from: Range, to: Range): number {
    if (from.min === 0 && from.max === 0) {
      return 0;
    }

    return (
      ((value - from.min) / (from.max - from.min)) * (to.max - to.min) + to.min
    );
  }

  public toggle() {
    this.enabled = !this.enabled;

    const message = `Sound is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }

  public updateVolume(volume: number): void {
    this.volume = volume;
  }
}
