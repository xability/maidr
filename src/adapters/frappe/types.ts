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
 * A rendered Frappe Charts instance. Only the fields the adapter reads are
 * declared here.
 */
export interface FrappeChart {
  data: FrappeData;
  /**
   * The chart's resolved configuration. Only `maxSlices` is read, and only for
   * pie / donut charts: Frappe collapses everything past that many slices into
   * a single "Rest" wedge, and the conversion has to collapse the same way to
   * stay aligned with the wedges it draws. Absent on a plain `{ data }` object,
   * in which case Frappe's own default (20) is assumed.
   */
  config?: { maxSlices?: number };
  /**
   * The chart's line rendering options, an instance field on Frappe's
   * `AxisChart` rather than part of `config`. Only `regionFill` is read: it is
   * what fills the band between the line and the baseline, which makes the
   * chart an area chart rather than a line chart, and reading it here means an
   * author cannot mislabel one as the other. Absent on a plain `{ data }`
   * object — pass `chartType: 'area'` in that case.
   */
  lineOptions?: { regionFill?: number };
}

/**
 * Chart-type strings the adapter can convert.
 *
 * These are the **adapter's** names, not Frappe's own `type` strings. Frappe
 * v1.6.2 draws only `bar`, `line`, `axis-mixed`, `pie`, `donut`, `percentage`
 * and a calendar `heatmap`; several distinct statistical charts are all drawn
 * with `type: 'line'` or `type: 'bar'` and differ only in their options or in
 * what the numbers mean, which no chart instance records. Naming them here is
 * how the author says which chart they drew, so MAIDR announces that one:
 *
 * - `'scatter'` / `'dot'` — `type: 'line'` with `lineOptions.hideLine`
 * - `'area'` — `type: 'line'` with `lineOptions.regionFill` (also inferred)
 * - `'bump'` — a multi-dataset `type: 'line'` chart whose y values are ranks
 * - `'diverging'` — a two-dataset `type: 'bar'` chart with signed values
 *
 * `percentage` and the calendar-style `heatmap` have no clean MAIDR equivalent
 * and are not supported.
 */
export type FrappeChartType
  = | 'area'
    | 'axis-mixed'
    | 'bar'
    | 'bump'
    | 'diverging'
    | 'donut'
    | 'dot'
    | 'line'
    | 'pie'
    | 'scatter';

/**
 * One panel of a multi-panel (small-multiples) figure built from several
 * independently rendered Frappe charts.
 *
 * Frappe Charts has no native facet/subplot concept — a "multi-panel" chart is
 * simply N `new frappe.Chart(...)` instances laid out by the host page's CSS.
 * A `FrappePanel` pairs one such instance with its container and the adapter
 * options that would otherwise be passed to `createMaidrFromFrappeChart`.
 */
export interface FrappePanel {
  /** The rendered Frappe chart instance for this panel (only `data` is read). */
  chart: FrappeChart;
  /** The element the chart was drawn into. Must be inside the wrapper element. */
  container: HTMLElement;
  /** The Frappe chart type of this panel. */
  chartType: FrappeChartType;
  /** Panel display name, announced when navigating between subplots. */
  title?: string;
  /** Axis labels for this panel. */
  axes?: { x?: string; y?: string; z?: string };
}
