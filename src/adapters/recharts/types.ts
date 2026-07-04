/**
 * Types for the Recharts adapter.
 *
 * Defines the configuration interfaces for converting Recharts data
 * and SVG structure into MAIDR's accessible format.
 */

import type { Orientation } from '@type/grammar';

/**
 * Recharts chart types supported by the adapter.
 *
 * Mapping to MAIDR trace types:
 * - `'bar'` → `TraceType.BAR` — Simple bar chart
 * - `'stacked_bar'` → `TraceType.STACKED` — Stacked bar chart (Recharts `<Bar stackId="...">`)
 * - `'dodged_bar'` → `TraceType.DODGED` — Grouped/dodged bar chart (multiple `<Bar>` without stackId)
 * - `'normalized_bar'` → `TraceType.NORMALIZED` — Stacked normalized (100%) bar chart
 * - `'histogram'` → `TraceType.HISTOGRAM` — Histogram rendered as bar chart with bin ranges
 * - `'line'` → `TraceType.LINE` — Line chart
 * - `'scatter'` → `TraceType.SCATTER` — Scatter/point plot
 */
export type RechartsChartType
  = | 'bar'
    | 'stacked_bar'
    | 'dodged_bar'
    | 'normalized_bar'
    | 'histogram'
    | 'line'
    | 'scatter';

/**
 * A single data series/layer configuration for composed charts.
 * Use this when a chart has multiple series of different types.
 */
export interface RechartsLayerConfig {
  /** Key in the data array for this series' y-values. */
  yKey: string;
  /** Chart type for this series. */
  chartType: RechartsChartType;
  /** Display name for this series (used in legends/descriptions). */
  name?: string;
}

/**
 * Configuration for histogram bin ranges.
 * Required when `chartType` is `'histogram'`.
 */
export interface HistogramBinConfig {
  /** Key in data objects for the lower bin edge. */
  xMinKey: string;
  /** Key in data objects for the upper bin edge. */
  xMaxKey: string;
  /** Key in data objects for the minimum count (typically 0). Defaults to 0. */
  yMinKey?: string;
  /** Key in data objects for the maximum count. Defaults to the yKey value. */
  yMaxKey?: string;
}

/**
 * Per-panel configuration for multi-panel (faceted) charts.
 *
 * Each panel is one Recharts chart in a grid of small multiples. Panel
 * fields mirror the corresponding {@link RechartsAdapterConfig} fields;
 * any field left out falls back to the top-level config value, so shared
 * settings (`data`, `xKey`, axis labels, ...) only need to be declared once.
 *
 * Every panel must define its own `chartType` + `yKeys` (simple mode) or
 * `layers` (composed mode) — these are the only fields without a top-level
 * default, because `subplots` is mutually exclusive with the top-level
 * `chartType`/`layers`.
 */
export interface RechartsSubplotConfig {
  /**
   * Panel display name (e.g. the facet value, "Region: East").
   * Announced when navigating between subplots.
   */
  title?: string;
  /** Panel data array. Falls back to the top-level `data`. */
  data?: Record<string, unknown>[];
  /** Chart type for this panel (simple mode). Mutually exclusive with `layers`. */
  chartType?: RechartsChartType;
  /** Key in data objects for x-axis values. Falls back to the top-level `xKey`. */
  xKey?: string;
  /** Keys in data objects for y-axis values (simple mode). Falls back to the top-level `yKeys`. */
  yKeys?: string[];
  /** Layer configurations for a composed panel (composed mode). */
  layers?: RechartsLayerConfig[];
  /** X-axis label. Falls back to the top-level `xLabel`. */
  xLabel?: string;
  /** Y-axis label. Falls back to the top-level `yLabel`. */
  yLabel?: string;
  /** Bar chart orientation. Falls back to the top-level `orientation`. */
  orientation?: Orientation;
  /** Series display names. Falls back to the top-level `fillKeys`. */
  fillKeys?: string[];
  /** Histogram bin range configuration. Falls back to the top-level `binConfig`. */
  binConfig?: HistogramBinConfig;
  /**
   * Custom CSS selector override for this panel's highlight elements.
   * Unlike other fields, this does NOT fall back to the top-level
   * `selectorOverride` (a single override cannot distinguish panels).
   * Provide an already panel-scoped selector when using this.
   */
  selectorOverride?: string;
  /**
   * Custom CSS selector for this panel's container element — the escape
   * hatch when you render the panel DOM yourself (e.g. via the
   * `useRechartsAdapter` hook) instead of letting `<MaidrRecharts>`
   * generate `.maidr-panel-<row>-<col>` wrapper divs.
   *
   * Used both to scope this panel's highlight selectors and as the
   * subplot container selector, so it must match ONLY this panel.
   */
  panelSelector?: string;
}

/**
 * Configuration for the Recharts-to-MAIDR adapter.
 *
 * Supports three configuration modes:
 * 1. **Simple mode** — Set `chartType` and `yKeys` for a single chart type
 *    with one or more data series.
 * 2. **Composed mode** — Set `layers` for mixed chart types (e.g., bar + line).
 * 3. **Subplot mode** — Set `subplots` for multi-panel (faceted) figures
 *    made of a grid of Recharts charts.
 *
 * @example Simple bar chart
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'sales-chart',
 *   title: 'Sales by Quarter',
 *   data: [{ quarter: 'Q1', revenue: 100 }, { quarter: 'Q2', revenue: 200 }],
 *   chartType: 'bar',
 *   xKey: 'quarter',
 *   yKeys: ['revenue'],
 *   xLabel: 'Quarter',
 *   yLabel: 'Revenue ($)',
 * };
 * ```
 *
 * @example Stacked bar chart
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'stacked-chart',
 *   title: 'Revenue by Product',
 *   data: [{ month: 'Jan', productA: 50, productB: 30 }],
 *   chartType: 'stacked_bar',
 *   xKey: 'month',
 *   yKeys: ['productA', 'productB'],
 *   fillKeys: ['Product A', 'Product B'],
 *   xLabel: 'Month',
 *   yLabel: 'Revenue',
 * };
 * ```
 *
 * @example Histogram
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'hist-chart',
 *   title: 'Score Distribution',
 *   data: [{ bin: '0-10', count: 5, xMin: 0, xMax: 10 }],
 *   chartType: 'histogram',
 *   xKey: 'bin',
 *   yKeys: ['count'],
 *   binConfig: { xMinKey: 'xMin', xMaxKey: 'xMax' },
 *   xLabel: 'Score',
 *   yLabel: 'Frequency',
 * };
 * ```
 *
 * @example Composed chart (bar + line)
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'mixed-chart',
 *   title: 'Revenue and Trend',
 *   data: [{ month: 'Jan', revenue: 100, trend: 95 }],
 *   xKey: 'month',
 *   layers: [
 *     { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
 *     { yKey: 'trend', chartType: 'line', name: 'Trend' },
 *   ],
 *   xLabel: 'Month',
 *   yLabel: 'Value',
 * };
 * ```
 *
 * @example Multi-panel (faceted) figure — 1x2 grid of bar charts
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'sales-by-region',
 *   title: 'Sales by Region',
 *   xKey: 'quarter',           // top-level fields are defaults for every panel
 *   yKeys: ['revenue'],
 *   xLabel: 'Quarter',
 *   yLabel: 'Revenue ($)',
 *   subplots: [[
 *     { title: 'East', chartType: 'bar', data: eastData },
 *     { title: 'West', chartType: 'bar', data: westData },
 *   ]],
 * };
 * ```
 */
export interface RechartsAdapterConfig {
  /** Unique identifier for the chart (used for DOM IDs). */
  id: string;

  /** Chart title displayed in text descriptions. */
  title?: string;

  /** Chart subtitle. */
  subtitle?: string;

  /** Chart caption. */
  caption?: string;

  /**
   * Recharts data array. Each item is one data point with named fields.
   * Required in simple/composed mode. In subplot mode it acts as the
   * default data for panels that do not provide their own `data`, and may
   * be omitted when every panel does.
   */
  data?: Record<string, unknown>[];

  /**
   * Chart type for simple mode (single chart type with one or more series).
   * Mutually exclusive with `layers`.
   */
  chartType?: RechartsChartType;

  /** Key in data objects for x-axis values. */
  xKey: string;

  /**
   * Keys in data objects for y-axis values (simple mode).
   * Each key creates a separate data series.
   * Mutually exclusive with `layers`.
   */
  yKeys?: string[];

  /**
   * Layer configurations for composed charts (composed mode).
   * Each layer defines a chart type and data key.
   * Mutually exclusive with `chartType`/`yKeys`.
   */
  layers?: RechartsLayerConfig[];

  /**
   * Panel configurations for multi-panel (faceted) figures (subplot mode).
   * Mutually exclusive with the top-level `chartType` and `layers`.
   *
   * A 2D array describes the panel grid directly in row-major visual
   * reading order (`subplots[0][0]` is the top-left panel). A flat array
   * is chunked into rows of {@link columns} panels (one single row when
   * `columns` is omitted). Rows may be ragged but never empty.
   *
   * When rendering through `<MaidrRecharts>`, pass one Recharts chart per
   * panel as children in the same row-major order — each child is wrapped
   * in a generated `.maidr-panel-<row>-<col>` div used for per-panel
   * highlight scoping. See {@link RechartsSubplotConfig.panelSelector} for
   * the custom-DOM escape hatch.
   */
  subplots?: RechartsSubplotConfig[] | RechartsSubplotConfig[][];

  /**
   * Number of panels per row when `subplots` is a flat array.
   * Ignored when `subplots` is already a 2D grid.
   */
  columns?: number;

  /** X-axis label. */
  xLabel?: string;

  /** Y-axis label. */
  yLabel?: string;

  /** Bar/box chart orientation. Defaults to vertical. */
  orientation?: Orientation;

  /**
   * Display names for each series in stacked/dodged/normalized bar charts.
   * Maps 1:1 with `yKeys` — the i-th fillKey names the i-th yKey.
   * When omitted, the yKey strings are used as fill labels.
   */
  fillKeys?: string[];

  /**
   * Histogram bin range configuration.
   * Required when `chartType` is `'histogram'`.
   */
  binConfig?: HistogramBinConfig;

  /**
   * Custom CSS selector override for SVG highlighting.
   *
   * By default the adapter generates selectors from Recharts' built-in
   * class names. For multi-series charts, CSS selectors cannot reliably
   * distinguish between series, so highlighting is disabled.
   *
   * To enable highlighting for multi-series charts, add a custom
   * `className` to each Recharts component and pass the selector here:
   *
   * @example
   * ```tsx
   * <Bar className="revenue-bar" dataKey="revenue" />
   * // then set selectorOverride: '.revenue-bar .recharts-bar-rectangle'
   * ```
   */
  selectorOverride?: string;
}

/**
 * Props for the MaidrRecharts wrapper component.
 */
export interface MaidrRechartsProps extends RechartsAdapterConfig {
  /** Recharts chart component(s) to make accessible. */
  children: React.ReactNode;
}
