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
  DumbbellData,
  ErrorBarPoint,
  GaugeBand,
  GaugePoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  Orientation,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  SmoothPoint,
  TraceType,
  VolcanoPoint,
  WaterfallKind,
  WaterfallPoint,
  WordCloudPoint,
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
 * Trace types that share the bar extraction: one category and one value per
 * mark, read the same way whichever mark is drawn.
 *
 * A dot plot draws a point where a bar chart draws a bar, a lollipop adds a
 * stem to the baseline, and a funnel draws its stages as trapezoids — none of
 * which changes what a reader navigates, so all four are built by
 * {@link buildBarLayer} and differ only in the type the layer announces.
 */
export type BarMarkTraceType
  = | typeof TraceType.BAR
    | typeof TraceType.DOT
    | typeof TraceType.FUNNEL
    | typeof TraceType.LOLLIPOP;

/**
 * Configuration for binding a D3 bar chart.
 *
 * Also the config for the other three bar-family marks — {@link bindD3Dot},
 * {@link bindD3Lollipop} and {@link bindD3Funnel} — which read the same
 * `{ category, value }` datum off a different element.
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
 * Trace types that share the line extraction: one series per path, one value
 * per sample.
 *
 * An area fills the band under the line and a bump chart plots ranks instead
 * of magnitudes; both are navigated as a multi-line grid, so all of them are
 * built by {@link buildLineLayer} and differ only in the type the layer
 * announces — which is what makes the trace read the values correctly (an
 * area reports its stack total, a bump inverts its pitch).
 */
export type LineMarkTraceType
  = | typeof TraceType.AREA
    | typeof TraceType.BUMP
    | typeof TraceType.LINE
    | typeof TraceType.NORMALIZED_AREA
    | typeof TraceType.STACKED_AREA;

/**
 * Area chart type: independent bands, stacked bands, or stacked bands scaled
 * to a common whole.
 */
export type AreaTraceType
  = | typeof TraceType.AREA
    | typeof TraceType.NORMALIZED_AREA
    | typeof TraceType.STACKED_AREA;

/**
 * Configuration for binding a D3 area chart (plain, stacked, or 100% stacked).
 *
 * Extends {@link D3LineConfig} because an area is a line with the band under
 * it filled: `selector` matches one `<path>` per series, and the same
 * accessors read each sample.
 *
 * Supports both common D3 patterns:
 *
 * 1. **Plain point arrays** — `d3.area()` over an array of `{ x, y }` rows,
 *    one array bound per `<path>` (or per-point elements via `pointSelector`).
 * 2. **`d3.stack()` output** — the datum bound to each `<path>` is the series
 *    array itself, carrying `.key`, whose items are `[y0, y1]` tuples with a
 *    `.data` back-reference to the row. The binder recognises that shape and
 *    unwraps it: `x` is read from the row, `y` is the band's own height
 *    (`y1 - y0`), and the series' `.key` becomes its name.
 *
 * In that second shape the two accessors address different objects, because
 * that is where the two values live: `x` is resolved against the **row** —
 * function accessors included, so write `d => d.year`, not `d => d.data.year`
 * — while an explicit `y` is resolved against the **tuple**, keeping
 * `d => d[1] - d[0]` and any custom offset expressible.
 *
 * @example
 * ```ts
 * // d3.stack() + d3.area().y0(d => y(d[0])).y1(d => y(d[1]))
 * bindD3Area(svg, {
 *   selector: 'path.area',
 *   type: TraceType.STACKED_AREA,
 *   axes: { x: 'Year', y: 'Revenue', fill: 'Product' },
 *   x: 'year',   // a key on the stacked row, not on the [y0, y1] tuple
 * });
 * ```
 */
export interface D3AreaConfig extends D3LineConfig {
  /** The type of area chart. @default TraceType.AREA */
  type?: AreaTraceType;
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
 * Trace types that share the scatter extraction: one x and one y per point.
 *
 * A Manhattan plot is a scatter read almost entirely through a threshold —
 * `-log10(p)` against genomic position — so it carries two things a scatter
 * does not (what each point *is*, and which region it belongs to) but is
 * extracted the same way, by {@link buildScatterLayer}.
 */
export type ScatterMarkTraceType
  = | typeof TraceType.MANHATTAN
    | typeof TraceType.SCATTER;

/**
 * Configuration for binding a D3 Manhattan plot.
 *
 * Extends {@link D3ScatterConfig} because the marks are the same: one element
 * per point, with `x` the genomic position and `y` the transformed p-value.
 * What it adds is the part of the chart a sighted reader takes from the labels
 * and the colours — which SNP a point is, which chromosome it sits on, and
 * where the significance line was drawn.
 *
 * @example
 * ```ts
 * bindD3Manhattan(svgElement, {
 *   selector: 'circle.snp',
 *   axes: { x: 'Position', y: '-log10(p)', fill: 'Chromosome' },
 *   x: 'pos',
 *   y: 'logP',
 *   label: 'snp',
 *   group: 'chromosome',
 *   significance: 7.3,
 * });
 * ```
 */
export interface D3ManhattanConfig extends D3ScatterConfig {
  /**
   * Accessor for what each point *is* — a SNP id, a probe, a marker.
   * @default 'label', falling back to `snp`, `id`, `name`, `gene`, or `probe`.
   * Left out of the payload when the datum carries none of them.
   */
  label?: DataAccessor<string>;
  /**
   * Accessor for the region a point belongs to — its chromosome.
   * @default 'group', falling back to `chromosome`, `chrom`, `chr`, or
   * `region`. Left out of the payload when the datum carries none of them.
   */
  group?: DataAccessor<string>;
  /**
   * The significance cutoff on the y axis, on the axis the chart is drawn
   * against — 7.3 for genome-wide significance on a `-log10(p)` axis.
   *
   * There is deliberately no default: the conventions differ by field and by
   * software, and a guessed line would sort every point onto the wrong side
   * silently. Omit it and the trace simply reports no findings.
   */
  significance?: number;
  /**
   * Which side of `significance` is the significant one. `'above'` (the
   * default) suits the transformed axes these charts usually carry; a **raw p
   * axis runs the other way** and needs `'below'`.
   */
  significanceDirection?: 'above' | 'below';
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
 * Trace types that share the segmented extraction: one category, one value and
 * one series key per mark.
 *
 * A diverging bar chart (a population pyramid, a Likert scale) is two series
 * drawn back to back rather than one on top of the other, which changes how the
 * values are read but not how they are extracted — so it is built by
 * {@link buildSegmentedLayer} like the other three, selected through
 * `config.type`.
 */
export type SegmentedTraceType
  = | typeof TraceType.STACKED
    | typeof TraceType.DODGED
    | typeof TraceType.NORMALIZED
    | typeof TraceType.DIVERGING;

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
  /**
   * Chart orientation. Emitted only when given, so a chart that does not
   * declare one is read the core's way (vertical).
   *
   * Set it for the charts that are drawn on their side — a population pyramid
   * is the usual one: with `Orientation.HORIZONTAL`, `x` reads the (signed)
   * value and `y` the category, which is the order the bars are drawn in.
   */
  orientation?: Orientation;
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
 * Configuration for binding a D3 pie or doughnut chart.
 *
 * The canonical D3 pie is `d3.pie()` + `d3.arc()` drawn as one `<path>` per
 * slice, so `selector` should match those paths. Both accessors are read
 * against YOUR datum, not the arc the layout wraps it in — the binder unwraps
 * the arc first.
 *
 * @example
 * ```ts
 * bindD3Pie(svg, {
 *   selector: 'path.slice',
 *   axes: { x: 'Fruit', y: 'Units' },
 *   x: 'fruit',
 * });
 * ```
 */
export interface D3PieConfig extends D3BinderConfig {
  /** CSS selector for the wedge elements (e.g., `'path.slice'`, `'path.arc'`). */
  selector: string;
  /**
   * Accessor for the slice label. @default 'x', falling back to `label`,
   * `name`, `category`, or `key` when the datum has one of those instead.
   * A datum that is a bare number or string labels its own slice.
   */
  x?: DataAccessor<string | number>;
  /**
   * Accessor for the slice magnitude. Defaults to the value `d3.pie()` itself
   * computed for the slice, which is what the drawn angle is proportional to;
   * supply this only for a pie drawn without the layout.
   */
  y?: DataAccessor<number>;
  /**
   * Axis labels. A pie has no fill axis: the share of the whole is derived
   * from the values themselves, so there is nothing for a third axis to name.
   */
  axes?: {
    /** What the slice labels mean, e.g. `'Fruit'`. */
    x?: D3AxisInput;
    /** What the slice values measure, e.g. `'Units'`. */
    y?: D3AxisInput;
  };
}

/**
 * Configuration for binding a D3 error-bar (point-range) chart.
 *
 * The canonical D3 idiom is one `<g>` per estimate holding a `<line>` for the
 * interval and a marker for the estimate itself, so point `selector` at those
 * groups — one matched element per estimate, whichever mark carries it.
 *
 * The bounds are **absolute positions** on the value axis, not half-widths.
 * That is the one conversion this binder cannot do for you: a datum carrying
 * `±se` needs a function accessor (`yMin: d => d.mean - d.se`), because the
 * binder has no way to tell an offset from a bound by looking at it.
 *
 * @example
 * ```ts
 * bindD3ErrorBar(svgElement, {
 *   selector: 'g.estimate',
 *   axes: { x: 'Group', y: 'Response' },
 *   x: 'group',
 *   y: 'mean',
 *   yMin: d => d.mean - 1.96 * d.se,
 *   yMax: d => d.mean + 1.96 * d.se,
 * });
 * ```
 */
export interface D3ErrorBarConfig extends D3BinderConfig {
  /** CSS selector for the per-estimate elements (e.g. `'g.estimate'`). */
  selector: string;
  /** Accessor for the x-axis (category) value. @default 'x' */
  x?: DataAccessor<string | number>;
  /**
   * Accessor for the estimate itself. @default 'y', falling back to `value`,
   * `mean`, `estimate`, or `median`.
   */
  y?: DataAccessor<number>;
  /**
   * Accessor for the interval's absolute lower bound. @default 'yMin',
   * falling back to `lower`, `ciLow`, `ci_low`, `low`, or `min`. Omitted from
   * the payload when the datum carries none of them — a one-sided interval is
   * a real chart.
   */
  yMin?: DataAccessor<number>;
  /**
   * Accessor for the interval's absolute upper bound. @default 'yMax',
   * falling back to `upper`, `ciHigh`, `ci_high`, `high`, or `max`.
   */
  yMax?: DataAccessor<number>;
  /** Chart orientation. @default Orientation.VERTICAL */
  orientation?: Orientation;
}

/**
 * Configuration for binding a D3 dumbbell (connected-dot) chart.
 *
 * Point `selector` at the **connectors** — one `<line>` per row — rather than
 * at the dots: a chart draws one segment per row and two dots, so the
 * connectors are the elements that map one-to-one onto the data, and the
 * trace highlights the same segment at both ends of a row.
 *
 * `startLabel` / `endLabel` are config rather than accessors because they
 * belong to the chart and not to any one row — they are what the two dots are
 * called ("1990" and "2020"), which is exactly what a legend gives a sighted
 * reader and what the announcement would otherwise have to call "start" and
 * "end".
 *
 * @example
 * ```ts
 * bindD3Dumbbell(svgElement, {
 *   selector: 'line.connector',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'Years', y: 'Country' },
 *   x: 'country',
 *   start: 'y1990',
 *   end: 'y2020',
 *   startLabel: '1990',
 *   endLabel: '2020',
 * });
 * ```
 */
export interface D3DumbbellConfig extends D3BinderConfig {
  /** CSS selector for the connector elements (e.g. `'line.connector'`). */
  selector: string;
  /** Accessor for the category value. @default 'x' */
  x?: DataAccessor<string | number>;
  /**
   * Accessor for the value the segment starts at. @default 'start',
   * falling back to `from`, `before`, or `y0`.
   */
  start?: DataAccessor<number>;
  /**
   * Accessor for the value the segment ends at. @default 'end',
   * falling back to `to`, `after`, or `y1`.
   */
  end?: DataAccessor<number>;
  /** What the starting end is called — `'1990'`, `'before'`, `'control'`. */
  startLabel?: string;
  /** What the finishing end is called — `'2020'`, `'after'`, `'treatment'`. */
  endLabel?: string;
  /** Chart orientation. @default Orientation.VERTICAL */
  orientation?: Orientation;
}

/**
 * Configuration for binding a D3 waterfall (bridge) chart.
 *
 * A waterfall draws each step as a bar floating between the running total
 * before it and the running total after it, so `start` and `end` are the two
 * numbers the rect is already drawn from. The contribution (`delta`) is
 * derived from them.
 *
 * `kind` is the one thing the binder cannot infer: an opening, closing or
 * subtotal bar is drawn exactly like a step but contributes nothing, and only
 * the author knows which bars those are. Supply the accessor for them; every
 * other bar is classified from the sign of its contribution.
 *
 * @example
 * ```ts
 * bindD3Waterfall(svgElement, {
 *   selector: 'rect.step',
 *   axes: { x: 'Step', y: 'Amount' },
 *   x: 'label',
 *   kind: d => (d.isTotal ? 'total' : undefined),
 * });
 * ```
 */
export interface D3WaterfallConfig extends D3BinderConfig {
  /** CSS selector for the per-step elements (e.g. `'rect.step'`). */
  selector: string;
  /** Accessor for the step's label. @default 'x' */
  x?: DataAccessor<string | number>;
  /**
   * Accessor for the running total before the step. @default 'start',
   * falling back to `from`, `y0`, or `base`.
   */
  start?: DataAccessor<number>;
  /**
   * Accessor for the running total after the step. @default 'end',
   * falling back to `to`, `y1`, or `cumulative`.
   */
  end?: DataAccessor<number>;
  /**
   * Accessor marking a bar as an opening, closing or subtotal (`'total'`).
   * Returning `undefined` falls back to the derived kind, so
   * `d => (d.isTotal ? 'total' : undefined)` marks only the totals.
   *
   * When omitted, a step is an `'increase'` unless its contribution is
   * negative, in which case it is a `'decrease'`.
   */
  kind?: DataAccessor<WaterfallKind | undefined>;
}

/**
 * Configuration for binding a D3 word cloud.
 *
 * The layout — `d3-cloud`'s `cloud().words(...)`, or any other — is
 * deliberately not read: where a term landed carries no data, so the payload
 * is the term and its weight alone. Point `selector` at the `<text>` glyphs.
 *
 * The default accessors are `d3-cloud`'s own datum keys (`text` and `size`),
 * since that is what all but hand-rolled clouds are laid out with.
 *
 * @example
 * ```ts
 * bindD3WordCloud(svgElement, {
 *   selector: 'text.term',
 *   axes: { x: 'Term', y: 'Occurrences' },
 * });
 * ```
 */
export interface D3WordCloudConfig extends D3BinderConfig {
  /** CSS selector for the term elements (e.g. `'text.term'`). */
  selector: string;
  /**
   * Accessor for the term. @default 'text', falling back to `word`,
   * `term`, `label`, `name`, or `x`.
   */
  x?: DataAccessor<string>;
  /**
   * Accessor for the term's weight. @default 'size', falling back to
   * `value`, `weight`, `count`, `frequency`, or `y`.
   */
  y?: DataAccessor<number | string>;
}

/**
 * Configuration for binding a D3 gauge or bullet chart.
 *
 * A drawn gauge binds only the measure — the dial's range, the target marker
 * and the qualitative bands are drawn from numbers the author holds and the
 * DOM does not carry, which is why they are config rather than accessors.
 * They are also the whole reading: "73" means nothing without the range it
 * sits in, the target it was aiming at, and the band it lands in.
 *
 * Point `selector` at the needle, the value arc, or the bullet's measure bar
 * — the mark that moves with the value.
 *
 * @example
 * ```ts
 * bindD3Gauge(svgElement, {
 *   selector: 'rect.measure',
 *   axes: { x: 'Measure', y: 'Percent' },
 *   label: 'Conversion',
 *   min: 0,
 *   max: 100,
 *   target: 80,
 *   bands: [{ to: 50, label: 'poor' }, { to: 75, label: 'ok' }, { to: 100, label: 'good' }],
 * });
 * ```
 */
export interface D3GaugeConfig extends D3BinderConfig {
  /** CSS selector for the needle or value arc (e.g. `'path.needle'`). */
  selector: string;
  /**
   * Accessor for the measure. @default 'value', falling back to `y`,
   * `amount`, `measure`, `current`, or `actual`. A datum that is a bare
   * number is the measure itself.
   */
  value?: DataAccessor<number>;
  /** Lower end of the dial. */
  min: number;
  /** Upper end of the dial. */
  max: number;
  /** What the measure is called — `'Conversion'`. */
  label?: string;
  /** The target marker a bullet chart draws, when it has one. */
  target?: number;
  /** Qualitative bands, in ascending order. */
  bands?: GaugeBand[];
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
  = | { chartType: 'area'; config: D3AreaConfig }
    | { chartType: 'bar'; config: D3BarConfig }
    | { chartType: 'box'; config: D3BoxConfig }
    | { chartType: 'bump'; config: D3LineConfig }
    | { chartType: 'candlestick'; config: D3CandlestickConfig }
    | { chartType: 'dot'; config: D3BarConfig }
    | { chartType: 'dumbbell'; config: D3DumbbellConfig }
    | { chartType: 'errorBar'; config: D3ErrorBarConfig }
    | { chartType: 'funnel'; config: D3BarConfig }
    | { chartType: 'gauge'; config: D3GaugeConfig }
    | { chartType: 'heatmap'; config: D3HeatmapConfig }
    | { chartType: 'histogram'; config: D3HistogramConfig }
    | { chartType: 'line'; config: D3LineConfig }
    | { chartType: 'lollipop'; config: D3BarConfig }
    | { chartType: 'manhattan'; config: D3ManhattanConfig }
    | { chartType: 'pie'; config: D3PieConfig }
    | { chartType: 'scatter'; config: D3ScatterConfig }
    | { chartType: 'segmented'; config: D3SegmentedConfig }
    | { chartType: 'smooth'; config: D3SmoothConfig }
    | { chartType: 'waterfall'; config: D3WaterfallConfig }
    | { chartType: 'wordCloud'; config: D3WordCloudConfig };

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
    | DumbbellData
    | ErrorBarPoint[]
    | GaugePoint
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | PiePoint[]
    | ScatterPoint[]
    | SegmentedPoint[][]
    | SmoothPoint[][]
    | VolcanoPoint[]
    | WaterfallPoint[]
    | WordCloudPoint[];
