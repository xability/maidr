/**
 * amCharts 5 binder for MAIDR.
 *
 * Provides adapter functions that convert amCharts 5 chart instances into
 * MAIDR-compatible data objects. The resulting data can be passed to the
 * `<Maidr>` React component or embedded as a `maidr-data` HTML attribute,
 * enabling audio sonification, text descriptions, braille output, and
 * keyboard navigation for amCharts 5 visualizations.
 *
 * @remarks
 * amCharts 5 is a commercial charting library and is **not** bundled with
 * MAIDR. Consumers must install amCharts 5 separately. amCharts 4 has a
 * significantly different API and is not supported.
 *
 * @example
 * ```ts
 * import { fromAmCharts } from 'maidr/amcharts';
 * import { Maidr } from 'maidr/react';
 *
 * // 1. Create your amCharts 5 chart as usual.
 * const root = am5.Root.new('chartdiv');
 * const chart = root.container.children.push(
 *   am5xy.XYChart.new(root, {}),
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

export { fromAmCharts, fromXYChart } from './adapter';
export type { AmChartsBinderOptions, AmRoot, AmXYChart, AmXYSeries } from './types';
