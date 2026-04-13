/**
 * Public Google Charts adapter API for MAIDR.
 *
 * Provides a `createMaidrFromGoogleChart` function for converting Google Charts
 * visualizations into MAIDR's accessible format with audio sonification,
 * text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Google Charts loads asynchronously via `google.charts.load()`. The adapter
 * must be called **after** the chart has finished rendering — typically inside
 * a `google.visualization.events.addListener(chart, 'ready', …)` callback.
 *
 * @example Basic usage
 * ```html
 * <script src="https://www.gstatic.com/charts/loader.js"></script>
 * <script src="maidr.js"></script>
 * <script type="module">
 *   import { createMaidrFromGoogleChart } from 'maidr/google-charts';
 *
 *   google.charts.load('current', { packages: ['corechart'] });
 *   google.charts.setOnLoadCallback(() => {
 *     const data = google.visualization.arrayToDataTable([
 *       ['City', 'Population'],
 *       ['New York', 8336817],
 *       ['Los Angeles', 3979576],
 *     ]);
 *     const container = document.getElementById('chart');
 *     const chart = new google.visualization.ColumnChart(container);
 *
 *     google.visualization.events.addListener(chart, 'ready', () => {
 *       const maidrData = createMaidrFromGoogleChart(chart, data, container, {
 *         chartType: 'ColumnChart',
 *         title: 'US City Populations',
 *       });
 *       container.setAttribute('maidr', JSON.stringify(maidrData));
 *     });
 *
 *     chart.draw(data);
 *   });
 * </script>
 * ```
 *
 * @example Stacked bar chart
 * ```js
 * const maidrData = createMaidrFromGoogleChart(chart, data, container, {
 *   chartType: 'StackedColumnChart',
 *   title: 'Revenue by Product Category',
 * });
 * ```
 *
 * @packageDocumentation
 */
export {
  createMaidrFromGoogleChart,
  type GoogleChartAdapterOptions,
} from './adapters/google-charts/converters';

export {
  buildDataSelector,
  ensureContainerId,
  nextId,
} from './adapters/google-charts/selectors';

export type {
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
  GoogleEvents,
  GoogleSelectionItem,
} from './adapters/google-charts/types';

// Re-export core types that consumers may need alongside the adapter
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
