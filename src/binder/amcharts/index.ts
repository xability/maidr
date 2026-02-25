/**
 * amCharts 5 binder for MAIDR.
 *
 * Provides functions to convert amCharts 5 chart instances into MAIDR data
 * objects that can be passed to the `<Maidr>` React component or the
 * `maidr-data` HTML attribute.
 */

export { fromAmCharts, fromXYChart } from './adapter';
export type { AmChartsBinderOptions, AmRoot, AmXYChart, AmXYSeries } from './types';
