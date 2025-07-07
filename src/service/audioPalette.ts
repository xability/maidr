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

  // Simple variations (4-7)
  SINE_VARIATION: 4,
  SQUARE_VARIATION: 5,
  SAWTOOTH_VARIATION: 6,
  TRIANGLE_VARIATION: 7,
} as const;

export interface AudioPaletteEntry {
  index: number;
  waveType: WaveType;
}

/**
 * Service responsible for providing distinct audio signatures for different groups
 * in multiclass plots. Uses different wave types to create distinguishable audio per group level.
 */
export class AudioPaletteService implements Disposable {
  private readonly basePalette: AudioPaletteEntry[];

  public constructor() {
    // Base palette with fundamental wave types
    this.basePalette = [
      {
        index: AudioPaletteIndex.SINE_BASIC,
        waveType: 'sine',
      },
      {
        index: AudioPaletteIndex.SQUARE_BASIC,
        waveType: 'square',
      },
      {
        index: AudioPaletteIndex.SAWTOOTH_BASIC,
        waveType: 'sawtooth',
      },
      {
        index: AudioPaletteIndex.TRIANGLE_BASIC,
        waveType: 'triangle',
      },
      {
        index: AudioPaletteIndex.SINE_VARIATION,
        waveType: 'sine',
      },
      {
        index: AudioPaletteIndex.SQUARE_VARIATION,
        waveType: 'square',
      },
      {
        index: AudioPaletteIndex.SAWTOOTH_VARIATION,
        waveType: 'sawtooth',
      },
      {
        index: AudioPaletteIndex.TRIANGLE_VARIATION,
        waveType: 'triangle',
      },
    ];
  }

  public dispose(): void {
    // No cleanup needed for simple palette
  }

  /**
   * Gets the audio palette entry for a specific group index
   * @param groupIndex The index of the group (0-based)
   * @returns AudioPaletteEntry for the specified group
   */
  public getPaletteEntry(groupIndex: number): AudioPaletteEntry {
    // Cycle through the base palette for any group index
    return this.basePalette[groupIndex % this.basePalette.length];
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
        return AudioPaletteIndex.SAWTOOTH_BASIC; // Sawtooth for negative market trends
      case 'Neutral':
        return AudioPaletteIndex.TRIANGLE_BASIC; // Triangle for neutral market trends
      default:
        // Defensive fallback for unexpected trend values
        return AudioPaletteIndex.SINE_BASIC;
    }
  }
}
