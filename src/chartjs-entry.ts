/**
 * Chart.js integration for MAIDR.
 *
 * Provides a Chart.js plugin that automatically adds accessible, non-visual
 * access to canvas-based Chart.js visualizations through audio sonification,
 * text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Requires `chart.js` (v4+), `react`, and `react-dom` as peer dependencies.
 *
 * @example
 * ```js
 * import { Chart } from 'chart.js/auto';
 * import { maidrPlugin } from 'maidr/chartjs';
 *
 * // Register globally — all charts become accessible
 * Chart.register(maidrPlugin);
 *
 * new Chart(document.getElementById('myChart'), {
 *   type: 'bar',
 *   data: {
 *     labels: ['Jan', 'Feb', 'Mar'],
 *     datasets: [{ label: 'Sales', data: [10, 20, 30] }],
 *   },
 * });
 * ```
 *
 * @example
 * ```js
 * // Use extractMaidrData for manual control
 * import { extractMaidrData } from 'maidr/chartjs';
 *
 * const maidrData = extractMaidrData(myChartInstance);
 * // Pass to <Maidr data={maidrData}> or use programmatically
 * ```
 *
 * @packageDocumentation
 */

export { extractMaidrData } from './chartjs/extractor';
export { maidrPlugin } from './chartjs/plugin';
export type { ChartJsChart, ChartJsPlugin, MaidrPluginOptions } from './chartjs/types';
