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
 * Two ways to use it:
 *
 * 1. {@link bindAmCharts} (recommended) — mounts the MAIDR UI over the chart
 *    AND draws a canvas highlight overlay on the active data point. Required
 *    for visual highlighting, because amCharts renders to canvas.
 * 2. {@link fromAmCharts} — returns plain MAIDR JSON for the `maidr` HTML
 *    attribute or `<Maidr data={...}>`. Enables audio/text/braille but NOT
 *    visual highlighting (the highlight callback cannot survive JSON).
 *
 * @example
 * ```ts
 * import { bindAmCharts } from 'maidr/amcharts';
 *
 * const root = am5.Root.new('chartdiv');
 * // ... add axes, series, data ...
 * const binding = bindAmCharts(root, { title: 'Sales by Day' });
 * // later, to clean up: binding.dispose();
 * ```
 *
 * @packageDocumentation
 */

export { fromAmCharts, fromXYChart } from './adapter';
export { bindAmCharts, bindXYChart } from './binder';
export type { AmChartsBinding, AmChartsBindOptions } from './binder';
export type { AmChartsBinderOptions, AmRoot, AmXYChart, AmXYSeries } from './types';
