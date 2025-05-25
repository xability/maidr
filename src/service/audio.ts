import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import type { AudioPaletteEntry } from './audioPalette';
import type { NotificationService } from './notification';
import { AudioPaletteService } from './audioPalette';

interface Range {
  min: number;
  max: number;
}

type AudioId = ReturnType<typeof setTimeout>;

const MIN_FREQUENCY = 200;
const MAX_FREQUENCY = 1000;
const NULL_FREQUENCY = 100;
const WAITING_FREQUENCY = 440;
const COMPLETE_FREQUENCY = 880;

const DEFAULT_DURATION = 0.3;
const DEFAULT_VOLUME = 0.5;

enum AudioMode {
  OFF = 'off',
  SEPARATE = 'on',
  COMBINED = 'combined',
}

export class AudioService implements Observer<SubplotState | TraceState>, Disposable {
  private readonly notification: NotificationService;
  private readonly audioPalette: AudioPaletteService;

  private isCombinedAudio: boolean;
  private mode: AudioMode;

  private readonly activeAudioIds: Map<AudioId, OscillatorNode | OscillatorNode[]>;

  private readonly volume: number;
  private readonly audioContext: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  public constructor(notification: NotificationService, state: PlotState) {
    this.notification = notification;
    this.audioPalette = new AudioPaletteService();

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
    this.audioPalette.dispose();
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
    const groupIndex = audio.groupIndex ?? 0;

    // Determine if we need to use multiclass audio based on actual group count
    // Only use audio palette if there are multiple groups (groupIndex > 0) or if it's explicitly needed
    const shouldUseMulticlassAudio = groupIndex > 0;
    const paletteEntry = shouldUseMulticlassAudio ? this.audioPalette.getPaletteEntry(groupIndex) : undefined;

    if (audio.isContinuous) {
      this.playSmooth(audio.value as number[], audio.min, audio.max, audio.size, audio.index, paletteEntry);
    } else if (Array.isArray(audio.value)) {
      const values = audio.value as number[];
      if (values.length === 0) {
        this.playZeroTone(); // Always use original zero tone, regardless of groups
        return;
      }

      let currentIndex = 0;
      const playRate = this.mode === AudioMode.SEPARATE ? 50 : 0;
      const activeIds = new Array<AudioId>();
      const playNext = (): void => {
        if (currentIndex < values.length) {
          this.playTone(audio.min, audio.max, values[currentIndex], audio.size, currentIndex++, paletteEntry);
          activeIds.push(setTimeout(playNext, playRate));
        } else {
          this.stop(activeIds);
        }
      };

      playNext();
    } else {
      const value = audio.value as number;
      if (value === 0) {
        this.playZeroTone(); // Always use original zero tone, regardless of groups
      } else {
        this.playTone(audio.min, audio.max, value, audio.size, audio.index, paletteEntry);
      }
    }
  }

  private playTone(
    minFrequency: number,
    maxFrequency: number,
    rawFrequency: number,
    panningSize: number,
    rawPanning: number,
    paletteEntry?: AudioPaletteEntry,
  ): AudioId {
    const fromFreq = { min: minFrequency, max: maxFrequency };
    const toFreq = { min: MIN_FREQUENCY, max: MAX_FREQUENCY };
    const frequency = this.interpolate(rawFrequency, fromFreq, toFreq);

    const fromPanning = { min: 0, max: panningSize };
    const toPanning = { min: -1, max: 1 };
    const panning = this.clamp(this.interpolate(rawPanning, fromPanning, toPanning), -1, 1);

    return this.playOscillator(frequency, panning, paletteEntry);
  }

  private playOscillator(
    frequency: number,
    panning: number = 0,
    paletteEntry?: AudioPaletteEntry,
  ): AudioId {
    const duration = DEFAULT_DURATION;
    const volume = this.volume;

    // Use default sine wave if no palette entry provided (for backwards compatibility)
    if (!paletteEntry) {
      paletteEntry = { waveType: 'sine' };
    }

    const oscillators: OscillatorNode[] = [];
    const gainNodes: GainNode[] = [];

    // Create primary oscillator
    const primaryOscillator = this.audioContext.createOscillator();
    primaryOscillator.type = paletteEntry.waveType;
    primaryOscillator.frequency.value = frequency;
    oscillators.push(primaryOscillator);

    // Create harmonic oscillators if harmonic mix is present
    if (paletteEntry.harmonicMix) {
      for (const harmonic of paletteEntry.harmonicMix.harmonics) {
        const harmonicOscillator = this.audioContext.createOscillator();
        harmonicOscillator.type = paletteEntry.waveType; // Use same wave type for harmonics
        harmonicOscillator.frequency.value = harmonic.frequency * frequency;
        oscillators.push(harmonicOscillator);
      }
    }

    // Create gain nodes for each oscillator
    const startTime = this.audioContext.currentTime;
    for (let i = 0; i < oscillators.length; i++) {
      const gainNode = this.audioContext.createGain();

      // Apply timbre modulation envelope or use default
      let envelope: number[];
      let oscillatorVolume = volume;

      if (i === 0) {
        // Primary oscillator - use fundamental amplitude if specified
        if (paletteEntry.harmonicMix) {
          oscillatorVolume *= paletteEntry.harmonicMix.fundamental;
        }
      } else {
        // Harmonic oscillator - use harmonic amplitude
        const harmonic = paletteEntry.harmonicMix!.harmonics[i - 1];
        oscillatorVolume *= harmonic.amplitude;
      }

      if (paletteEntry.timbreModulation) {
        // Create ADSR envelope
        const { attack, decay, sustain, release } = paletteEntry.timbreModulation;
        const _attackTime = duration * attack;
        const _decayTime = duration * decay;
        const _releaseTime = duration * release;
        const _sustainTime = duration - _attackTime - _decayTime - _releaseTime;

        envelope = [];
        const _steps = 7; // Match original envelope curve complexity

        // Attack phase
        envelope.push(0.1 * oscillatorVolume);
        envelope.push(oscillatorVolume);

        // Decay phase
        envelope.push(sustain * oscillatorVolume);

        // Sustain phase
        envelope.push(sustain * oscillatorVolume);
        envelope.push(sustain * oscillatorVolume);

        // Release phase
        envelope.push(0.1 * oscillatorVolume);
        envelope.push(1e-4 * oscillatorVolume);
      } else {
        // Use default envelope
        envelope = [
          0.5 * oscillatorVolume,
          oscillatorVolume,
          0.5 * oscillatorVolume,
          0.5 * oscillatorVolume,
          0.5 * oscillatorVolume,
          0.1 * oscillatorVolume,
          1e-4 * oscillatorVolume,
        ];
      }

      gainNode.gain.setValueCurveAtTime(envelope, startTime, duration);
      gainNodes.push(gainNode);
    }

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
    for (let i = 0; i < oscillators.length; i++) {
      oscillators[i].connect(gainNodes[i]);
      gainNodes[i].connect(stereoPannerNode);
    }
    stereoPannerNode.connect(pannerNode);
    pannerNode.connect(this.compressor);

    // Start all oscillators
    oscillators.forEach(osc => osc.start());

    // Clean up after the audio stops.
    const cleanUp = (audioId: AudioId): void => {
      pannerNode.disconnect(this.compressor);
      stereoPannerNode.disconnect(pannerNode);

      for (let i = 0; i < oscillators.length; i++) {
        gainNodes[i].disconnect(stereoPannerNode);
        oscillators[i].stop();
        oscillators[i].disconnect(gainNodes[i]);
      }

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
    paletteEntry?: AudioPaletteEntry,
  ): void {
    const ctx = this.audioContext;
    const startTime = ctx.currentTime;
    const duration = DEFAULT_DURATION;

    // Use default sine wave if no palette entry provided
    const waveType = paletteEntry?.waveType || 'sine';

    // Normalize values to frequency
    const freqs = values.map(v => this.interpolate(v, { min, max }, { min: MIN_FREQUENCY, max: MAX_FREQUENCY }));

    // Ensure minimum of 2 frequencies
    if (freqs.length < 2) {
      freqs.push(freqs[0]);
    }

    // Calculate stereo pan (-1 to 1)
    const pan = this.clamp(this.interpolate(index, { min: 0, max: size - 1 }, { min: -1, max: 1 }), -1, 1);

    // Oscillator
    const oscillator = ctx.createOscillator();
    oscillator.type = waveType;
    oscillator.frequency.setValueCurveAtTime(freqs, startTime, duration);

    // Gain envelope - apply custom envelope if available
    const gainNode = ctx.createGain();
    let gainCurve: number[];

    if (paletteEntry?.timbreModulation) {
      const { attack: _attack, decay: _decay, sustain, release: _release } = paletteEntry.timbreModulation;
      const attackLevel = 0.5 * this.volume;
      const peakLevel = this.volume;
      const sustainLevel = sustain * this.volume;
      const _releaseLevel = 1e-4 * this.volume;

      gainCurve = [attackLevel, peakLevel, sustainLevel];
    } else {
      gainCurve = [1e-4 * this.volume, 0.5 * this.volume, 1e-4 * this.volume];
    }

    gainNode.gain.setValueCurveAtTime(gainCurve, startTime, duration);

    // Panner
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    // Connect and play
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
    // Always use original triangle wave for zero values, regardless of groups
    return this.playOscillator(NULL_FREQUENCY, 0, { waveType: 'triangle' });
  }

  public playWaitingTone(): AudioId {
    return setInterval(() => this.playOscillator(WAITING_FREQUENCY, 0, { waveType: 'sine' }), 1000);
  }

  public playCompleteTone(): AudioId {
    return this.playOscillator(COMPLETE_FREQUENCY, 0, { waveType: 'sine' });
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
