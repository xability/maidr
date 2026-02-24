/**
 * Google Charts integration for MAIDR.
 *
 * Provides an adapter that converts a rendered Google Charts chart into the
 * MAIDR JSON schema, enabling accessible non-visual access to Google Charts
 * visualizations through audio sonification, text descriptions, braille
 * output, and keyboard navigation.
 *
 * @remarks
 * Google Charts loads asynchronously via `google.charts.load()`. The adapter
 * must be called **after** the chart has finished rendering — typically inside
 * a `google.visualization.events.addListener(chart, 'ready', …)` callback.
 *
 * @example
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
 * @packageDocumentation
 */

export {
  createMaidrFromGoogleChart,
  type GoogleChartAdapterOptions,
} from './adapter';

export type {
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
  GoogleEvents,
  GoogleSelectionItem,
} from './types';
