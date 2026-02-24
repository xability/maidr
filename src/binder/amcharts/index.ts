/**
 * amCharts 5 binder for MAIDR.
 *
 * Provides functions to convert amCharts 5 chart instances into MAIDR data
 * objects that can be passed to the `<Maidr>` React component or the
 * `maidr-data` HTML attribute.
 *
 * @example
 * ```ts
 * import { fromAmCharts } from 'maidr/amcharts';
 * import { Maidr } from 'maidr/react';
 *
 * // After chart is initialized:
 * const maidrData = fromAmCharts(root);
 *
 * <Maidr data={maidrData}>
 *   <div ref={chartRef} />
 * </Maidr>
 * ```
 *
 * @packageDocumentation
 */

export { fromAmCharts, fromXYChart } from './adapter';
export type { AmChartsBinderOptions, AmRoot, AmXYChart, AmXYSeries } from './types';
