import type { EChartsList } from './types';

/**
 * Which column of a series' data list carries one of its coordinates.
 *
 * A series whose data is written inline -- `data: [[x, y], ...]` or
 * `data: [{ name, value }]` -- carries exactly the columns it is drawn from,
 * in coordinate order: `['x', 'y']`, `['value']`. A series fed from a
 * `dataset` does not. It carries **every** column of the dataset, in the
 * dataset's order, and `encode` says which of them each coordinate reads.
 * Measured on echarts 6.1.0 with Metabase's shape -- a dataset of
 * `['\0_x', 'count', 'sum']` and a bar encoding `{ x: '\0_x', y: 'sum' }` --
 * the list reports all three, so reading "the second column" announced every
 * bar's `count` instead of the `sum` it was drawn at. A horizontal bar
 * encoded `{ y: 'k', x: 'v' }` reported `['k', 'v']` and was read as its
 * category indices, and a pie encoded `{ itemName: 'k', value: 'w' }` read
 * the names as its values and produced no layer at all (#1304).
 *
 * `mapDimension` is how ECharts itself resolves a coordinate to its column,
 * and it answers the inline case too -- `'x'` to `'x'` -- so asking it is
 * right in both. The position is kept as a fallback for a list that does
 * not have it, and for a coordinate the series has none of.
 *
 * @param data       - The series' data list
 * @param coordinate - The coordinate to resolve: `'x'`, `'y'` or `'value'`
 * @param fallback   - The column to read when ECharts maps none
 * @returns The name of the column carrying that coordinate
 */
export function dimensionOf(
  data: EChartsList,
  coordinate: 'x' | 'y' | 'value',
  fallback: number,
): string {
  return data.mapDimension?.(coordinate) || data.dimensions[fallback];
}
