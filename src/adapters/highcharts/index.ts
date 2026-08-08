/**
 * Public Highcharts adapter API for MAIDR.
 *
 * Provides the {@link highchartsToMaidr} function to convert Highcharts chart
 * instances into MAIDR-compatible data (including multi-pane charts, which
 * become MAIDR subplot grids), {@link highchartsGridToMaidr} to combine
 * several chart instances into one figure with subplot navigation, and
 * {@link createHighchartsSync} for bidirectional visual synchronization
 * (tooltip and point highlighting).
 *
 * @remarks
 * Highcharts is **not** bundled — users must provide their own Highcharts
 * installation. This module only reads from the Highcharts chart API and
 * generates a plain JSON descriptor that MAIDR understands.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { createHighchartsSync, highchartsToMaidr } from 'maidr/highcharts';
 *
 * const chart = Highcharts.chart('container', {
 *   chart: { type: 'column' },
 *   title: { text: 'Fruit Consumption' },
 *   xAxis: { categories: ['Apples', 'Bananas', 'Oranges'] },
 *   series: [{ name: 'Sales', data: [1, 4, 3] }],
 * });
 *
 * const maidrData = highchartsToMaidr(chart);
 * const sync = createHighchartsSync(chart);
 * ```
 *
 * @packageDocumentation
 */

export { highchartsToMaidr } from './adapter';
export { highchartsGridToMaidr } from './grid';
export { createHighchartsSync } from './sync';
export type { HighchartsSync } from './sync';
export type {
  HighchartsAdapterOptions,
  HighchartsAxis,
  HighchartsChart,
  HighchartsGridOptions,
  HighchartsPoint,
  HighchartsSeries,
} from './types';
