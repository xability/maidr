/**
 * Public ApexCharts adapter API for MAIDR.
 *
 * Provides {@link bindApexCharts}, which makes a rendered ApexCharts chart
 * accessible through MAIDR and keeps it that way as the chart redraws, and
 * {@link apexchartsToMaidr}, which converts a chart into MAIDR data once.
 *
 * @remarks
 * ApexCharts is **not** bundled — users load their own copy. This module
 * reads the live chart instance (`w.globals`, `w.config`, `opts`) and the SVG
 * it drew, and produces a plain JSON descriptor MAIDR understands. It is
 * written against ApexCharts 7.6.0, whose DOM the selectors are tied to.
 *
 * ApexCharts 7 ships keyboard navigation of its own, which competes with
 * MAIDR's; set `chart: { accessibility: { enabled: false } }` on charts read
 * through MAIDR. The adapter warns in the console when it is left on.
 *
 * @example
 * ```ts
 * import ApexCharts from 'apexcharts';
 * import { bindApexCharts } from 'maidr/apexcharts';
 *
 * const chart = new ApexCharts(document.querySelector('#chart'), {
 *   chart: { type: 'bar', accessibility: { enabled: false } },
 *   title: { text: 'Fruit Consumption' },
 *   series: [{ name: 'Sales', data: [1, 4, 3] }],
 *   xaxis: { categories: ['Apples', 'Bananas', 'Oranges'] },
 * });
 * chart.render();
 * const binding = bindApexCharts(chart);
 * await binding.ready;
 * ```
 *
 * @packageDocumentation
 */

export { apexchartsToMaidr } from './adapter';
export { bindApexCharts } from './bind';
export type {
  ApexChartsAdapterOptions,
  ApexChartsBinding,
  ApexChartsInstance,
} from './types';
