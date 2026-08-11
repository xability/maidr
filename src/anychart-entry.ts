/**
 * Public API for the MAIDR AnyChart adapter.
 *
 * Provides {@link bindAnyChart} / {@link anyChartToMaidr} for single charts
 * and {@link bindAnyCharts} / {@link anyChartsToMaidr} for grouping multiple
 * charts into one multi-panel MAIDR figure.
 *
 * @remarks
 * AnyChart must be loaded separately – this module does not bundle the
 * AnyChart library.  Call these functions **after** the chart has been drawn
 * so that series data and the SVG container are available.
 *
 * @example
 * ```ts
 * import { bindAnyChart, bindAnyCharts } from 'maidr/anychart';
 *
 * const chart = anychart.bar([4, 2, 7, 1]);
 * chart.container('container').draw();
 *
 * // One-liner: extracts data, sets maidr-data attribute, fires event.
 * bindAnyChart(chart);
 *
 * // Multi-panel: group several charts into one accessible figure.
 * bindAnyCharts([[chartA, chartB], [chartC, chartD]], { title: 'Dashboard' });
 * ```
 *
 * @packageDocumentation
 */
export {
  anyChartsToMaidr,
  anyChartToMaidr,
  bindAnyChart,
  bindAnyCharts,
} from './adapters/anychart';

/**
 * Re-exported types for configuring the AnyChart adapter.
 */
export type {
  AnyChartBinderOptions,
  AnyChartGridInput,
  AnyChartInstance,
  AnyChartsBinderOptions,
  AnyChartsLayout,
} from './adapters/anychart';

/**
 * Re-exported core MAIDR types so consumers can type the output.
 */
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { TraceType } from './type/grammar';
