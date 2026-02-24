/**
 * Public amCharts 5 binder API for MAIDR.
 *
 * Provides adapter functions that convert amCharts 5 chart instances into
 * MAIDR-compatible data objects. The resulting data can be passed to the
 * `<Maidr>` React component or embedded as a `maidr-data` HTML attribute.
 *
 * @remarks
 * amCharts 5 is a commercial charting library and is **not** bundled with
 * MAIDR. Consumers must install amCharts 5 separately.
 *
 * @example
 * ```ts
 * import { fromAmCharts } from 'maidr/amcharts';
 * import { Maidr } from 'maidr/react';
 *
 * // 1. Create your amCharts 5 chart as usual.
 * const root = am5.Root.new("chartdiv");
 * const chart = root.container.children.push(
 *   am5xy.XYChart.new(root, {})
 * );
 * // ... add axes, series, data ...
 *
 * // 2. Convert to MAIDR data.
 * const data = fromAmCharts(root);
 *
 * // 3. Use with the Maidr React component.
 * <Maidr data={data}>
 *   <div id="chartdiv" />
 * </Maidr>
 * ```
 *
 * @packageDocumentation
 */
export { fromAmCharts, fromXYChart } from './binder/amcharts/adapter';
export type { AmChartsBinderOptions, AmRoot, AmXYChart, AmXYSeries } from './binder/amcharts/types';
