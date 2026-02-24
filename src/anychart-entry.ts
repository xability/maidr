/**
 * Public API for the MAIDR AnyChart adapter.
 *
 * Provides {@link bindAnyChart} and {@link anyChartToMaidr} for integrating
 * AnyChart charts with MAIDR's accessible visualisation features.
 *
 * @remarks
 * AnyChart must be loaded separately – this module does not bundle the
 * AnyChart library.  Call these functions **after** the chart has been drawn
 * so that series data and the SVG container are available.
 *
 * @example
 * ```ts
 * import { bindAnyChart } from 'maidr/anychart';
 *
 * const chart = anychart.bar([4, 2, 7, 1]);
 * chart.container('container').draw();
 *
 * // One-liner: extracts data, sets maidr-data attribute, fires event.
 * bindAnyChart(chart);
 * ```
 *
 * @packageDocumentation
 */
export { anyChartToMaidr, bindAnyChart } from './adapter/anychart';

/**
 * Re-exported types for configuring the AnyChart adapter.
 */
export type { AnyChartBinderOptions, AnyChartInstance } from './type/anychart';

/**
 * Re-exported core MAIDR types so consumers can type the output.
 */
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { TraceType } from './type/grammar';
