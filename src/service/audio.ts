import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import type { NotificationService } from './notification';

interface Range {
  min: number;
  max: number;
}

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

export class AudioService implements Observer {
  private readonly notification: NotificationService;
  private readonly isCombinedAudio: boolean;
  private volume: number;
  private mode: AudioMode;
  private timeoutId: NodeJS.Timeout | null;
  // Restore readonly modifiers
  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  public constructor(notification: NotificationService, isCombinedAudio: boolean) {
    this.notification = notification;

    this.isCombinedAudio = isCombinedAudio;
    this.volume = DEFAULT_VOLUME;
    this.mode = isCombinedAudio ? AudioMode.COMBINED : AudioMode.SEPARATE;
    this.timeoutId = null;

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

  /**
   * Stops audio playback and suspends the audio context
   * @param audioId Optional timeout ID to clear, defaults to the current timeoutId
   */
  public stop(audioId: NodeJS.Timeout | null = this.timeoutId): void {
    if (audioId) {
      clearTimeout(audioId);
      this.timeoutId = null;
    }

    // Suspend the audio context instead of closing it
    if (this.audioContext.state !== 'closed' && this.audioContext.state !== 'suspended') {
      this.audioContext.suspend().catch(err => {
        console.error('Failed to suspend audio context:', err);
      });

      // Disconnect any active nodes if needed
      try {
        // We don't disconnect the compressor since it's a persistent part of our audio graph
        // Just ensure any ongoing sounds are stopped
      } catch (err) {
        console.error('Error cleaning up audio nodes:', err);
      }
    }
  }

  /**
   * Ensures the audio context is running before playing audio
   * @returns Promise that resolves when the context is running
   */
  private async ensureAudioContext(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Updates the audio playback based on the current plot state
   * @param state The current plot state
   */
  public async update(state: PlotState): Promise<void> {
    this.stop();

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF) {
      return;
    }

    // Ensure audio context is active before playing
    await this.ensureAudioContext();

    // TODO: Play empty sound.
    if (state.empty) {
      return;
    }

    const audio = state.audio;
    if (Array.isArray(audio.value)) {
      const values = audio.value as number[];
      if (values.length === 0) {
        await this.playZero();
        return;
      }

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;

      const playNext = async (): Promise<void> => {
        if (currentIndex < values.length) {
          await this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++);
          this.timeoutId = setTimeout(() => playNext(), playRate);
        } else {
          this.stop();
        }
      };

      void playNext();
    } else {
      const value = audio.value as number;
      if (value === 0) {
        await this.playZero();
      } else {
        await this.playTone(audio.min, audio.max, value, audio.size, audio.index);
      }
    }
  }

  /**
   * Plays a tone with the given frequency and panning parameters
   * @param minFrequency Minimum frequency value
   * @param maxFrequency Maximum frequency value
   * @param rawFrequency Raw frequency value to interpolate
   * @param panningSize Panning size
   * @param rawPanning Raw panning value to interpolate
   */
  private async playTone(
    minFrequency: number,
    maxFrequency: number,
    rawFrequency: number,
    panningSize: number,
    rawPanning: number,
  ): Promise<void> {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = { min: MIN_FREQUENCY, max: MAX_FREQUENCY };
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(rawPanning, fromPanning, toPanning), -1, 1);

    await this.playOscillator(frequency, panning);
  }

  /**
   * Plays an oscillator with the given frequency and panning
   * @param frequency The frequency to play
   * @param panning The stereo panning value (-1 to 1)
   * @param wave The oscillator wave type
   */
  private async playOscillator(
    frequency: number,
    panning: number,
    wave: OscillatorType = 'sine',
  ): Promise<void> {
    // Ensure audio context is running
    await this.ensureAudioContext();

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
      duration * 1e3 * 2,
    );
  }

  /**
   * Plays a zero-value tone
   */
  private async playZero(): Promise<void> {
    const frequency = NULL_FREQUENCY;
    const panning = 0;
    const wave = 'triangle';

    await this.playOscillator(frequency, panning, wave);
  }

  public playWaitingTone(): NodeJS.Timeout {
    return setTimeout(() => { });
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

  public updateVolume(volume: number): void {
    this.volume = volume;
  }
}
