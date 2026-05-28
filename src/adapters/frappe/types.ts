/**
 * Minimal type declarations for the Frappe Charts API.
 *
 * These cover only the subset required by the MAIDR Frappe Charts adapter.
 * Frappe Charts is loaded via a CDN script tag and exposes its API on the
 * global `frappe.Chart` constructor at runtime.
 *
 * @see https://frappe.io/charts
 */

/**
 * A single Frappe Charts dataset (one series).
 */
export interface FrappeDataset {
  /** Series name, shown in legends and used as the MAIDR `z`/fill label. */
  name?: string;
  /** Y-values, one per label. */
  values: number[];
  /**
   * Per-dataset chart type, used by `'axis-mixed'` charts to combine bar and
   * line series in a single chart. Ignored for non-mixed charts.
   */
  chartType?: 'bar' | 'line';
}

/**
 * The `data` object backing a Frappe chart: shared x-axis labels plus one or
 * more datasets.
 */
export interface FrappeData {
  labels: Array<string | number>;
  datasets: FrappeDataset[];
}

/**
 * A rendered Frappe Charts instance. Only the `data` field that the adapter
 * reads is declared here.
 */
export interface FrappeChart {
  data: FrappeData;
}

/**
 * Frappe Charts chart-type strings the adapter can convert.
 *
 * Frappe additionally supports `pie`, `donut`, `percentage`, and a
 * calendar-style `heatmap`; those have no clean MAIDR equivalent and are not
 * supported by this adapter.
 */
export type FrappeChartType = 'axis-mixed' | 'bar' | 'line' | 'scatter';
