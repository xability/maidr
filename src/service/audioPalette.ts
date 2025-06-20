import type { Disposable } from '@type/disposable';
import type { CandlestickTrend } from '@type/grammar';

/**
 * Audio palette types for distinguishing groups in multiclass plots
 */
export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

/**
 * Predefined palette indices for base audio signatures.
 * These constants provide semantic meaning to palette positions
 * and make the code more maintainable than magic numbers.
 */
export const AudioPaletteIndex = {
  // Basic wave types (0-3)
  SINE_BASIC: 0,
  SQUARE_BASIC: 1,
  SAWTOOTH_BASIC: 2,
  TRIANGLE_BASIC: 3,

  // Harmonic variations (4+)
  SAWTOOTH_DARK: 4,
  SINE_HARMONIC: 5,
  TRIANGLE_HARMONIC: 6,
  SQUARE_HARMONIC: 7,
  TRIANGLE_MELLOW: 8,
  SINE_SUBTLE: 9,
  SAWTOOTH_SOFT: 10,
} as const;

export interface AudioPaletteEntry {
  index: number;
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
    // IMPORTANT: Base palette index consistency requirement
    // When modifying this basePalette array:
    // 1. Each entry's `index` property MUST match its array position (0-based)
    // 2. Use AudioPaletteIndex constants for semantic clarity
    // 3. Update AudioPaletteIndex constants if adding/removing entries
    // 4. The validateBasePalette() method will enforce this at runtime
    //
    // Example: basePalette[0] must have index: AudioPaletteIndex.SINE_BASIC (0)
    //          basePalette[1] must have index: AudioPaletteIndex.SQUARE_BASIC (1)
    //
    // This consistency is critical for proper audio palette group mapping.

    // Base palette with fundamental wave types
    this.basePalette = [
      {
        index: AudioPaletteIndex.SINE_BASIC,
        waveType: 'sine',
        timbreModulation: {
          attack: 0.01,
          decay: 0.1,
          sustain: 0.8,
          release: 0.2,
        },
      },
      {
        index: AudioPaletteIndex.SQUARE_BASIC,
        waveType: 'square',
        timbreModulation: {
          attack: 0.005,
          decay: 0.05,
          sustain: 0.7,
          release: 0.15,
        },
      },
      {
        index: AudioPaletteIndex.SAWTOOTH_BASIC,
        waveType: 'sawtooth',
        timbreModulation: {
          attack: 0.02,
          decay: 0.08,
          sustain: 0.6,
          release: 0.25,
        },
      },
      {
        index: AudioPaletteIndex.TRIANGLE_BASIC,
        waveType: 'triangle',
        timbreModulation: {
          attack: 0.015,
          decay: 0.12,
          sustain: 0.9,
          release: 0.18,
        },
      },
      {
        index: AudioPaletteIndex.SAWTOOTH_DARK,
        waveType: 'sawtooth',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 2, amplitude: 0.2 }, // subtle overtones
            { frequency: 3, amplitude: 0.1 },
            { frequency: 5, amplitude: 0.05 },
          ],
        },
        timbreModulation: {
          attack: 0.005, // sharp entry for tension
          decay: 0.3, // slow fade to create unease
          sustain: 0.4, // keep it low and brooding
          release: 0.5, // longer tail for emotional weight
        },
      },
      {
        index: AudioPaletteIndex.SINE_HARMONIC,
        waveType: 'sine',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 2, amplitude: 0.15 },
            { frequency: 4, amplitude: 0.05 },
          ],
        },
        timbreModulation: {
          attack: 0.02,
          decay: 0.2,
          sustain: 0.6,
          release: 0.3,
        },
      },
      {
        index: AudioPaletteIndex.TRIANGLE_HARMONIC,
        waveType: 'triangle',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 3, amplitude: 0.2 },
            { frequency: 6, amplitude: 0.1 },
          ],
        },
        timbreModulation: {
          attack: 0.01,
          decay: 0.1,
          sustain: 0.8,
          release: 0.2,
        },
      },
      {
        index: AudioPaletteIndex.SQUARE_HARMONIC,
        waveType: 'square',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 3, amplitude: 0.1 },
            { frequency: 7, amplitude: 0.05 },
          ],
        },
        timbreModulation: {
          attack: 0.005,
          decay: 0.05,
          sustain: 0.5,
          release: 0.1,
        },
      },
      {
        index: AudioPaletteIndex.TRIANGLE_MELLOW,
        waveType: 'triangle',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 2.5, amplitude: 0.15 },
            { frequency: 4.5, amplitude: 0.08 },
          ],
        },
        timbreModulation: {
          attack: 0.01,
          decay: 0.4,
          sustain: 0.3,
          release: 0.5,
        },
      },
      {
        index: AudioPaletteIndex.SINE_SUBTLE,
        waveType: 'sine',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 2, amplitude: 0.1 },
            { frequency: 3, amplitude: 0.05 },
          ],
        },
        timbreModulation: {
          attack: 0.02,
          decay: 0.1,
          sustain: 0.9,
          release: 0.15,
        },
      },
      {
        index: AudioPaletteIndex.SAWTOOTH_SOFT,
        waveType: 'sawtooth',
        harmonicMix: {
          fundamental: 1,
          harmonics: [
            { frequency: 2, amplitude: 0.05 },
            { frequency: 6, amplitude: 0.02 },
          ],
        },
        timbreModulation: {
          attack: 0.005,
          decay: 0.4,
          sustain: 0.2,
          release: 0.6,
        },
      },
    ];

    // Validate that array indices match the index properties
    this.validateBasePalette();

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
   * Determines the appropriate audio palette index for candlestick trends.
   * This encapsulates the business logic for mapping market conditions
   * to distinct audio signatures.
   *
   * @param trend The candlestick trend (Bull, Bear, or Neutral)
   * @returns The palette index for the specified trend
   */
  public getCandlestickGroupIndex(trend: CandlestickTrend): number {
    switch (trend) {
      case 'Bull':
        return AudioPaletteIndex.SINE_BASIC; // Basic sine for positive market trends
      case 'Bear':
        return AudioPaletteIndex.SAWTOOTH_SOFT; // Soft sawtooth for negative market trends
      case 'Neutral':
        return AudioPaletteIndex.TRIANGLE_BASIC; // Triangle for neutral market trends
      default:
        // Defensive fallback for unexpected trend values
        return AudioPaletteIndex.SINE_BASIC;
    }
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
        index: this.basePalette.length,
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
        index: this.basePalette.length + 1,
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
        index: this.basePalette.length + 2,
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
        index: this.basePalette.length + 3,
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
    const variation = Math.floor(
      (groupIndex - this.basePalette.length) / this.basePalette.length,
    );

    // Generate harmonic mix based on variation
    const harmonics = this.generateHarmonics(variation);

    // Generate unique timbre modulation
    const timbreModulation = this.generateTimbreModulation(
      variation,
      baseEntry.timbreModulation!,
    );

    return {
      index: groupIndex,
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
  private generateHarmonics(
    variation: number,
  ): Array<{ frequency: number; amplitude: number }> {
    const harmonics: Array<{ frequency: number; amplitude: number }> = [];

    // Generate harmonics based on variation
    const numHarmonics
      = AudioPaletteService.MIN_HARMONICS
        + (variation % AudioPaletteService.HARMONIC_VARIATION);

    for (let i = 0; i < numHarmonics; i++) {
      const frequency = 1.0 + (i + 1) * (0.5 + ((variation * 0.3) % 1.0));
      const amplitude = (0.4 / (i + 1)) * (1.0 - ((variation * 0.1) % 0.3));

      harmonics.push({ frequency, amplitude });
    }

    return harmonics;
  }

  /**
   * Generates unique timbre modulation for extended palette entries
   */
  private generateTimbreModulation(
    variation: number,
    base: { attack: number; decay: number; sustain: number; release: number },
  ): { attack: number; decay: number; sustain: number; release: number } {
    const factor = 1.0 + ((variation * 0.2) % 0.5);

    return {
      attack: Math.max(0.005, Math.min(0.05, base.attack * factor)),
      decay: Math.max(0.05, Math.min(0.3, base.decay * factor)),
      sustain: Math.max(
        0.4,
        Math.min(0.9, base.sustain + ((variation * 0.1) % 0.2)),
      ),
      release: Math.max(0.1, Math.min(0.5, base.release * factor)),
    };
  }

  /**
   * Validates that all base palette entries have correct indices to prevent silent mismatches
   * when reordering. Ensures that each entry's index property matches its array position.
   * This method should be called in the constructor and whenever the basePalette is modified.
   *
   * @throws Error if any entry's index doesn't match its array position
   */
  private validateBasePalette(): void {
    this.basePalette.forEach((entry, arrayIndex) => {
      if (entry.index !== arrayIndex) {
        throw new Error(
          `AudioPalette validation error: Entry at array position ${arrayIndex} has index ${entry.index}. `
          + `Array position must match the index property to prevent audio palette mismatches.`,
        );
      }
    });
  }
}
