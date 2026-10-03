/**
 * The numbers Excel computes from a chart's data before it draws it -- a
 * histogram's bins, a box's quartiles and whiskers -- worked out the way
 * Microsoft documents Excel working them out.
 *
 * Office.js hands an add-in only the values a histogram or a box and whisker
 * chart is computed from, never the bins or quartiles it draws, so the reading
 * has to compute them again. Pure: numbers in, numbers out.
 */

/**
 * How a box and whisker chart computes its quartiles
 * (`Excel.ChartBoxQuartileCalculation`).
 *
 * - `Inclusive` is `QUARTILE.INC`, numpy's `linear`: the `p` quantile sits at
 *   rank `p * (n - 1)`, counting from 0.
 * - `Exclusive` is `QUARTILE.EXC`, numpy's `weibull`: rank `p * (n + 1)`,
 *   counting from 1, held at the smallest and largest value outside them.
 */
export type QuartileMethod = 'Inclusive' | 'Exclusive';

/** A histogram's binning (`Excel.ChartBinOptions`), as far as the reading needs it. */
export interface BinRule {
  /** `Auto` is Scott's normal reference rule; the other two are the author's. */
  readonly type: 'Auto' | 'BinWidth' | 'BinCount';
  /** The bin width, for `BinWidth`. */
  readonly width?: number;
  /** How many bins, overflow and underflow included, for `BinCount`. */
  readonly count?: number;
  /** Every value at or below it goes in one underflow bin, when set. */
  readonly underflow?: number;
  /** Every value above it goes in one overflow bin, when set. */
  readonly overflow?: number;
}

/** One bin of a histogram. */
export interface Bin {
  /** The lower bound, as it is announced; see `announcedEdge`. */
  readonly min: number;
  /** The upper bound, as it is announced. */
  readonly max: number;
  /** How many values fell in it. */
  readonly count: number;
  /** What Excel's category axis calls it: `[1, 5]`, `(5, 9]`, `≤1`, `>9`. */
  readonly label: string;
}

/** A box: the five numbers and the values beyond the whiskers. */
export interface BoxSummary {
  /** The lower whisker's end: the smallest value within 1.5 IQR of the box. */
  readonly min: number;
  readonly q1: number;
  readonly q2: number;
  readonly q3: number;
  /** The upper whisker's end: the largest value within 1.5 IQR of the box. */
  readonly max: number;
  readonly lowerOutliers: number[];
  readonly upperOutliers: number[];
}

/**
 * A number without the noise binary arithmetic leaves in it, so `0.1 + 0.2`
 * is `0.3` and a bin edge built by adding a width reads as the author wrote it.
 */
export function tidy(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
}

/**
 * The sample standard deviation (`STDEV.S`), the `n - 1` form.
 *
 * @param values - At least two values for a spread; one gives 0.
 */
export function sampleDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}

/**
 * The bin width Excel's automatic histogram uses: Scott's normal reference
 * rule, `3.5 * s / n^(1/3)` with `s` the sample standard deviation.
 *
 * @param values - The values binned.
 * @returns The width; 0 when the values do not spread.
 */
export function scottWidth(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return (3.5 * sampleDeviation(values)) / Math.cbrt(values.length);
}

/**
 * A bin edge as it is announced: rounded to the place of the bin width's
 * third significant figure, so a width of 3.61 gives `4.61` rather than
 * `4.608319134549957`. The bins are counted against the exact edges; only
 * what is said is rounded.
 */
function announcedEdge(value: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(width)) {
    return tidy(value);
  }
  const decimals = Math.min(12, Math.max(0, 2 - Math.floor(Math.log10(width))));
  return Number(value.toFixed(decimals));
}

/**
 * The regular bins between `low` and `high`: equal widths from `low`, each
 * closed on the right, `(a, b]` -- the rule Excel states for its histogram --
 * except the first, which is closed on the left too when there is no
 * underflow bin, so the smallest value is in it.
 */
function regularBins(
  sorted: readonly number[],
  low: number,
  high: number,
  rule: BinRule,
): Bin[] {
  if (high < low) {
    return [];
  }
  const reserved = (rule.underflow === undefined ? 0 : 1) + (rule.overflow === undefined ? 0 : 1);
  let width: number;
  let count: number;
  if (rule.type === 'BinCount') {
    count = Math.max(1, Math.round(rule.count ?? 1) - reserved);
    width = (high - low) / count;
  } else {
    width = rule.type === 'BinWidth' ? (rule.width ?? 0) : scottWidth(sorted);
    count = width > 0 && Number.isFinite(width)
      ? Math.max(1, Math.ceil(tidy((high - low) / width)))
      : 1;
  }
  if (!(width > 0) || !Number.isFinite(width)) {
    // Every value is the same, or the author's width is no width: one bin.
    width = 0;
    count = 1;
  }

  const closedFirst = rule.underflow === undefined;
  const edges = Array.from({ length: count + 1 }, (_, i) => tidy(low + i * width));
  if (width === 0) {
    edges[1] = high;
  }
  if (rule.overflow !== undefined || rule.type === 'BinCount') {
    // Above an overflow value is the overflow bin's; a bin count ends exactly
    // at the top. Either way no regular bin reaches past `high`.
    edges[count] = high;
  }

  const bins: Bin[] = [];
  for (let i = 0; i < count; i++) {
    const lower = edges[i];
    const upper = edges[i + 1];
    const closedLeft = i === 0 && closedFirst;
    const counted = sorted.filter(value => (closedLeft ? value >= lower : value > lower) && value <= upper && value <= high).length;
    const min = announcedEdge(lower, width);
    const max = announcedEdge(upper, width);
    const label = closedLeft ? `[${min}, ${max}]` : `(${min}, ${max}]`;
    bins.push({ min, max, count: counted, label });
  }
  return bins;
}

/**
 * Bin values as Excel's histogram does.
 *
 * The regular bins start at the smallest value, or at the underflow value when
 * there is an underflow bin, and stop at the largest, or at the overflow
 * value. An underflow bin holds every value at or below its value, an
 * overflow bin every value above its value; each is there whenever the chart
 * enables it, empty or not, as Excel draws them.
 *
 * @param values - The numbers binned; blanks already left out.
 * @param rule - How Excel was told to bin them.
 * @returns The bins, in axis order.
 */
export function binValues(values: readonly number[], rule: BinRule): Bin[] {
  if (values.length === 0) {
    return [];
  }
  const sorted = [...values].sort((a, b) => a - b);
  const smallest = sorted[0];
  const largest = sorted[sorted.length - 1];
  const low = rule.underflow ?? smallest;
  const high = rule.overflow ?? largest;
  const bins: Bin[] = [];
  if (rule.underflow !== undefined) {
    const at = rule.underflow;
    bins.push({
      min: tidy(Math.min(smallest, at)),
      max: at,
      count: sorted.filter(value => value <= at).length,
      label: `≤${String(tidy(at))}`,
    });
  }
  bins.push(...regularBins(sorted, low, high, rule));
  if (rule.overflow !== undefined) {
    const at = rule.overflow;
    bins.push({
      min: at,
      max: tidy(Math.max(largest, at)),
      count: sorted.filter(value => value > at).length,
      label: `>${String(tidy(at))}`,
    });
  }
  return bins;
}

/**
 * One quantile of sorted values, by Excel's quartile calculation.
 *
 * @param sorted - The values, ascending; at least one.
 * @param p - The probability, from 0 to 1.
 * @param method - `Inclusive` or `Exclusive`.
 */
export function quantile(sorted: readonly number[], p: number, method: QuartileMethod): number {
  const n = sorted.length;
  if (n === 1) {
    return sorted[0];
  }
  if (method === 'Exclusive') {
    const rank = p * (n + 1);
    if (rank <= 1) {
      return sorted[0];
    }
    if (rank >= n) {
      return sorted[n - 1];
    }
    const below = Math.floor(rank);
    return tidy(sorted[below - 1] + (rank - below) * (sorted[below] - sorted[below - 1]));
  }
  const rank = p * (n - 1);
  const below = Math.floor(rank);
  if (below >= n - 1) {
    return sorted[n - 1];
  }
  return tidy(sorted[below] + (rank - below) * (sorted[below + 1] - sorted[below]));
}

/**
 * A box and its whiskers, as Excel's box and whisker chart draws them: the
 * quartiles by the chart's calculation, the whiskers to the furthest values
 * within 1.5 times the interquartile range of the box, and every value beyond
 * them an outlier.
 *
 * @param values - The numbers of one box; at least one.
 * @param method - The chart's quartile calculation.
 */
export function boxSummary(values: readonly number[], method: QuartileMethod): BoxSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25, method);
  const q2 = quantile(sorted, 0.5, method);
  const q3 = quantile(sorted, 0.75, method);
  const reach = 1.5 * (q3 - q1);
  const lowFence = q1 - reach;
  const highFence = q3 + reach;
  const inside = sorted.filter(value => value >= lowFence && value <= highFence);
  return {
    min: inside[0] ?? q1,
    q1,
    q2,
    q3,
    max: inside[inside.length - 1] ?? q3,
    lowerOutliers: sorted.filter(value => value < lowFence),
    upperOutliers: sorted.filter(value => value > highFence),
  };
}
