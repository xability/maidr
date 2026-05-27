/**
 * Frappe Charts adapter for MAIDR.
 *
 * Provides utilities to convert Frappe Charts data and SVG structure into
 * MAIDR's accessible format for audio sonification, text descriptions, braille
 * output, and keyboard navigation.
 *
 * @remarks
 * Frappe Charts renders its SVG synchronously when `new frappe.Chart(...)` is
 * constructed. The adapter must be called **after** the SVG exists — typically
 * inside a `requestAnimationFrame` callback that checks for `svg.frappe-chart`.
 *
 * The selectors target Frappe Charts **v1.6.2**; verify SVG class names if you
 * upgrade Frappe.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/frappe-charts@1.6.2/dist/frappe-charts.min.iife.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/frappe.js"></script>
 * <script>
 *   const data = {
 *     labels: ['Mon', 'Tue', 'Wed'],
 *     datasets: [{ name: 'Visitors', values: [120, 240, 180] }],
 *   };
 *   const chart = new frappe.Chart('#chart', { type: 'bar', data, height: 400 });
 *
 *   requestAnimationFrame(function init() {
 *     const container = document.querySelector('#chart');
 *     if (!container.querySelector('svg.frappe-chart')) {
 *       requestAnimationFrame(init);
 *       return;
 *     }
 *     const maidr = maidrFrappe.createMaidrFromFrappeChart(chart, container, {
 *       chartType: 'bar',
 *       title: 'Daily Visitors',
 *       axes: { x: 'Day', y: 'Visitors' },
 *     });
 *     container.setAttribute('maidr', JSON.stringify(maidr));
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export {
  createMaidrFromFrappeChart,
  type FrappeChartAdapterOptions,
} from './converters';

export type {
  FrappeChart,
  FrappeChartType,
  FrappeData,
  FrappeDataset,
} from './types';
