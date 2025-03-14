import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import type { NotificationService } from './notification';

interface Range {
  min: number;
  max: number;
}

/**
 * Tracks audio resources that need to be cleaned up
 */
interface AudioResources {
  /** Main oscillator node */
  oscillator?: OscillatorNode;
  /** Gain node for volume control */
  gainNode?: GainNode;
  /** Filter node if one is used */
  filterNode?: BiquadFilterNode;
  /** Stereo panner node */
  stereoPannerNode?: StereoPannerNode;
  /** 3D panner node */
  pannerNode?: PannerNode;
  /** Vibrato oscillator if used */
  vibratoOsc?: OscillatorNode;
  /** Vibrato gain node if used */
  vibratoGain?: GainNode;
  /** Harmonic oscillators if used */
  harmonicOscs?: OscillatorNode[];
  /** Harmonic gain node if used */
  harmonicGain?: GainNode;
  /** Cleanup timeout IDs */
  timeouts?: NodeJS.Timeout[];
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

// Define available wave types for audio legend
const WAVE_TYPES: OscillatorType[] = ['sine', 'square', 'triangle', 'sawtooth'];

/**
 * Configuration defining a sound variation for a data group
 * Allows for creating distinct timbres using various audio processing techniques
 */
interface SoundVariation {
  /** The base oscillator wave type */
  waveType: OscillatorType;
  /** Filter type to apply (if any) */
  filterType?: BiquadFilterType;
  /** Filter frequency (if filter is used) */
  filterFreq?: number;
  /** Filter Q factor (if filter is used) */
  filterQ?: number;
  /** Whether to apply vibrato effect */
  vibrato?: boolean;
  /** Vibrato rate in Hz (if vibrato is used) */
  vibratoRate?: number;
  /** Vibrato depth in Hz (if vibrato is used) */
  vibratoDepth?: number;
  /** Whether to apply harmonic overtones */
  harmonics?: boolean;
  /** Relative volume of harmonics (if harmonics are used) */
  harmonicVolume?: number;
  /** Description for notification */
  description: string;
}

/**
 * Predefined sound variations for different data groups
 * Each variation creates a distinct timbre while maintaining frequency and panning consistency
 */
const SOUND_VARIATIONS: SoundVariation[] = [
  // First 4 variations use basic wave types without additional processing
  { waveType: 'sine', description: 'Sine wave' },
  { waveType: 'square', description: 'Square wave' },
  { waveType: 'triangle', description: 'Triangle wave' },
  { waveType: 'sawtooth', description: 'Sawtooth wave' },

  // Additional variations with filters and effects
  {
    waveType: 'sine',
    filterType: 'lowpass',
    filterFreq: 800,
    filterQ: 5,
    description: 'Filtered sine wave',
  },
  {
    waveType: 'square',
    filterType: 'highpass',
    filterFreq: 300,
    filterQ: 3,
    description: 'Filtered square wave',
  },
  {
    waveType: 'triangle',
    vibrato: true,
    vibratoRate: 6,
    vibratoDepth: 15,
    description: 'Vibrato triangle wave',
  },
  {
    waveType: 'sawtooth',
    filterType: 'bandpass',
    filterFreq: 500,
    filterQ: 4,
    description: 'Bandpass filtered sawtooth',
  },
  {
    waveType: 'sine',
    harmonics: true,
    harmonicVolume: 0.3,
    description: 'Harmonic sine wave',
  },
  {
    waveType: 'triangle',
    filterType: 'notch',
    filterFreq: 700,
    filterQ: 8,
    description: 'Notch filtered triangle',
  },
  {
    waveType: 'square',
    vibrato: true,
    vibratoRate: 8,
    vibratoDepth: 20,
    description: 'Vibrato square wave',
  },
  {
    waveType: 'sawtooth',
    harmonics: true,
    harmonicVolume: 0.4,
    description: 'Harmonic sawtooth',
  },
  // Combined techniques for even more variations
  {
    waveType: 'sine',
    filterType: 'lowpass',
    filterFreq: 600,
    filterQ: 6,
    vibrato: true,
    vibratoRate: 5,
    vibratoDepth: 10,
    description: 'Filtered vibrato sine',
  },
  {
    waveType: 'square',
    filterType: 'highpass',
    filterFreq: 400,
    filterQ: 2,
    harmonics: true,
    harmonicVolume: 0.25,
    description: 'Filtered harmonic square',
  },
  {
    waveType: 'triangle',
    harmonics: true,
    harmonicVolume: 0.3,
    vibrato: true,
    vibratoRate: 7,
    vibratoDepth: 12,
    description: 'Harmonic vibrato triangle',
  },
  {
    waveType: 'sawtooth',
    filterType: 'lowshelf',
    filterFreq: 350,
    filterQ: 1,
    description: 'Lowshelf filtered sawtooth',
  },
];

export class AudioService implements Observer {
  private readonly notification: NotificationService;

  private readonly isCombinedAudio: boolean;
  private volume: number;
  private mode: AudioMode;
  private timeoutId: NodeJS.Timeout | null;
  private activeResources: AudioResources[] = [];

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
    this.cleanupAllAudioResources();
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
    this.cleanupAllAudioResources();

    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF) {
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
          this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++, audio.groupIndex);
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
        this.playTone(audio.min, audio.max, value, audio.size, audio.index, audio.groupIndex);
      }
    }
  }

  private playTone(
    minFrequency: number,
    maxFrequency: number,
    rawFrequency: number,
    panningSize: number,
    rawPanning: number,
    groupIndex?: number,
  ): void {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = { min: MIN_FREQUENCY, max: MAX_FREQUENCY };
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(rawPanning, fromPanning, toPanning), -1, 1);

    // Get the sound variation for this group
    const variation = this.getSoundVariationForGroup(groupIndex);

    this.playEnhancedOscillator(frequency, panning, variation);
  }

  /**
   * Gets the appropriate sound variation for a specific group index
   * @param groupIndex - The index of the data group/series
   * @returns The configuration for the group's sound variation
   */
  private getSoundVariationForGroup(groupIndex?: number): SoundVariation {
    if (groupIndex === undefined) {
      return SOUND_VARIATIONS[0]; // Default sound is first variation
    }

    // Use modulo to cycle through available variations if there are more groups than variations
    return SOUND_VARIATIONS[groupIndex % SOUND_VARIATIONS.length];
  }

  /**
   * Gets the appropriate wave type for a specific group index
   * @param groupIndex - The index of the data group/series
   * @returns The oscillator wave type to use
   */
  private getWaveTypeForGroup(groupIndex?: number): OscillatorType {
    if (groupIndex === undefined) {
      return 'sine'; // Default wave type
    }

    // Use modulo to cycle through available wave types if there are more groups than wave types
    return WAVE_TYPES[groupIndex % WAVE_TYPES.length];
  }

  /**
   * Plays an enhanced oscillator with optional filters and effects
   * @param frequency - Frequency of the oscillator in Hz
   * @param panning - Stereo panning value from -1 (left) to 1 (right)
   * @param variation - Sound variation configuration to apply
   */
  private playEnhancedOscillator(
    frequency: number,
    panning: number,
    variation: SoundVariation,
  ): void {
    const duration = DEFAULT_DURATION;
    const volume = this.volume;
    const currentTime = this.audioContext.currentTime;
    const resources: AudioResources = {
      timeouts: [],
    };

    // Create and configure the main oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = variation.waveType;
    oscillator.frequency.value = frequency;
    resources.oscillator = oscillator;

    // Set up vibrato if specified in the variation
    if (variation.vibrato && variation.vibratoRate && variation.vibratoDepth) {
      const vibratoOsc = this.audioContext.createOscillator();
      vibratoOsc.type = 'sine';
      vibratoOsc.frequency.value = variation.vibratoRate;
      resources.vibratoOsc = vibratoOsc;

      const vibratoGain = this.audioContext.createGain();
      vibratoGain.gain.value = variation.vibratoDepth;
      resources.vibratoGain = vibratoGain;

      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      vibratoOsc.start();
    }

    // Add harmonics if specified
    if (variation.harmonics && variation.harmonicVolume) {
      // Add two harmonic overtones
      const harmonicGain = this.audioContext.createGain();
      harmonicGain.gain.value = variation.harmonicVolume;
      resources.harmonicGain = harmonicGain;

      // First harmonic at 2x frequency (one octave up)
      const firstHarmonic = this.audioContext.createOscillator();
      firstHarmonic.type = variation.waveType;
      firstHarmonic.frequency.value = frequency * 2;
      firstHarmonic.connect(harmonicGain);

      // Second harmonic at 3x frequency
      const secondHarmonic = this.audioContext.createOscillator();
      secondHarmonic.type = variation.waveType;
      secondHarmonic.frequency.value = frequency * 3;
      secondHarmonic.connect(harmonicGain);

      resources.harmonicOscs = [firstHarmonic, secondHarmonic];
      harmonicGain.connect(this.compressor);

      // Start both harmonics
      resources.harmonicOscs.forEach(osc => osc.start());
    }

    // Create volume envelope
    const gainNode = this.audioContext.createGain();
    resources.gainNode = gainNode;
    const valueCurve = [
      0.5 * volume,
      volume,
      0.5 * volume,
      0.5 * volume,
      0.5 * volume,
      0.1 * volume,
      1e-4 * volume,
    ];
    gainNode.gain.setValueCurveAtTime(valueCurve, currentTime, duration);

    // Set up filter if specified in the variation
    if (variation.filterType && variation.filterFreq) {
      const filterNode = this.audioContext.createBiquadFilter();
      filterNode.type = variation.filterType;
      filterNode.frequency.value = variation.filterFreq;
      resources.filterNode = filterNode;

      if (variation.filterQ) {
        filterNode.Q.value = variation.filterQ;
      }
    }

    // Set up stereo panning
    const stereoPannerNode = this.audioContext.createStereoPanner();
    stereoPannerNode.pan.value = panning;
    resources.stereoPannerNode = stereoPannerNode;

    // Coordinate the audio slightly in front of the listener
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
    resources.pannerNode = pannerNode;

    // Create the audio graph based on which components are used
    oscillator.connect(gainNode);

    if (resources.filterNode) {
      // Connect through filter if it exists
      gainNode.connect(resources.filterNode);
      resources.filterNode.connect(stereoPannerNode);
    } else {
      // Connect directly if no filter
      gainNode.connect(stereoPannerNode);
    }

    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    // Start the oscillator
    oscillator.start();

    // Add this to active resources for tracking
    this.activeResources.push(resources);

    // Clean up after the audio stops
    const cleanupTimeout = setTimeout(
      () => this.cleanupAudioResource(resources),
      duration * 1e3 * 2,
    );

    if (resources.timeouts) {
      resources.timeouts.push(cleanupTimeout);
    }

    // Store the timeout ID for potential early stopping
    this.timeoutId = cleanupTimeout;
  }

  /**
   * Cleans up a specific audio resource, stopping and disconnecting all nodes
   * @param resource - The audio resources to clean up
   */
  private cleanupAudioResource(resource: AudioResources): void {
    try {
      // Clean up timeouts
      if (resource.timeouts) {
        resource.timeouts.forEach(timeout => clearTimeout(timeout));
      }

      // Disconnect all nodes in reverse order
      if (resource.pannerNode) {
        resource.pannerNode.disconnect();
      }

      if (resource.stereoPannerNode) {
        resource.stereoPannerNode.disconnect();
      }

      if (resource.filterNode) {
        resource.filterNode.disconnect();
      }

      if (resource.gainNode) {
        resource.gainNode.disconnect();
      }

      // Stop and disconnect oscillator
      if (resource.oscillator) {
        try {
          resource.oscillator.stop();
        } catch (e) {
          // Oscillator may already be stopped, which throws an error
        }
        resource.oscillator.disconnect();
      }

      // Clean up harmonics
      if (resource.harmonicOscs && resource.harmonicOscs.length > 0) {
        resource.harmonicOscs.forEach((osc) => {
          try {
            osc.stop();
          } catch (e) {
            // Oscillator may already be stopped
          }
          osc.disconnect();
        });

        if (resource.harmonicGain) {
          resource.harmonicGain.disconnect();
        }
      }

      // Clean up vibrato
      if (resource.vibratoOsc) {
        try {
          resource.vibratoOsc.stop();
        } catch (e) {
          // Oscillator may already be stopped
        }
        resource.vibratoOsc.disconnect();

        if (resource.vibratoGain) {
          resource.vibratoGain.disconnect();
        }
      }

      // Remove from active resources
      const index = this.activeResources.indexOf(resource);
      if (index !== -1) {
        this.activeResources.splice(index, 1);
      }
    } catch (error) {
      console.error('Error cleaning up audio resource:', error);
    }
  }

  /**
   * Cleans up all active audio resources
   */
  private cleanupAllAudioResources(): void {
    // Create a copy to avoid modification during iteration
    const resources = [...this.activeResources];

    // Clean up all resources
    resources.forEach(resource => this.cleanupAudioResource(resource));

    // Clear the array
    this.activeResources = [];

    // Also clear any pending main timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Legacy method to play a simple oscillator
   * Kept for backward compatibility
   */
  private playOscillator(
    frequency: number,
    panning: number,
    wave: OscillatorType = 'sine',
  ): void {
    const variation: SoundVariation = {
      waveType: wave,
      description: `Basic ${wave} wave`,
    };

    this.playEnhancedOscillator(frequency, panning, variation);
  }

  private playZero(): void {
    const frequency = NULL_FREQUENCY;
    const panning = 0;
    const variation: SoundVariation = {
      waveType: 'triangle',
      description: 'Zero value indicator',
    };

    this.playEnhancedOscillator(frequency, panning, variation);
  }

  /**
   * Plays an audio legend to demonstrate the different sounds for each group
   * @param groupCount - Number of different groups in the plot
   */
  public playAudioLegend(groupCount: number): void {
    if (this.mode === AudioMode.OFF) {
      this.notification.notify('Sound is off. Turn on sound to hear the audio legend.');
      return;
    }

    this.cleanupAllAudioResources();

    // Play a sequence of tones for each group
    const actualGroupCount = Math.min(groupCount, SOUND_VARIATIONS.length);
    let currentGroup = 0;

    const playNextGroup = (): void => {
      if (currentGroup < actualGroupCount) {
        const groupIndex = currentGroup++;
        const variation = this.getSoundVariationForGroup(groupIndex);

        // Play a mid-range frequency tone for each group
        const frequency = (MIN_FREQUENCY + MAX_FREQUENCY) / 2;
        this.playEnhancedOscillator(frequency, 0, variation);

        // Wait a bit longer between legend tones
        this.timeoutId = setTimeout(playNextGroup, DEFAULT_DURATION * 1500);

        this.notification.notify(`Group ${groupIndex + 1} sound: ${variation.description}`);
      }
    };

    this.notification.notify('Playing audio legend');
    playNextGroup();
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

  public stop(audioId: NodeJS.Timeout | null = this.timeoutId): void {
    if (audioId) {
      clearTimeout(audioId);
      this.timeoutId = null;
    }

    // Also clean up all active audio resources
    this.cleanupAllAudioResources();
  }

  public updateVolume(volume: number): void {
    this.volume = volume;
  }
}
