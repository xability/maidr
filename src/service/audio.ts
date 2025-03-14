import type { Observer } from '@type/observable';
import type { GeneralSettings } from '@type/settings';
import type { PlotState } from '@type/state';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import {
  createClickSuppressor,
  createCrispEnvelope,
  createEnvelope,
  fadeIn,
  fadeOut,
} from '../audio/audio-transitions';

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
  /** Start time of the audio */
  startTime?: number;
  /** Duration of the audio */
  duration?: number;
}

const MIN_FREQUENCY = 200;
const MAX_FREQUENCY = 1000;
const NULL_FREQUENCY = 100;

const DEFAULT_DURATION = 0.3;
const DEFAULT_VOLUME = 0.5;

// Audio transition timing constants
const ATTACK_TIME = 0.015; // 15ms attack time
const RELEASE_TIME = 0.02; // 20ms release time

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
  private readonly settingsService?: SettingsService;

  private readonly isCombinedAudio: boolean;
  private volume: number;
  private mode: AudioMode;
  private timeoutId: NodeJS.Timeout | null;
  private activeResources: AudioResources[] = [];
  private attackTime: number = ATTACK_TIME;
  private releaseTime: number = RELEASE_TIME;
  private clickSuppressor: { input: AudioNode; output: AudioNode } | null = null;
  private crispClickSuppressor: { input: AudioNode; output: AudioNode } | null = null;
  private sineWaveSmoothing: boolean = true;
  private isAutoplayActive: boolean = false;

  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  public constructor(notification: NotificationService, isCombinedAudio: boolean, settingsService?: SettingsService) {
    this.notification = notification;
    this.settingsService = settingsService;

    this.isCombinedAudio = isCombinedAudio;
    this.volume = DEFAULT_VOLUME;
    this.mode = isCombinedAudio ? AudioMode.COMBINED : AudioMode.SEPARATE;
    this.timeoutId = null;

    // Apply settings if available
    if (this.settingsService) {
      const settings = this.settingsService.loadSettings();
      if (settings.general.audioTransitionTime) {
        // Convert from milliseconds to seconds for Web Audio API
        this.attackTime = settings.general.audioTransitionTime / 1000;
        this.releaseTime = settings.general.audioTransitionTime / 1000;
      }

      // Apply sine wave smoothing setting if available
      if (settings.general.sineWaveSmoothing !== undefined) {
        this.sineWaveSmoothing = settings.general.sineWaveSmoothing;
      }
    }

    this.audioContext = new AudioContext();

    // Create click suppressor chains for different contexts
    this.clickSuppressor = createClickSuppressor(this.audioContext, false); // Smooth for autoplay
    this.crispClickSuppressor = createClickSuppressor(this.audioContext, true); // Crisp for individual points

    this.compressor = this.initCompressor();
  }

  public destroy(): void {
    this.cleanupAllAudioResources();
    if (this.audioContext.state !== 'closed') {
      if (this.clickSuppressor) {
        try {
          this.clickSuppressor.output.disconnect();
          if (this.clickSuppressor.input.disconnect) {
            this.clickSuppressor.input.disconnect();
          }
        } catch {
          // Ignore errors during cleanup
        }
      }

      if (this.crispClickSuppressor) {
        try {
          this.crispClickSuppressor.output.disconnect();
          if (this.crispClickSuppressor.input.disconnect) {
            this.crispClickSuppressor.input.disconnect();
          }
        } catch {
          // Ignore errors during cleanup
        }
      }

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

    // For now connect through the crisp suppressor (default individual point context)
    // We'll switch this during playback depending on context
    if (this.crispClickSuppressor) {
      smoothGain.connect(this.crispClickSuppressor.input);
      this.crispClickSuppressor.output.connect(this.audioContext.destination);
    } else if (this.clickSuppressor) {
      smoothGain.connect(this.clickSuppressor.input);
      this.clickSuppressor.output.connect(this.audioContext.destination);
    } else {
      smoothGain.connect(this.audioContext.destination);
    }

    return compressor;
  }

  /**
   * Sets the autoplay state to configure audio processing appropriately
   *
   * @param isActive - Whether autoplay is active
   */
  public setAutoplayState(isActive: boolean): void {
    if (this.isAutoplayActive !== isActive) {
      this.isAutoplayActive = isActive;

      // Reconfigure audio path based on autoplay state
      this._reconfigureAudioPath();
    }
  }

  /**
   * Reconfigures the audio path between compressor and destination based on playback context
   */
  private _reconfigureAudioPath(): void {
    // Disconnect current paths
    try {
      if (this.compressor) {
        this.compressor.disconnect();
      }

      if (this.clickSuppressor) {
        this.clickSuppressor.output.disconnect();
      }

      if (this.crispClickSuppressor) {
        this.crispClickSuppressor.output.disconnect();
      }
    } catch {
      // Ignore disconnection errors
    }

    // Create a new gain node to connect to the appropriate filter chain
    const smoothGain = this.audioContext.createGain();
    smoothGain.gain.value = 0.5;

    // Connect compressor to gain
    this.compressor.connect(smoothGain);

    // Connect to the appropriate filter chain based on context
    if (this.isAutoplayActive && this.clickSuppressor) {
      // Smooth filter path for autoplay
      smoothGain.connect(this.clickSuppressor.input);
      this.clickSuppressor.output.connect(this.audioContext.destination);
    } else if (!this.isAutoplayActive && this.crispClickSuppressor) {
      // Crisp filter path for individual points
      smoothGain.connect(this.crispClickSuppressor.input);
      this.crispClickSuppressor.output.connect(this.audioContext.destination);
    } else {
      // Fallback direct connection
      smoothGain.connect(this.audioContext.destination);
    }
  }

  public update(state: PlotState): void {
    // Play audio only if turned on.
    if (this.mode === AudioMode.OFF) {
      return;
    }

    // Handle empty state
    if (state.empty) {
      return;
    }

    const audio = state.audio;

    // Handle array of values (multi-point data)
    if (Array.isArray(audio.value)) {
      const values = audio.value as number[];
      if (values.length === 0) {
        this.playZero();
        return;
      }

      // Set autoplay mode - this is definitely an autoplay sequence
      this.setAutoplayState(true);

      // Gracefully clean up any previous audio before starting new sequence
      this.cleanupAllAudioResources();

      // Set up sequential playback with better timing for autoplay
      let currentIndex = 0;
      // Determine playback rate based on audio mode
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;

      const playNext = (): void => {
        if (currentIndex < values.length) {
          // For sine waves specifically, we need extra care to prevent pops
          const isSineWave = this.getSoundVariationForGroup(audio.groupIndex).waveType === 'sine';

          // Clean up previous point only if we're not using sine waves
          // For sine waves, we let the envelope handle the transition
          if (!isSineWave && currentIndex > 0) {
            this.cleanupAllAudioResources();
          }

          // Play the current data point
          this.playTone(
            audio.min,
            audio.max,
            values[currentIndex],
            audio.size,
            currentIndex++,
            audio.groupIndex,
          );

          // Schedule next point
          this.timeoutId = setTimeout(playNext, playRate);
        } else {
          this.stop();
          // Reset autoplay state when finished
          this.setAutoplayState(false);
        }
      };

      // Start the playback sequence
      playNext();
    } else {
      // Single value mode - not autoplay
      this.setAutoplayState(false);

      // Handle single value
      const value = audio.value as number;

      // Check wave type for specialized handling
      const isSineWave = this.getSoundVariationForGroup(audio.groupIndex).waveType === 'sine';

      // For individual points, use appropriate cleanup strategy based on wave type
      if (isSineWave) {
        // For sine waves, use a more gradual cleanup to prevent pops
        this.cleanupAllAudioResources();
      } else {
        // For other wave types, standard cleanup is sufficient
        this.cleanupAllAudioResources();
      }

      // Play the value
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
      startTime: currentTime,
      duration,
    };

    // Determine if this is a sine wave that needs special handling
    const isSineWave = variation.waveType === 'sine';

    // Apply different envelope timing based on context and wave type
    let actualAttackTime = this.attackTime;
    let actualReleaseTime = this.releaseTime;

    if (this.isAutoplayActive) {
      // For autoplay, use longer transitions for sine waves when smoothing is enabled
      if (isSineWave && this.sineWaveSmoothing) {
        actualAttackTime = Math.max(this.attackTime * 1.5, 0.025); // At least 25ms for sine waves
        actualReleaseTime = Math.max(this.releaseTime * 1.5, 0.025); // At least 25ms for sine waves
      }
    } else {
      // For individual points, use shorter transitions for crisp sound
      actualAttackTime = Math.min(0.005, this.attackTime * 0.33);
      actualReleaseTime = Math.min(0.005, this.releaseTime * 0.33);
    }

    // Create and configure the main oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = variation.waveType;
    oscillator.frequency.value = frequency;
    resources.oscillator = oscillator;

    // Pre-calculate the optimal onset time to start oscillator before the sound is heard
    // This avoids phase discontinuities at the start
    const preStartTime = this.isAutoplayActive && isSineWave && this.sineWaveSmoothing ? 0.01 : 0.002;
    const actualStartTime = Math.max(0, currentTime - preStartTime);

    // Set up vibrato if specified in the variation
    if (variation.vibrato && variation.vibratoRate && variation.vibratoDepth) {
      const vibratoOsc = this.audioContext.createOscillator();
      vibratoOsc.type = 'sine';
      vibratoOsc.frequency.value = variation.vibratoRate;
      resources.vibratoOsc = vibratoOsc;

      const vibratoGain = this.audioContext.createGain();
      vibratoGain.gain.value = 0; // Start at zero to avoid immediate vibrato
      fadeIn(vibratoGain.gain, 0, variation.vibratoDepth, currentTime, actualAttackTime);
      resources.vibratoGain = vibratoGain;

      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      vibratoOsc.start(actualStartTime);
    }

    // Add harmonics if specified
    if (variation.harmonics && variation.harmonicVolume) {
      // Add two harmonic overtones
      const harmonicGain = this.audioContext.createGain();
      harmonicGain.gain.value = 0; // Start silent
      fadeIn(harmonicGain.gain, 0, variation.harmonicVolume, currentTime, this.attackTime);
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

      // Start both harmonics slightly early for smoother onset
      resources.harmonicOscs.forEach(osc => osc.start(actualStartTime));
    }

    // Create volume envelope based on playback context
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0; // Start silent to prevent initial pop
    resources.gainNode = gainNode;

    // Apply appropriate envelope based on playback context
    if (this.isAutoplayActive) {
      // Use smooth envelope for autoplay
      createEnvelope(
        gainNode,
        currentTime,
        duration,
        actualAttackTime,
        actualReleaseTime,
        volume, // Pass the volume as the sustain level
      );
    } else {
      // Use crisp envelope for individual points
      createCrispEnvelope(
        gainNode,
        currentTime,
        duration,
        actualAttackTime,
        actualReleaseTime,
        volume,
      );
    }

    // Set up filter if specified in the variation
    if (variation.filterType && variation.filterFreq) {
      const filterNode = this.audioContext.createBiquadFilter();
      filterNode.type = variation.filterType;
      filterNode.frequency.value = variation.filterFreq;
      resources.filterNode = filterNode;

      if (variation.filterQ) {
        filterNode.Q.value = variation.filterQ;
      }

      // Apply gentle filter parameter ramping to avoid clicks from sudden filter changes
      if (filterNode.frequency.value > 50) {
        filterNode.frequency.setValueAtTime(50, currentTime);
        filterNode.frequency.exponentialRampToValueAtTime(
          variation.filterFreq,
          currentTime + Math.min(this.attackTime, 0.01),
        );
      }
    }

    // Set up stereo panning with smoother transitions
    const stereoPannerNode = this.audioContext.createStereoPanner();
    // Start centered and move to target position
    stereoPannerNode.pan.setValueAtTime(0, currentTime);
    stereoPannerNode.pan.linearRampToValueAtTime(panning, currentTime + this.attackTime);
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

    // Start the oscillator slightly early for cleaner waveform onset
    oscillator.start(actualStartTime);

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

      // Apply a quick fade out to any still-playing oscillator before disconnecting
      // to avoid pops when cleaning up during autoplay
      if (resource.gainNode) {
        const currentTime = this.audioContext.currentTime;

        // Use a faster but still smooth release time for cleanup
        // Ensure minimum of 10ms for very fast cleanup needed during autoplay
        const quickReleaseTime = Math.max(Math.min(this.releaseTime * 0.5, 0.02), 0.01);

        // Cancel any scheduled parameter changes first
        try {
          resource.gainNode.gain.cancelScheduledValues(currentTime);
        } catch {
          // Ignore errors if nothing was scheduled
        }

        // Apply exponential fadeout for smoother transition
        fadeOut(resource.gainNode.gain, resource.gainNode.gain.value, 0.001, currentTime, quickReleaseTime);

        // Short delay before disconnecting to allow fade out to complete
        // Add a bit of extra buffer time to ensure the fade completes
        const delayMs = Math.ceil(quickReleaseTime * 1000) + 10;
        setTimeout(() => {
          try {
            this.finalizeCleanup(resource);
          } catch (e) {
            console.error('Error in delayed cleanup:', e);
          }
        }, delayMs);
      } else {
        this.finalizeCleanup(resource);
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
   * Complete the cleanup process by stopping and disconnecting all nodes
   * @param resource - The audio resource to clean up
   */
  private finalizeCleanup(resource: AudioResources): void {
    try {
      // Apply zero gain before disconnecting (final safety measure)
      if (resource.gainNode) {
        resource.gainNode.gain.value = 0;
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
        } catch {
          // Oscillator may already be stopped, which throws an error
        }
        resource.oscillator.disconnect();
      }

      // Clean up harmonics
      if (resource.harmonicOscs && resource.harmonicOscs.length > 0) {
        resource.harmonicOscs.forEach((osc) => {
          try {
            osc.stop();
          } catch {
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
        } catch {
          // Oscillator may already be stopped
        }
        resource.vibratoOsc.disconnect();

        if (resource.vibratoGain) {
          resource.vibratoGain.disconnect();
        }
      }
    } catch (error) {
      console.error('Error in finalizeCleanup:', error);
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

    // Reset autoplay state when explicitly stopped
    this.setAutoplayState(false);
  }

  public updateVolume(volume: number): void {
    this.volume = volume;
  }

  /**
   * Updates the audio transition timing based on user settings
   * @param transitionTimeMs - Transition time in milliseconds
   */
  public updateTransitionTime(transitionTimeMs: number): void {
    // Convert from milliseconds to seconds for Web Audio API
    // Ensure minimum value of 5ms and maximum of 100ms
    const safeTransitionTime = Math.max(5, Math.min(transitionTimeMs, 100));
    this.attackTime = safeTransitionTime / 1000;
    this.releaseTime = safeTransitionTime / 1000;
  }

  /**
   * Updates the audio service settings based on user preferences
   * @param settings - The settings to apply
   */
  public updateSettings(settings: GeneralSettings): void {
    // Update volume
    this.updateVolume(settings.volume / 100);

    // Update transition times
    this.updateTransitionTime(settings.audioTransitionTime);

    // Update sine wave smoothing
    this.sineWaveSmoothing = settings.sineWaveSmoothing;
  }
}
