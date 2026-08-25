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
 * Use the **SVG renderer**. ECharts defaults to canvas, which draws no
 * elements to point at, so a canvas chart reads correctly and highlights
 * nothing.
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
  createMaidrFromEChart,
  type EChartsAdapterOptions,
} from './converters';

export type {
  EChartsInstance,
  EChartsList,
  EChartsSeriesModel,
  EChartsSeriesType,
} from './types';
