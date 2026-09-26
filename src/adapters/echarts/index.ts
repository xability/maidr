/**
 * Apache ECharts adapter for MAIDR.
 *
 * Converts a rendered ECharts instance into MAIDR's accessible format for
 * audio sonification, text descriptions, braille output and keyboard
 * navigation.
 *
 * @remarks
 * The adapter must be called **after** ECharts has drawn, because it locates
 * marks in the SVG -- register it on the chart's `finished` event, or call it
 * from a `setTimeout` after `setOption`.
 *
 * Prefer the **SVG renderer**. ECharts defaults to canvas, which draws no
 * elements to point at: a canvas chart reads correctly, and its bars, points,
 * lines, areas, pie and sunburst slices are outlined through an overlay drawn
 * from the model, but any other series type is outlined only on SVG.
 *
 * `bindEChart` keeps a chart read as its data and size change, and
 * `bindAllECharts` does that for every chart on a page -- the way into Apache
 * Superset and Metabase, which create their own charts (#1304).
 *
 * The readings target **echarts 6.1.0**, measured in Chromium; the mark
 * detection in `selectors.ts` depends on how that version paints, so verify it
 * if you upgrade.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/echarts.js"></script>
 * <script>
 *   const container = document.querySelector('#chart');
 *   const chart = echarts.init(container, null, { renderer: 'svg' });
 *   chart.setOption({
 *     title: { text: 'Daily Visitors' },
 *     xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'], name: 'Day' },
 *     yAxis: { name: 'Visitors' },
 *     series: [{ type: 'bar', name: 'Visitors', data: [120, 240, 180] }],
 *   });
 *   chart.on('finished', function once() {
 *     chart.off('finished', once);
 *     const maidr = maidrECharts.createMaidrFromEChart(chart, container);
 *     container.setAttribute('maidr', JSON.stringify(maidr));
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export {
  bindAllECharts,
  bindEChart,
  type EChartsBindable,
  type EChartsLibrary,
} from './bind';

export {
  createMaidrFromEChart,
  type EChartsAdapterOptions,
} from './converters';

export type {
  EChartsInstance,
  EChartsList,
  EChartsSeriesModel,
  EChartsSeriesType,
} from './types';
