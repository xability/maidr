/**
 * Configuration types for the MAIDR D3.js binder.
 *
 * These types define the configuration options for extracting data from
 * D3.js-rendered SVG charts and converting them to the MAIDR JSON schema.
 */

import type {
  AxisConfig,
  AxisFormat,
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  Orientation,
  ScatterPoint,
  SegmentedPoint,
  SmoothPoint,
  TraceType,
} from '../../type/grammar';

/**
 * A single axis spec for D3 binder input. Accepts either a plain string
 * (shorthand for `{ label: value }`) or a full {@link AxisConfig} object
 * for advanced cases (per-axis `format`, grid navigation for scatter).
 */
export type D3AxisInput = string | AxisConfig;

/**
 * Common configuration shared across all D3 chart binders.
 */
export interface D3BinderConfig {
  /** Unique identifier for the chart. Used as the MAIDR `id`. */
  id?: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /**
   * Axis configuration. Each axis may be provided as either a plain string
   * (shorthand for `{ label: value }`) or a full {@link AxisConfig} object
   * (for per-axis `format`, or grid navigation on scatter).
   *
   * For heatmaps and segmented bar charts, use `fill` for the color/category
   * axis; the binder maps it to the canonical `z` axis in the MAIDR schema.
   */
  axes?: {
    x?: D3AxisInput;
    y?: D3AxisInput;
    /** Fill/color axis for heatmaps and segmented bars. Maps to `z` internally. */
    fill?: D3AxisInput;
  };
  /**
   * Optional formatting configuration applied to axes that do not specify
   * their own `format`. Per-axis `format` on `AxisConfig` takes precedence.
   */
  format?: AxisFormat;
  /**
   * When `true` (the default), the binder writes the generated MAIDR schema
   * to the SVG as a `maidr-data` attribute so vanilla-JS users don't need
   * to call `svg.setAttribute(...)` themselves. The returned result is
   * unchanged either way.
   *
   * Set to `false` if you are driving MAIDR yourself — e.g. passing the
   * returned schema to `<Maidr data={...}>` or persisting it elsewhere.
   * The React adapter ({@link useD3Adapter}, {@link MaidrD3}) forces this
   * to `false` internally so it can stay in control of the schema.
   *
   * @default true
   */
  autoApply?: boolean;
}

/**
 * Data accessor function or property name for extracting a value from a D3 datum.
 * If a string is provided, it's used as a property key on the datum object.
 * If a function is provided, it receives the datum and its index, returning the value.
 */
export type DataAccessor<T> = string | ((datum: unknown, index: number) => T);

/**
 * Configuration for binding a D3 bar chart.
 */
export interface D3BarConfig extends D3BinderConfig {
  /** CSS selector for the bar elements (e.g., `'rect.bar'`, `'rect'`, `'path'`). */
  selector: string;
  /** Accessor for the x-axis (category) value. @default 'x' */
  x?: DataAccessor<string | number>;
  /** Accessor for the y-axis (numeric) value. @default 'y' */
  y?: DataAccessor<number | string>;
  /** Chart orientation. @default Orientation.VERTICAL */
  orientation?: Orientation;
}

/**
 * Configuration for binding a D3 line chart.
 */
export interface D3LineConfig extends D3BinderConfig {
  /**
   * CSS selector for the line path elements (e.g., `'path.line'`, `'.line'`).
   * Each matched element represents one line/series.
   */
  selector: string;
  /**
   * CSS selector for the data point elements per line (e.g., `'circle'`).
   * If not provided, data is extracted from the line path `__data__` binding.
   */
  pointSelector?: string;
  /** Accessor for the x-axis value of each point. @default 'x' */
  x?: DataAccessor<number | string>;
  /** Accessor for the y-axis value of each point. @default 'y' */
  y?: DataAccessor<number>;
  /** Accessor for the series/fill label. @default 'fill' */
  fill?: DataAccessor<string>;
}

/**
 * Configuration for binding a D3 scatter plot.
 */
export interface D3ScatterConfig extends D3BinderConfig {
  /** CSS selector for the point elements (e.g., `'circle'`, `'circle.dot'`). */
  selector: string;
  /** Accessor for the x-axis value. @default 'x' */
  x?: DataAccessor<number>;
  /** Accessor for the y-axis value. @default 'y' */
  y?: DataAccessor<number>;
}

/**
 * Configuration for binding a D3 heatmap.
 */
export interface D3HeatmapConfig extends D3BinderConfig {
  /** CSS selector for the cell elements (e.g., `'rect.cell'`, `'rect'`). */
  selector: string;
  /** Accessor for the x-axis category value. @default 'x' */
  x?: DataAccessor<string>;
  /** Accessor for the y-axis category value. @default 'y' */
  y?: DataAccessor<string>;
  /** Accessor for the cell value. @default 'value' */
  value?: DataAccessor<number>;
}

/**
 * Configuration for binding a D3 box plot.
 */
export interface D3BoxConfig extends D3BinderConfig {
  /**
   * CSS selector for the box group elements. Each matched element should
   * represent one box (e.g., `'g.box'`).
   */
  selector: string;
  /** Selector for the IQR box rectangle within each box group. @default 'rect' */
  boxSelector?: string;
  /** Selector for the median line within each box group. @default 'line.median' */
  medianSelector?: string;
  /** Selector for the whisker lines within each box group. */
  whiskerSelector?: string;
  /** Selector for outlier points within each box group. @default 'circle' */
  outlierSelector?: string;
  /** Accessor for the group/fill label. @default 'fill' */
  fill?: DataAccessor<string>;
  /** Accessor for the min value. @default 'min' */
  min?: DataAccessor<number>;
  /** Accessor for q1 value. @default 'q1' */
  q1?: DataAccessor<number>;
  /** Accessor for median (q2) value. @default 'q2' */
  q2?: DataAccessor<number>;
  /** Accessor for q3 value. @default 'q3' */
  q3?: DataAccessor<number>;
  /** Accessor for the max value. @default 'max' */
  max?: DataAccessor<number>;
  /** Accessor for lower outlier values. @default 'lowerOutliers' */
  lowerOutliers?: DataAccessor<number[]>;
  /** Accessor for upper outlier values. @default 'upperOutliers' */
  upperOutliers?: DataAccessor<number[]>;
  /** Chart orientation. @default Orientation.VERTICAL */
  orientation?: Orientation;
}

/**
 * Configuration for binding a D3 histogram.
 */
export interface D3HistogramConfig extends D3BinderConfig {
  /** CSS selector for the histogram bar elements (e.g., `'rect.bar'`, `'rect'`). */
  selector: string;
  /** Accessor for the x-axis (bin label) value. @default 'x' */
  x?: DataAccessor<string | number>;
  /** Accessor for the y-axis (count/frequency) value. @default 'y' */
  y?: DataAccessor<number | string>;
  /** Accessor for bin min x value. @default 'x0' */
  xMin?: DataAccessor<number>;
  /** Accessor for bin max x value. @default 'x1' */
  xMax?: DataAccessor<number>;
  /** Accessor for bin min y value (typically 0). @default 0 */
  yMin?: DataAccessor<number>;
  /** Accessor for bin max y value. Defaults to the y accessor. */
  yMax?: DataAccessor<number>;
}

/**
 * Configuration for binding a D3 candlestick chart.
 */
export interface D3CandlestickConfig extends D3BinderConfig {
  /** CSS selector for the candlestick body elements (e.g., `'rect.candle'`). */
  selector: string;
  /** Accessor for the label/date value. @default 'value' */
  value?: DataAccessor<string>;
  /** Accessor for the open price. @default 'open' */
  open?: DataAccessor<number>;
  /** Accessor for the high price. @default 'high' */
  high?: DataAccessor<number>;
  /** Accessor for the low price. @default 'low' */
  low?: DataAccessor<number>;
  /** Accessor for the close price. @default 'close' */
  close?: DataAccessor<number>;
  /** Accessor for the trading volume. @default 'volume' */
  volume?: DataAccessor<number>;
  /** Accessor for the trend direction. Auto-computed from open/close if not provided. */
  trend?: DataAccessor<'Bull' | 'Bear' | 'Neutral'>;
}

/**
 * Segmented bar chart type for stacked, dodged, or normalized.
 */
export type SegmentedTraceType
  = | typeof TraceType.STACKED
    | typeof TraceType.DODGED
    | typeof TraceType.NORMALIZED;

/**
 * Configuration for binding a D3 segmented bar chart (stacked, dodged, or normalized).
 *
 * Supports two common D3 patterns:
 *
 * 1. **Flat structure** (no `groupSelector`): All bar `<rect>` elements are queried
 *    from the SVG root, and each element's datum must include `x`, `y`, and `fill`.
 *
 * 2. **`d3.stack()` structure** (with `groupSelector`): Each series lives in a
 *    `<g>` group element whose datum has a `.key` property identifying the series.
 *    Use function accessors to extract values from the `d3.stack()` tuple format.
 *
 * @example
 * ```ts
 * // d3.stack() pattern
 * bindD3Segmented(svg, {
 *   groupSelector: 'g.series',
 *   selector: 'rect',
 *   type: 'stacked_bar',
 *   x: (d) => d.data.category,
 *   y: (d) => d[1] - d[0],
 * });
 * ```
 */
export interface D3SegmentedConfig extends D3BinderConfig {
  /** CSS selector for all bar segment elements (e.g., `'rect.bar'`, `'rect'`). */
  selector: string;
  /**
   * CSS selector for series group elements (e.g., `'g.series'`).
   * When provided, bar segments are queried within each group and the
   * fill/series key is read from each group's D3 datum `.key` property
   * (standard `d3.stack()` output) unless overridden by the `fill` accessor.
   */
  groupSelector?: string;
  /** The type of segmented chart. @default TraceType.STACKED */
  type?: SegmentedTraceType;
  /** Accessor for the x-axis (category) value. @default 'x' */
  x?: DataAccessor<string | number>;
  /** Accessor for the y-axis (numeric) value. @default 'y' */
  y?: DataAccessor<number | string>;
  /** Accessor for the fill/group identifier. @default 'fill' */
  fill?: DataAccessor<string>;
  /**
   * Hint for how the rendered `<rect>` elements are ordered in the DOM.
   *
   * - `'subject-major'` — rects are interleaved by category then series,
   *   e.g. `[Cat0-A, Cat0-B, Cat0-C, Cat1-A, ...]`. This is the result of a
   *   single flat `selectAll(...).data(flatArr).join(...)` call and matches
   *   the typical D3 dodged-bar pattern.
   * - `'series-major'` — all of series 0 first, then all of series 1, etc.,
   *   e.g. `[A-Cat0..CatN, B-Cat0..CatN, ...]`. This is produced by looping
   *   `regions.forEach(r => selectAll(...).data(byRegion[r]).join(...))` and
   *   matches the typical D3 stacked-bar pattern, as well as `d3.stack()`
   *   with `groupSelector`.
   *
   * When omitted, the binder auto-detects from the rendered fills and falls
   * back to `type`-based defaults (`stacked_bar` / `normalized_bar` →
   * `series-major`, `dodged_bar` → `subject-major`).
   */
  domOrder?: 'subject-major' | 'series-major';
}

/**
 * Configuration for binding a D3 smooth/regression curve.
 */
export interface D3SmoothConfig extends D3BinderConfig {
  /** CSS selector for the smooth curve point elements (e.g., `'circle.smooth'`). */
  selector: string;
  /** Accessor for the x-axis data value. @default 'x' */
  x?: DataAccessor<number>;
  /** Accessor for the y-axis data value. @default 'y' */
  y?: DataAccessor<number>;
  /** Accessor for the SVG x coordinate. @default 'svg_x' */
  svgX?: DataAccessor<number>;
  /** Accessor for the SVG y coordinate. @default 'svg_y' */
  svgY?: DataAccessor<number>;
}

/**
 * Result of a D3 binder function.
 * Contains the complete MAIDR data structure and the generated layer
 * for further customization if needed.
 */
export interface D3BinderResult {
  /** Complete MAIDR JSON data ready to use with the `<Maidr>` component or `maidr-data` attribute. */
  maidr: Maidr;
  /** The generated layer for direct inspection or modification. */
  layer: MaidrLayer;
}

/**
 * Output of a per-type layer builder (the pure extraction core each binder
 * shares between its single-chart export and the multi-panel binders).
 */
export interface D3BuiltLayer {
  /** The extracted MAIDR layer. */
  layer: MaidrLayer;
  /** Legend labels (line / segmented charts only). */
  legend?: string[];
}

/**
 * Discriminated union pairing a chart type with its binder-specific config.
 * This is the per-panel unit consumed by the multi-panel binders and the
 * base of the React adapter's {@link D3AdapterSpec}.
 */
export type D3PanelChartSpec
  = | { chartType: 'bar'; config: D3BarConfig }
    | { chartType: 'box'; config: D3BoxConfig }
    | { chartType: 'candlestick'; config: D3CandlestickConfig }
    | { chartType: 'heatmap'; config: D3HeatmapConfig }
    | { chartType: 'histogram'; config: D3HistogramConfig }
    | { chartType: 'line'; config: D3LineConfig }
    | { chartType: 'scatter'; config: D3ScatterConfig }
    | { chartType: 'segmented'; config: D3SegmentedConfig }
    | { chartType: 'smooth'; config: D3SmoothConfig };

/**
 * Grid layout hint for multi-panel binds.
 *
 * - `'row'` — all panels in a single row (side by side).
 * - `'column'` — all panels in a single column (stacked).
 * - `{ rows?, columns? }` — chunk panels into a grid with the given number of
 *   columns (or `ceil(count / rows)` columns when only `rows` is set). The
 *   last row may be shorter (ragged grids are supported).
 *
 * When omitted, the binders infer the grid from panel geometry: panel
 * bounding-box centers are clustered by y (rows) and sorted by x within each
 * row, falling back to parsing `transform="translate(x,y)"` when bounding
 * boxes are unavailable (e.g. jsdom), and finally to a single row in DOM
 * order. An explicit `layout` always wins over geometry.
 */
export type D3PanelLayout = 'row' | 'column' | { rows?: number; columns?: number };

/**
 * Configuration for {@link bindD3Facets} — homogeneous small multiples
 * (one chart type repeated across panels inside a single SVG).
 *
 * The `chartType` / `config` pair selects the per-panel binder; the inner
 * `config` also carries the figure-level fields (`id`, `title`, `subtitle`,
 * `caption`, `autoApply`). Each matched panel element becomes the extraction
 * root for the per-type binder, so `config.selector` is resolved *within*
 * each panel.
 */
export type D3FacetsConfig = D3PanelChartSpec & {
  /**
   * CSS selector for the panel container elements inside the SVG — the
   * canonical D3 facet idiom is one translated `<g>` per panel (e.g.
   * `'g.panel'`). Each match becomes one MAIDR subplot.
   */
  panelSelector: string;
  /**
   * Accessor for each panel's display title, resolved against the panel
   * element's D3-bound `__data__` (for `d3.groups` output, the `[key,
   * values]` tuple — pass `d => d[0]` or rely on the automatic key
   * detection). Function accessors receive `(datum, index)` and are invoked
   * even when the panel has no bound datum (`datum` is then `undefined`),
   * so index-only accessors like `(_d, i) => keys[i]` work for panels
   * appended without a data join; string-key accessors and the automatic
   * key detection require a bound datum. Falls back to `Panel <n>` when
   * unresolvable.
   */
  panelTitle?: DataAccessor<string>;
  /** Explicit grid layout. When omitted, inferred from panel geometry. */
  layout?: D3PanelLayout;
};

/**
 * One panel of a {@link bindD3Subplots} composition: which binder to run,
 * its config, and the DOM subtree to extract from. The entry config's
 * `title` becomes the panel's display name in subplot navigation summaries;
 * its `id`, `subtitle`, `caption`, and `autoApply` are ignored (figure-level
 * fields live on {@link D3SubplotsConfig}).
 */
export type D3SubplotEntry = D3PanelChartSpec & {
  /**
   * The panel's root element, or a CSS selector resolved against the outer
   * container passed to `bindD3Subplots`.
   */
  root: Element | string;
};

/**
 * Configuration for {@link bindD3Subplots} — a heterogeneous grid of
 * independently-drawn charts inside one SVG (or container).
 */
export interface D3SubplotsConfig {
  /**
   * The panels, either as an explicit 2D grid (row-major, ragged rows
   * allowed, empty rows not) or as a flat array arranged via `layout` /
   * geometry inference.
   */
  subplots: D3SubplotEntry[][] | D3SubplotEntry[];
  /** Grid layout for a flat `subplots` array. Ignored for 2D arrays. */
  layout?: D3PanelLayout;
  /** Unique identifier for the figure. Auto-generated when omitted. */
  id?: string;
  /** Figure title displayed in text descriptions. */
  title?: string;
  /** Figure subtitle. */
  subtitle?: string;
  /** Figure caption. */
  caption?: string;
  /**
   * When `true` (the default), writes the generated MAIDR schema to the
   * container as a `maidr-data` attribute. See {@link D3BinderConfig.autoApply}.
   */
  autoApply?: boolean;
}

/**
 * Result of a multi-panel D3 binder ({@link bindD3Facets},
 * {@link bindD3Subplots}).
 */
export interface D3MultiPanelResult {
  /** Complete multi-subplot MAIDR JSON data. */
  maidr: Maidr;
  /** One generated layer per panel, in row-major (visual reading) order. */
  layers: MaidrLayer[];
}

/**
 * Union of all supported data point types extracted by the D3 binder.
 */
export type D3ExtractedData
  = | BarPoint[]
    | BoxPoint[]
    | CandlestickPoint[]
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | ScatterPoint[]
    | SegmentedPoint[][]
    | SmoothPoint[][];
