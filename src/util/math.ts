import { defaultFormat } from '@util/format';

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
    return min === max
      ? `constant ${defaultFormat(min)}`
      : `${defaultFormat(min)} to ${defaultFormat(max)}`;
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
   * How an axis's extent reads when the extent may not exist.
   *
   * {@link safeMin} and {@link safeMax} answer `Infinity` and `-Infinity` for
   * an empty array by design, and a non-finite coordinate makes both `NaN`.
   * Handing either pair to {@link spanned} produces the *string*
   * `Infinity to -Infinity` or `NaN to NaN`, and a string is exactly what the
   * description dialog's own non-finite blanking cannot catch -- it tests
   * numbers, so the placeholder sails through and is printed and spoken.
   *
   * `missing` is the word the announcements already use for a value that is
   * not there (see `FormatUtil.wrapFormat`), so the two surfaces agree.
   *
   * A genuinely constant axis is not this case: `constant 0` is finite, true,
   * and {@link spanned}'s to say.
   *
   * @param min - The axis minimum
   * @param max - The axis maximum
   * @returns The span, or `missing` when there is no finite extent
   */
  static spannedOrMissing(min: number, max: number): string {
    return Number.isFinite(min) && Number.isFinite(max)
      ? MathUtil.spanned(min, max)
      : 'missing';
  }

  /**
   * Pearson's product-moment correlation over paired samples, or null when the
   * pairs cannot support the claim.
   *
   * What a sighted reader takes from a scatter cloud before any individual
   * point: whether it tilts up, tilts down, or does not tilt. A reader who
   * walks 150 points one at a time has heard 150 numbers and still not been
   * told the relationship they were plotted to show.
   *
   * Two-pass and mean-centred rather than the textbook one-pass form
   * (`sum(xy) - n*meanX*meanY`), which cancels catastrophically when the values
   * are large beside their spread -- a Manhattan plot's genomic positions on x,
   * or epoch-millisecond timestamps -- and can return an `r` outside [-1, 1] or
   * a negative radicand. Two passes over an in-memory array cost nothing beside
   * the sorts a trace has already paid to build itself.
   *
   * Pairs where either coordinate is non-finite are skipped rather than
   * treated as zero: a missing y is not a y of 0, and traces deliberately keep
   * gaps as `NaN`. Null comes back when:
   * - fewer than three pairs survive. Any two distinct points lie exactly on a
   *   line, so `r` would be +/-1 by construction and say nothing about the data;
   * - either axis has zero variance, where `r` is 0/0. An axis that does not
   *   move cannot correlate with anything, and the description says so
   *   already, in the `constant` span {@link spanned} gives it;
   * - the result is not finite.
   *
   * Clamped to [-1, 1] because float error routinely yields 1.0000000000000002
   * on a perfect line, which would print as that and fall outside every
   * strength band a caller tests.
   *
   * @param xs - The x coordinate of each pair
   * @param ys - The y coordinate of each pair, index-aligned with `xs`
   * @returns Pearson's r in [-1, 1], or null when there is nothing to claim
   */
  static pearson(xs: readonly number[], ys: readonly number[]): number | null {
    const length = Math.min(xs.length, ys.length);
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < length; i++) {
      if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
        continue;
      }
      count++;
      sumX += xs[i];
      sumY += ys[i];
    }
    if (count < 3) {
      return null;
    }

    const meanX = sumX / count;
    const meanY = sumY / count;
    let varX = 0;
    let varY = 0;
    let covariance = 0;
    for (let i = 0; i < length; i++) {
      if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
        continue;
      }
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      varX += dx * dx;
      varY += dy * dy;
      covariance += dx * dy;
    }
    if (varX === 0 || varY === 0) {
      return null;
    }

    const r = covariance / Math.sqrt(varX * varY);
    return Number.isFinite(r) ? MathUtil.clamp(r, -1, 1) : null;
  }

  /**
   * How many pairs {@link pearson} was able to use -- both coordinates finite.
   *
   * Reported alongside `r` so a reader is told the sample the coefficient was
   * actually computed over, which on a layer with gaps is not the point count
   * the summary states above it.
   *
   * @param xs - The x coordinate of each pair
   * @param ys - The y coordinate of each pair, index-aligned with `xs`
   * @returns The number of usable pairs
   */
  static pairedCount(xs: readonly number[], ys: readonly number[]): number {
    const length = Math.min(xs.length, ys.length);
    let count = 0;
    for (let i = 0; i < length; i++) {
      if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) {
        count++;
      }
    }
    return count;
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
