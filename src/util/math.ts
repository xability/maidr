/**
 * Mathematical utility functions for common operations across the codebase.
 * These utilities help reduce code duplication while maintaining type safety.
 */
export abstract class MathUtil {
  private constructor() { /* Prevent instantiation */ }

  /**
   * How an axis's extent reads: a span, or the one value it never leaves.
   *
   * `5 to 5` is true and says nothing. A rug plot's cross axis prints it
   * because both bindings read a rug as a point trace with a constant on that
   * axis (#1132); a parallel-coordinates column that never varies prints it
   * because the column really is constant; a one-bin histogram prints it
   * because there is one bin. In every case the reader is told a range and
   * handed a point.
   *
   * That constant is also why pitch carries nothing on such an axis: every
   * sample sonifies at the bottom of the range, because the range has no
   * height. Saying so is the smallest thing that removes the surprise -- a
   * reader who has been told the axis does not move knows the identical tones
   * are the chart rather than a fault -- and it needs no new announcement
   * convention, because these are stats that already existed and were merely
   * uninformative (#1136).
   *
   * What it deliberately does not do is change what pitch *means* mid-chart.
   * Mapping it to a varying axis instead would hand a reader who has learnt
   * "pitch is y" a chart where pitch is x, unannounced, which is the kind of
   * silent mode change #855 and #947 were both about. That option, and a
   * trace type of its own, are still open on #1132.
   *
   * Not for every `a to b` in a description. A choropleth's jump, a flow's
   * source and target, and a ridgeline's narrowest and widest modes are a
   * pair or a path rather than one axis's extent, and `constant x` would be
   * the wrong sentence for all three.
   *
   * @param min - The axis minimum
   * @param max - The axis maximum
   * @returns `constant <value>` when the axis never moves, `<min> to <max>` otherwise
   */
  static spanned(min: number, max: number): string {
    return min === max ? `constant ${min}` : `${min} to ${max}`;
  }

  /**
   * Safely finds the minimum value from an array of numbers.
   * Returns Infinity for empty arrays (mathematically correct: empty set has no minimum).
   * This prevents subtle bugs where 0 might be confused with actual data.
   * @param values - Array of numbers to find minimum from
   * @returns The minimum value or Infinity if array is empty
   */
  static safeMin(values: number[]): number {
    return values.length === 0 ? Infinity : Math.min(...values);
  }

  /**
   * Safely finds the maximum value from an array of numbers.
   * Returns -Infinity for empty arrays (mathematically correct: empty set has no maximum).
   * This prevents subtle bugs where 0 might be confused with actual data.
   * @param values - Array of numbers to find maximum from
   * @returns The maximum value or -Infinity if array is empty
   */
  static safeMax(values: number[]): number {
    return values.length === 0 ? -Infinity : Math.max(...values);
  }

  /**
   * Finds the minimum value from a 2D array of numbers.
   * @param values - 2D array of numbers
   * @returns The minimum value across all nested arrays
   */
  static minFrom2D(values: number[][]): number {
    const flattened = values.flat();
    return this.safeMin(flattened);
  }

  /**
   * Finds the maximum value from a 2D array of numbers.
   * @param values - 2D array of numbers
   * @returns The maximum value across all nested arrays
   */
  static maxFrom2D(values: number[][]): number {
    const flattened = values.flat();
    return this.safeMax(flattened);
  }

  /**
   * Finds min and max from an array in a single pass.
   * More efficient than separate min/max calls for large arrays.
   * Returns { min: Infinity, max: -Infinity } for empty arrays.
   * @param values - Array of numbers
   * @returns Object with min and max properties
   */
  static minMax(values: number[]): { min: number; max: number } {
    if (values.length === 0) {
      return { min: Infinity, max: -Infinity };
    }

    let min = values[0];
    let max = values[0];

    for (let i = 1; i < values.length; i++) {
      const value = values[i];
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }

    return { min, max };
  }

  /**
   * Finds min and max from a 2D array in a single pass.
   * @param values - 2D array of numbers
   * @returns Object with min and max properties
   */
  static minMaxFrom2D(values: number[][]): { min: number; max: number } {
    const flattened = values.flat();
    return this.minMax(flattened);
  }

  /**
   * Clamps a value into the inclusive `[min, max]` range.
   * @param value - The value to clamp
   * @param min - Lower bound (inclusive)
   * @param max - Upper bound (inclusive)
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Linearly maps a value from one numeric range to another.
   * Collapses to `toMin` when the source range is zero-width to avoid NaN.
   * @param value - The value in the source range
   * @param fromMin - Lower bound of the source range
   * @param fromMax - Upper bound of the source range
   * @param toMin - Lower bound of the target range
   * @param toMax - Upper bound of the target range
   */
  static interpolate(
    value: number,
    fromMin: number,
    fromMax: number,
    toMin: number,
    toMax: number,
  ): number {
    if (fromMin === fromMax) {
      return toMin;
    }
    return ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin;
  }
}
