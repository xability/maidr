import type { SegmentedPoint } from '@type/grammar';

/**
 * Turning a 100% chart's values into the shares it draws.
 *
 * A `NORMALIZED` layer is a 100% stacked chart, and the core divides nothing
 * itself — fed one payload, `NORMALIZED` and `STACKED` announce identically.
 * So the shares have to reach it from the adapter, or the reader is pitched
 * the counts while every column is drawn the same height: a category of 1 and
 * 1 next to one of 300 and 100 sounds like a 300-fold rise where the chart
 * shows half a column against three quarters of one.
 *
 * Three adapters need this and each was written against a different payload
 * shape, so the arithmetic lives here rather than three times over
 * (#963, #965, #967).
 */

/**
 * Each category's magnitudes as percentages of that category's total.
 *
 * Safe whichever way the values arrived, because it is **idempotent in
 * proportion**: values already written as 25 and 75 come back as 25 and 75,
 * only now pinned to a total of 100. An adapter therefore does not have to
 * work out whether the chart library divided before it or not.
 *
 * Percentages rather than fractions, following the Highcharts adapter, which
 * takes Highcharts' own `point.percentage` for this layer type.
 *
 * @param values - Magnitudes as `[series][category]`, aligned by index
 * @returns The same shape, each category summing to 100
 */
export function toCategoryShares(values: number[][]): number[][] {
  const categories = values[0]?.length ?? 0;
  const totals = Array.from({ length: categories }, (_, row) =>
    values.reduce((sum, series) => sum + Math.abs(series[row] ?? 0), 0));

  return values.map(series =>
    series.map((value, row) => share(value, totals[row])));
}

/**
 * The same, for bands that arrive grouped by series rather than aligned.
 *
 * Totalled by the category's own value rather than by position, because a
 * series that skips a category leaves the arrays unaligned and pairing by
 * index would then divide one category's value by another's total.
 *
 * @param bands      - The layer's `SegmentedPoint[][]`, one array per series
 * @param horizontal - Whether the magnitude is in `x` and the category in `y`
 * @returns The same bands with each category summing to 100
 */
export function toSegmentedShares(
  bands: SegmentedPoint[][],
  horizontal: boolean,
): SegmentedPoint[][] {
  const magnitudeOf = (point: SegmentedPoint): number =>
    Number(horizontal ? point.x : point.y);
  const categoryOf = (point: SegmentedPoint): string =>
    String(horizontal ? point.y : point.x);

  const totals = new Map<string, number>();
  for (const band of bands) {
    for (const point of band) {
      const key = categoryOf(point);
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(magnitudeOf(point)));
    }
  }

  return bands.map(band => band.map((point) => {
    const scaled = share(magnitudeOf(point), totals.get(categoryOf(point)) ?? 0);
    return horizontal ? { ...point, x: scaled } : { ...point, y: scaled };
  }));
}

/**
 * One value against its category's total.
 *
 * A category whose bands are all zero has no total to divide by and no share
 * to report either. `0 / 0` would reach the trace as `NaN`, which it reads as
 * a *gap* rather than as an empty category, so the value is left alone.
 *
 * @param value - The magnitude
 * @param total - Its category's total, or zero when the category is empty
 * @returns The percentage, or the value unchanged when there is no total
 */
function share(value: number, total: number): number {
  return total ? (value / total) * 100 : value;
}
