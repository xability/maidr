import type { Disposable } from '@type/disposable';

/**
 * Audio palette types for distinguishing groups in multiclass plots
 */
export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface AudioPaletteEntry {
  waveType: WaveType;
  harmonicMix?: {
    fundamental: number;
    harmonics: Array<{ frequency: number; amplitude: number }>;
  };
  timbreModulation?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

/**
 * Service responsible for providing distinct audio signatures for different groups
 * in multiclass plots. Uses different wave types and sound mixes to create
 * distinguishable audio per group level.
 */
export class AudioPaletteService implements Disposable {
  // Harmonic generation constants
  private static readonly MIN_HARMONICS = 2;
  private static readonly HARMONIC_VARIATION = 3;
  
  private readonly basePalette: AudioPaletteEntry[];
  private readonly extendedPalette: Map<number, AudioPaletteEntry>;

  public constructor() {
    // Base palette with fundamental wave types
    this.basePalette = [
      {
        waveType: 'sine',
        timbreModulation: {
          attack: 0.01,
          decay: 0.1,
          sustain: 0.8,
          release: 0.2,
        },
      },
      {
        waveType: 'square',
        timbreModulation: {
          attack: 0.005,
          decay: 0.05,
          sustain: 0.7,
          release: 0.15,
        },
      },
      {
        waveType: 'sawtooth',
        timbreModulation: {
          attack: 0.02,
          decay: 0.08,
          sustain: 0.6,
          release: 0.25,
        },
      },
      {
        waveType: 'triangle',
        timbreModulation: {
          attack: 0.015,
          decay: 0.12,
          sustain: 0.9,
          release: 0.18,
        },
      },
    ];

    this.extendedPalette = new Map();
    this.generateExtendedPalette();
  }

  public dispose(): void {
    this.extendedPalette.clear();
  }

  /**
   * Gets the audio palette entry for a specific group index
   * @param groupIndex The index of the group (0-based)
   * @returns AudioPaletteEntry for the specified group
   */
  public getPaletteEntry(groupIndex: number): AudioPaletteEntry {
    if (groupIndex < this.basePalette.length) {
      return this.basePalette[groupIndex];
    }

    const cachedEntry = this.extendedPalette.get(groupIndex);
    if (cachedEntry) {
      return cachedEntry;
    }

    // Generate new entry for this group index
    const newEntry = this.generateExtendedEntry(groupIndex);
    this.extendedPalette.set(groupIndex, newEntry);
    return newEntry;
  }

  /**
   * Gets the total number of predefined palette entries
   */
  public get basePaletteSize(): number {
    return this.basePalette.length;
  }

  /**
   * Generates extended palette entries by creating unique combinations
   * of harmonic mixes and timbre modulations
   */
  private generateExtendedPalette(): void {
    // Pre-generate some common extended entries for better performance
    const extendedDefinitions: AudioPaletteEntry[] = [
      // Harmonic variations of sine wave
      {
        waveType: 'sine',
        harmonicMix: {
          fundamental: 1.0,
          harmonics: [
            { frequency: 2.0, amplitude: 0.3 },
            { frequency: 3.0, amplitude: 0.15 },
          ],
        },
        timbreModulation: {
          attack: 0.02,
          decay: 0.15,
          sustain: 0.7,
          release: 0.3,
        },
      },
      // Harmonic variations of square wave
      {
        waveType: 'square',
        harmonicMix: {
          fundamental: 1.0,
          harmonics: [
            { frequency: 1.5, amplitude: 0.4 },
            { frequency: 2.5, amplitude: 0.2 },
          ],
        },
        timbreModulation: {
          attack: 0.01,
          decay: 0.08,
          sustain: 0.6,
          release: 0.4,
        },
      },
      // Complex harmonic mix with sawtooth
      {
        waveType: 'sawtooth',
        harmonicMix: {
          fundamental: 1.0,
          harmonics: [
            { frequency: 1.25, amplitude: 0.35 },
            { frequency: 2.0, amplitude: 0.25 },
            { frequency: 3.0, amplitude: 0.1 },
          ],
        },
        timbreModulation: {
          attack: 0.03,
          decay: 0.2,
          sustain: 0.5,
          release: 0.35,
        },
      },
      // Triangle with unique modulation
      {
        waveType: 'triangle',
        harmonicMix: {
          fundamental: 1.0,
          harmonics: [
            { frequency: 0.5, amplitude: 0.2 },
            { frequency: 4.0, amplitude: 0.15 },
          ],
        },
        timbreModulation: {
          attack: 0.025,
          decay: 0.18,
          sustain: 0.8,
          release: 0.25,
        },
      },
    ];

    // Store pre-generated entries starting from index 4
    extendedDefinitions.forEach((entry, index) => {
      this.extendedPalette.set(this.basePalette.length + index, entry);
    });
  }

  /**
   * Generates a unique audio palette entry for a given group index
   * Uses mathematical combinations to create distinct but pleasant sounds
   */
  private generateExtendedEntry(groupIndex: number): AudioPaletteEntry {
    const baseIndex = groupIndex % this.basePalette.length;
    const baseEntry = this.basePalette[baseIndex];

    // Use the group index to create variations
    const variation = Math.floor((groupIndex - this.basePalette.length) / this.basePalette.length);

    // Generate harmonic mix based on variation
    const harmonics = this.generateHarmonics(variation);

    // Generate unique timbre modulation
    const timbreModulation = this.generateTimbreModulation(variation, baseEntry.timbreModulation!);

    return {
      waveType: baseEntry.waveType,
      harmonicMix: {
        fundamental: 1.0,
        harmonics,
      },
      timbreModulation,
    };
  }

  /**
   * Generates harmonic series for extended palette entries
   */
  private generateHarmonics(variation: number): Array<{ frequency: number; amplitude: number }> {
    const harmonics: Array<{ frequency: number; amplitude: number }> = [];

    // Generate harmonics based on variation
    const numHarmonics = AudioPaletteService.MIN_HARMONICS + (variation % AudioPaletteService.HARMONIC_VARIATION);

    for (let i = 0; i < numHarmonics; i++) {
      const frequency = 1.0 + (i + 1) * (0.5 + (variation * 0.3) % 1.0);
      const amplitude = 0.4 / (i + 1) * (1.0 - (variation * 0.1) % 0.3);

      harmonics.push({ frequency, amplitude });
    }

    return harmonics;
  }

  /**
   * Generates unique timbre modulation for extended palette entries
   */
  private generateTimbreModulation(variation: number, base: { attack: number; decay: number; sustain: number; release: number }): { attack: number; decay: number; sustain: number; release: number } {
    const factor = 1.0 + (variation * 0.2) % 0.5;

    return {
      attack: Math.max(0.005, Math.min(0.05, base.attack * factor)),
      decay: Math.max(0.05, Math.min(0.3, base.decay * factor)),
      sustain: Math.max(0.4, Math.min(0.9, base.sustain + (variation * 0.1) % 0.2)),
      release: Math.max(0.1, Math.min(0.5, base.release * factor)),
    };
  }
}
