import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState, SubplotState, TraceState } from '@type/state';
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

export class AudioService implements Observer<SubplotState | TraceState>, Disposable {
  private readonly notification: NotificationService;

  private isCombinedAudio: boolean;
  private mode: AudioMode;

  private readonly volume: number;
  private timeoutId: NodeJS.Timeout | null;

  // Track active audio nodes for proper cleanup
  private activeOscillators: OscillatorNode[];
  private activeGainNodes: GainNode[];
  private activePannerNodes: PannerNode[];
  private activeStereoPanners: StereoPannerNode[];

  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  /**
   * Creates a new AudioService instance
   * @param notification - The notification service for user feedback
   * @param state - Initial plot state
   */
  public constructor(notification: NotificationService, state: PlotState) {
    this.notification = notification;

    this.isCombinedAudio = false;
    this.mode = AudioMode.SEPARATE;
    this.updateMode(state);

    this.volume = DEFAULT_VOLUME;
    this.timeoutId = null;

    // Initialize arrays for tracking active audio nodes
    this.activeOscillators = [];
    this.activeGainNodes = [];
    this.activePannerNodes = [];
    this.activeStereoPanners = [];

    this.audioContext = new AudioContext();
    this.compressor = this.initCompressor();
  }

  /**
   * Disposes the audio service and cleans up all resources
   */
  public dispose(): void {
    this.stop();
    if (this.audioContext.state !== 'closed') {
      try {
        this.compressor.disconnect();
      } catch (error) {
        // The compressor might already be disconnected
      }
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
    this.stop();
    this.updateMode(state);

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF || state.type !== 'trace') {
      return;
    }

    // TODO: Play empty sound.
    if (state.empty) {
      return;
    }

    const audio = state.audio;
    if (Array.isArray(audio.value)) {
      const values = audio.value as number[];
      if (values.length === 0) {
        this.playZero();
        return;
      }

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;
      const playNext = (): void => {
        if (currentIndex < values.length) {
          this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++);
          this.timeoutId = setTimeout(playNext, playRate);
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
    rawPanning: number,
  ): void {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = { min: MIN_FREQUENCY, max: MAX_FREQUENCY };
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(rawPanning, fromPanning, toPanning), -1, 1);

    this.playOscillator(frequency, panning);
  }

  /**
   * Plays an oscillator with specified frequency and panning
   * @param frequency - The frequency of the oscillator in Hz
   * @param panning - The stereo panning value (-1 to 1)
   * @param wave - The oscillator wave type (default: 'sine')
   */
  private playOscillator(
    frequency: number,
    panning: number,
    wave: OscillatorType = 'sine',
  ): void {
    const duration = DEFAULT_DURATION;
    const volume = this.volume;

    // Start with a constant tone.
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    oscillator.start();
    this.activeOscillators.push(oscillator);

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
    this.activeGainNodes.push(gainNode);

    // Pane the audio.
    const stereoPannerNode = this.audioContext.createStereoPanner();
    stereoPannerNode.pan.value = panning;
    this.activeStereoPanners.push(stereoPannerNode);

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
    this.activePannerNodes.push(pannerNode);

    // Create the audio graph.
    oscillator.connect(gainNode);
    gainNode.connect(stereoPannerNode);
    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    // Clean up after the audio stops.
    this.timeoutId = setTimeout(
      () => {
        this.cleanupAudioNode(pannerNode, this.activePannerNodes);
        this.cleanupAudioNode(stereoPannerNode, this.activeStereoPanners);
        this.cleanupAudioNode(gainNode, this.activeGainNodes);

        oscillator.stop();
        this.cleanupAudioNode(oscillator, this.activeOscillators);
      },
      duration * 1e3 * 2,
    );
  }

  private playZero(): void {
    const frequency = NULL_FREQUENCY;
    const panning = 0;
    const wave = 'triangle';

    this.playOscillator(frequency, panning, wave);
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

  /**
   * Stops all currently playing audio and clears audio resources
   * @param audioId - Optional specific timeout ID to clear
   */
  public stop(audioId: NodeJS.Timeout | null = this.timeoutId): void {
    // Clear any pending timeouts
    if (audioId) {
      clearTimeout(audioId);
      this.timeoutId = null;
    }

    // Clean up all active oscillators without suspending the audio context
    // This allows autoplay to continue working while still cleaning up sound resources
    while (this.activeOscillators.length > 0) {
      const oscillator = this.activeOscillators[0];
      this.cleanupAudioNode(oscillator, this.activeOscillators);
    }

    // Clean up all active gain nodes
    while (this.activeGainNodes.length > 0) {
      const gainNode = this.activeGainNodes[0];
      this.cleanupAudioNode(gainNode, this.activeGainNodes);
    }

    // Clean up all active panner nodes
    while (this.activePannerNodes.length > 0) {
      const pannerNode = this.activePannerNodes[0];
      this.cleanupAudioNode(pannerNode, this.activePannerNodes);
    }

    // Clean up all active stereo panner nodes
    while (this.activeStereoPanners.length > 0) {
      const stereoPanner = this.activeStereoPanners[0];
      this.cleanupAudioNode(stereoPanner, this.activeStereoPanners);
    }
  }

  /**
   * Cleans up an audio node with smooth fade-out to prevent popping sounds
   * @param node - The audio node to clean up
   * @param nodeArray - The array tracking this type of node
   */
  private cleanupAudioNode<T extends AudioNode>(node: T, nodeArray: T[]): void {
    try {
      if (!node) {
        return;
      }

      // Handle GainNode with refined fade-out to prevent popping
      if (node instanceof GainNode) {
        const currentTime = this.audioContext.currentTime;
        const currentGain = node.gain.value;

        // Capture the current gain value precisely
        node.gain.cancelScheduledValues(currentTime);
        node.gain.setValueAtTime(currentGain, currentTime);

        // Use a longer exponential fade-out (sounds more natural than linear)
        // Use 100ms for smoother transition
        const fadeOutDuration = 0.1;
        // Exponential ramp can't reach zero, so use a very small value
        node.gain.exponentialRampToValueAtTime(0.0001, currentTime + fadeOutDuration);

        // Schedule disconnect after the fade completes with a small buffer
        setTimeout(() => {
          try {
            node.disconnect();
          } catch (e) {
            // Node may already be disconnected
          }
        }, Math.floor(fadeOutDuration * 1000) + 20);
      }
      // Handle oscillators with scheduled stop
      else if (node instanceof OscillatorNode) {
        const currentTime = this.audioContext.currentTime;
        // Allow more time for the gain node fade-out to complete
        const stopDelay = 0.12; // 120ms

        try {
          node.stop(currentTime + stopDelay);

          // Schedule the disconnect after oscillator stops completely
          setTimeout(() => {
            try {
              node.disconnect();
            } catch (e) {
              // Node may already be disconnected
            }
          }, stopDelay * 1000 + 30);
        } catch (e) {
          // Oscillator might already be stopped
          try {
            node.disconnect();
          } catch (innerE) {
            // Node may already be disconnected
          }
        }
      }
      // Handle stereo panner nodes
      else if (node instanceof StereoPannerNode) {
        // Add a small delay before disconnecting stereo panner for smoother transition
        setTimeout(() => {
          try {
            node.disconnect();
          } catch (e) {
            // Node may already be disconnected
          }
        }, 120);
      }
      // Other node types (like PannerNode)
      else {
        // Add a small delay before disconnecting other nodes
        setTimeout(() => {
          try {
            node.disconnect();
          } catch (e) {
            // Node may already be disconnected
          }
        }, 130);
      }
    } catch (error) {
      // Handle any unexpected errors during cleanup
      console.error('Error cleaning up audio node:', error);
    } finally {
      // Remove the node from its tracking array
      const index = nodeArray.indexOf(node);
      if (index !== -1) {
        nodeArray.splice(index, 1);
      }
    }
  }
}
