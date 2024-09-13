import { Constants } from "../constants";
import { ReactivePosition } from "../helpers/ReactivePosition";

export abstract class AudioManager {
  protected AudioContext: AudioContext;
  protected audioContext: AudioContext;
  protected compressor: DynamicsCompressorNode;
  protected smoothGain: GainNode;
  position: ReactivePosition;
  constants: Constants;
  private smoothId: any | null = null;
  private isSmoothAutoplay: boolean = false;
  endChime: Node | null = null;
  private canPlayEndChime: boolean = false;

  constructor() {
    this.constants = window.constants;
    this.AudioContext =
      (window as any)["AudioContext"] || (window as any)["webkitAudioContext"];
    this.audioContext = new AudioContext();
    this.compressor = this.compressorSetup();
    this.smoothGain = this.audioContext.createGain();
    this.position = new ReactivePosition();
  }

  protected compressorSetup(): DynamicsCompressorNode {
    const compressor = this.audioContext.createDynamicsCompressor();
    const smoothGain = this.audioContext.createGain();

    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    smoothGain.gain.value = 0.5;

    compressor.release.value = 0.25;

    compressor.connect(smoothGain);
    smoothGain.connect(this.audioContext.destination);

    return compressor;
  }

  playOscillator(
    frequency: number,
    currentDuration: number,
    panning: number,
    currentVol: number = 1,
    wave: OscillatorType = Constants.OSCILLATOR_TYPES.SINE
  ): void {
    console.log("Playing oscillator", panning, frequency, currentVol);
    const t = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = Number(frequency);
    oscillator.start();

    // create gain for this event
    const gainThis = this.audioContext.createGain();
    gainThis.gain.setValueCurveAtTime(
      [
        0.5 * currentVol,
        1 * currentVol,
        0.5 * currentVol,
        0.5 * currentVol,
        0.5 * currentVol,
        0.1 * currentVol,
        1e-4 * currentVol,
      ],
      t,
      currentDuration
    ); // this is what makes the tones fade out properly and not clip

    let MAX_DISTANCE = 10000;
    let posZ = 1;
    const panner = new PannerNode(this.audioContext, {
      panningModel: "HRTF",
      distanceModel: "linear",
      positionX: this.position.x,
      positionY: this.position.y,
      positionZ: posZ,
      orientationX: 0.0,
      orientationY: 0.0,
      orientationZ: -1.0,
      refDistance: 1,
      maxDistance: MAX_DISTANCE,
      rolloffFactor: 10,
      coneInnerAngle: 40,
      coneOuterAngle: 50,
      coneOuterGain: 0.4,
    });

    // create panning
    const stereoPanner = this.audioContext.createStereoPanner();
    stereoPanner.pan.value = panning;
    oscillator.connect(gainThis);
    gainThis.connect(stereoPanner);
    stereoPanner.connect(panner);
    panner.connect(this.compressor);

    // create panner node

    // play sound for duration
    setTimeout(() => {
      panner.disconnect();
      gainThis.disconnect();
      oscillator.stop();
      oscillator.disconnect();
    }, currentDuration * 1e3 * 2);
  }

  protected playSmooth({
    freqArr = [600, 500, 400, 300],
    duration = 2,
    panningArr = [-1, 0, 1],
    volume = 1,
    wave = Constants.OSCILLATOR_TYPES.SINE,
  }: {
    freqArr?: number[];
    duration?: number;
    panningArr?: number[];
    volume?: number;
    wave?: OscillatorType;
  } = {}) {
    const startTime = this.audioContext.currentTime;
    const gainArr = this.createGainArray(freqArr.length, volume);

    const smoothOscillator = this.createAndStartOscillator(
      wave,
      freqArr,
      startTime,
      duration
    );
    this.smoothGain = this.createGainNode(gainArr, startTime, duration);
    const panner = this.createPannerNode();
    const stereoPanner = this.createStereoPanner(
      panningArr,
      startTime,
      duration
    );

    this.connectAudioNodes(
      smoothOscillator,
      this.smoothGain,
      stereoPanner,
      panner
    );

    this.isSmoothAutoplay = true;
    this.smoothId = this.scheduleCleanup(smoothOscillator, panner, duration);
  }

  private createGainArray(length: number, volume: number): number[] {
    const gainArr = new Array(length * 3).fill(0.5 * volume);
    gainArr.push(1e-4 * volume);
    return gainArr;
  }

  private createAndStartOscillator(
    wave: OscillatorType,
    freqArr: number[],
    startTime: number,
    duration: number
  ): OscillatorNode {
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueCurveAtTime(freqArr, startTime, duration);
    oscillator.start();
    return oscillator;
  }

  private createGainNode(
    gainArr: number[],
    startTime: number,
    duration: number
  ): GainNode {
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueCurveAtTime(gainArr, startTime, duration);
    return gainNode;
  }

  private createPannerNode(): PannerNode {
    return new PannerNode(this.audioContext, {
      panningModel: "HRTF",
      distanceModel: "linear",
      positionX: this.position.x,
      positionY: this.position.y,
      positionZ: 1,
      orientationX: 0.0,
      orientationY: 0.0,
      orientationZ: -1.0,
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 10,
      coneInnerAngle: 40,
      coneOuterAngle: 50,
      coneOuterGain: 0.4,
    });
  }

  private createStereoPanner(
    panningArr: number[],
    startTime: number,
    duration: number
  ): StereoPannerNode {
    const stereoPanner = this.audioContext.createStereoPanner();
    stereoPanner.pan.setValueCurveAtTime(panningArr, startTime, duration);
    return stereoPanner;
  }

  private connectAudioNodes(
    oscillator: OscillatorNode,
    gain: GainNode,
    stereoPanner: StereoPannerNode,
    panner: PannerNode
  ): void {
    oscillator.connect(gain);
    gain.connect(stereoPanner);
    stereoPanner.connect(panner);
    panner.connect(this.compressor);
  }

  private scheduleCleanup(
    oscillator: OscillatorNode,
    panner: PannerNode,
    duration: number
  ): number {
    return setTimeout(() => {
      panner.disconnect();
      this.smoothGain.disconnect();
      oscillator.stop();
      oscillator.disconnect();
      this.isSmoothAutoplay = false;
    }, duration * 1e3 * 2) as unknown as number;
  }

  protected PlayNull() {
    let frequency = this.constants.NULL_FREQUENCY;
    let duration = this.constants.duration;
    let panning = 0;
    let vol = this.constants.vol;
    let wave = Constants.OSCILLATOR_TYPES.TRIANGLE;

    this.playOscillator(frequency, duration, panning, vol, wave);

    setTimeout(
      function (audioThis) {
        audioThis.playOscillator(
          (frequency * 23) / 24,
          duration,
          panning,
          vol,
          wave
        );
      },
      Math.round((duration / 5) * 1000),
      this
    );
  }

  playEnd(): void {
    if (this.canPlayEndChime && this.endChime instanceof AudioBuffer) {
      try {
        const source = this.audioContext.createBufferSource();
        source.buffer = this.endChime;
        source.connect(this.audioContext.destination);
        source.start();

        // Clean up after the sound has finished playing
        source.onended = () => {
          source.disconnect();
        };
      } catch (error) {
        console.error("Failed to play end chime:", error);
      }
    }
  }

  protected KillSmooth() {
    if (this.smoothId !== null) {
      this.smoothGain.gain.cancelScheduledValues(0);
      this.smoothGain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.audioContext.currentTime + 0.03
      );

      clearTimeout(this.smoothId);

      this.isSmoothAutoplay = false;
    }
  }

  abstract playTone(...args: any[]): void;
}
