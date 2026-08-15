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
  BoxenPoint,
  BoxPoint,
  CandlestickPoint,
  DumbbellData,
  ErrorBarPoint,
  FlowPoint,
  ForestPoint,
  GanttData,
  GaugeBand,
  GaugePoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MosaicPoint,
  NetworkPoint,
  Orientation,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  SmoothPoint,
  TraceType,
  TreemapPoint,
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
 * An area fills the band under the line, a bump chart plots ranks instead of
 * magnitudes, a radar wraps the samples around a circle, and a survival curve
 * steps down them; all of them are navigated as a multi-line grid, so all of
 * them are built by {@link buildLineLayer} and differ only in the type the
 * layer announces — which is what makes the trace read the values correctly
 * (an area reports its stack total, a bump inverts its pitch, a radar pans by
 * the spoke's angle, a survival curve finds its median).
 */
export type LineMarkTraceType
  = | typeof TraceType.AREA
    | typeof TraceType.BUMP
    | typeof TraceType.LINE
    | typeof TraceType.NORMALIZED_AREA
    | typeof TraceType.RADAR
    | typeof TraceType.STACKED_AREA
    | typeof TraceType.SURVIVAL;

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
 * `-log10(p)` against genomic position — and a volcano is the same reading
 * with effect size on the x axis. Both carry two things a scatter does not
 * (what each point *is*, and which region it belongs to) but are extracted the
 * same way, by {@link buildScatterLayer}.
 */
export type ScatterMarkTraceType
  = | typeof TraceType.MANHATTAN
    | typeof TraceType.SCATTER
    | typeof TraceType.VOLCANO;

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
 * Configuration for binding a D3 volcano plot.
 *
 * Extends {@link D3ManhattanConfig} because the two are the same chart read
 * the same way: `label` names the gene the way it names the SNP, and
 * `significance` is the same cutoff on the same axis. What a volcano adds is
 * the **second** cutoff — the x axis is an effect size rather than a position,
 * so a point is a finding only when it clears both.
 *
 * @example
 * ```ts
 * bindD3Volcano(svgElement, {
 *   selector: 'circle.gene',
 *   axes: { x: 'log2 fold change', y: '-log10(p)' },
 *   x: 'lfc',
 *   y: 'logP',
 *   label: 'gene',
 *   significance: 1.3,
 *   effect: 1,
 * });
 * ```
 */
export interface D3VolcanoConfig extends D3ManhattanConfig {
  /**
   * The effect-size cutoff on the x axis, applied to its **magnitude** — a
   * volcano is symmetric, and a fold change of -2 is as large an effect as
   * one of +2.
   *
   * Like `significance`, there is no default: the conventions differ by field,
   * and a guessed line would sort every gene onto the wrong side silently.
   */
  effect?: number;
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
 *
 * A mosaic is a stacked bar whose column widths carry a second magnitude. That
 * width is the one thing the segmented extraction does not already read, so a
 * mosaic is the same core with two extra accessors ({@link D3MosaicConfig}).
 */
export type SegmentedTraceType
  = | typeof TraceType.STACKED
    | typeof TraceType.DODGED
    | typeof TraceType.NORMALIZED
    | typeof TraceType.DIVERGING
    | typeof TraceType.MOSAIC;

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
 * Configuration for binding a D3 mosaic (marimekko) plot.
 *
 * Extends {@link D3SegmentedConfig} because a mosaic *is* a stacked bar: same
 * `<rect>` per cell, same `{ x, y, fill }` extraction, same DOM-order
 * detection. What it adds is the column **width**, which on every other chart
 * is how the bars were drawn and here is the second magnitude the plot exists
 * to show — a category of six people and one of six hundred read identically
 * without it.
 *
 * The width is read from the datum, never measured off the rendered `<rect>`:
 * a drawn width is a layout fact (padding, margins, a log scale) and turning
 * it back into a proportion would announce a number the data does not contain.
 *
 * @example
 * ```ts
 * bindD3Mosaic(svgElement, {
 *   selector: 'rect.cell',
 *   axes: { x: 'Class', y: 'Proportion', fill: 'Outcome' },
 *   x: 'klass',
 *   y: 'share',
 *   fill: 'outcome',
 *   width: 'columnShare',
 *   count: 'n',
 * });
 * ```
 */
export interface D3MosaicConfig extends D3SegmentedConfig {
  /**
   * Accessor for the column's share of all observations, as a fraction of one.
   * @default 'width', falling back to `share`, `proportion`, or `marginal`.
   * Omitted from the payload when the datum carries none of them, and when the
   * value read is not a finite number.
   */
  width?: DataAccessor<number>;
  /**
   * Accessor for the cell's own count, when the producer has the contingency
   * table the mosaic was drawn from.
   * @default 'count', falling back to `n`, `freq`, or `frequency`. Omitted
   * from the payload when absent — a count multiplied out of a rounded share
   * is a number the data does not contain.
   */
  count?: DataAccessor<number>;
}

/**
 * Configuration for binding a D3 force-directed network.
 *
 * Point `selector` at the **links** — one `<line>` per edge — rather than at
 * the node circles: the nodes are derived from the links, so a link is what
 * maps one-to-one onto the payload, and it is what the chart draws between a
 * pair of nodes.
 *
 * Positions are deliberately not read. Where a force-directed node lands is a
 * fact about the solver's seed rather than about the data.
 *
 * @example
 * ```ts
 * bindD3Network(svgElement, {
 *   selector: 'line.link',
 *   axes: { x: 'Person', y: 'Links' },
 * });
 * ```
 */
export interface D3NetworkConfig extends D3BinderConfig {
  /** CSS selector for the link elements (e.g. `'line.link'`). */
  selector: string;
  /**
   * Accessor for the node a link leaves. @default 'source', falling back to
   * `from` or `src`.
   *
   * `d3.forceLink` **replaces** each link's `source` with the node object it
   * resolved the id to, so the resolved value is normalised either way: an
   * object end is read through its `id`, `name`, `key` or `label`.
   */
  source?: DataAccessor<unknown>;
  /**
   * Accessor for the node a link arrives at. @default 'target', falling back
   * to `to` or `dst`. Normalised the same way as {@link D3NetworkConfig.source}.
   */
  target?: DataAccessor<unknown>;
}

/**
 * Trace types that share the flow extraction: one ribbon per weighted link,
 * named by the pair of nodes it joins.
 *
 * A sankey runs its ribbons left to right, an alluvial repeats the node columns
 * and a chord wraps them around a circle; all three are the same weighted graph,
 * so all three are built by {@link buildFlowLayer} and differ only in the type
 * the layer announces.
 */
export type FlowTraceType
  = | typeof TraceType.ALLUVIAL
    | typeof TraceType.CHORD
    | typeof TraceType.SANKEY;

/**
 * Configuration for binding a D3 sankey, alluvial or chord diagram.
 *
 * Point `selector` at the **ribbons** — one `<path>` per link — rather than at
 * the node rectangles: the nodes are derived from the links exactly as a
 * network's are, so a link is what maps one-to-one onto the payload.
 *
 * `d3-sankey` **replaces** each link's `source` and `target` with the node
 * objects it resolved them to, the way `d3.forceLink` does, so an object end is
 * read through its `id`, `name`, `key` or `label`. `d3.chord()` is the one that
 * needs help: its ends are the matrix's row and column **indices**, which is
 * what {@link D3FlowConfig.names} is for.
 *
 * @example
 * ```ts
 * bindD3Sankey(svgElement, {
 *   selector: 'path.ribbon',
 *   axes: { x: 'Node', y: 'Petajoules' },
 * });
 * ```
 */
export interface D3FlowConfig extends D3BinderConfig {
  /** CSS selector for the ribbon elements (e.g. `'path.ribbon'`). */
  selector: string;
  /**
   * Accessor for the node a flow leaves. @default 'source', falling back to
   * `from` or `src`. An object end is named through its `id`, `name`, `key` or
   * `label`, or — for a chord — through {@link D3FlowConfig.names}.
   */
  source?: DataAccessor<unknown>;
  /**
   * Accessor for the node a flow arrives at. @default 'target', falling back
   * to `to` or `dst`. Named the same way as {@link D3FlowConfig.source}.
   */
  target?: DataAccessor<unknown>;
  /**
   * Accessor for how much flows. @default 'value', falling back to `weight`,
   * `amount`, `count`, or `y`. When the datum carries none of them, the
   * magnitude `d3.chord()` put on each end (`d.source.value`) is used, which
   * is what the ribbon's width was drawn from.
   */
  value?: DataAccessor<number>;
  /**
   * What the matrix's rows are called, in matrix order — the labels a chord
   * diagram draws around the dial.
   *
   * `d3.chord()` binds `{ index, value, … }` to each end rather than a name,
   * because a matrix has no names in it. Without this a chord announces its
   * ends as the bare indices they are; with it, the reader is told which
   * groups the ribbon joins.
   */
  names?: (string | number)[];
}

/**
 * Configuration for binding a D3 gantt (timeline, swimlane) chart.
 *
 * Point `selector` at the interval marks — one `<rect>` per booked interval on
 * a band scale of lanes. The binder groups them into lanes itself: the payload
 * is nested by lane, and the DOM order a chart happens to draw in is not that
 * grouping.
 *
 * **Dates are coerced to epoch milliseconds.** A `Date` or a date string is
 * turned into a number so the trace can measure lengths at all; pair it with
 * `format: { type: 'date' }` so the ends are announced as dates rather than as
 * timestamps.
 *
 * @example
 * ```ts
 * bindD3Gantt(svgElement, {
 *   selector: 'rect.task',
 *   axes: { x: 'Day', y: 'Phase' },
 *   x: 'phase',
 *   start: 'from',
 *   end: 'to',
 *   label: 'task',
 *   lanes: ['Design', 'Build', 'Review', 'Launch'],
 *   unit: 'days',
 * });
 * ```
 */
export interface D3GanttConfig extends D3BinderConfig {
  /** CSS selector for the interval elements (e.g. `'rect.task'`). */
  selector: string;
  /**
   * Accessor for the lane an interval belongs to. @default 'x', falling back
   * to `lane`, `category`, `label`, `name`, `key`, `group`, or `task`.
   */
  x?: DataAccessor<string | number | Date>;
  /**
   * Accessor for where the interval begins. @default 'start', falling back to
   * `from`, `begin`, `x0`, or `startDate`.
   */
  start?: DataAccessor<number | string | Date>;
  /**
   * Accessor for where the interval ends. @default 'end', falling back to
   * `to`, `finish`, `x1`, or `endDate`.
   */
  end?: DataAccessor<number | string | Date>;
  /**
   * Accessor for what the interval is called, when the lane is not already its
   * name. @default 'label', falling back to `name`, `task`, `title`, or
   * `activity`. Omitted from the payload when the datum carries none of them.
   */
  label?: DataAccessor<string>;
  /**
   * The lanes, in the order the chart draws them.
   *
   * Needed only for **empty** lanes: a lane with nothing booked has no element
   * in the DOM at all, so the binder cannot discover it, and an empty row is a
   * real statement about a schedule. Lanes carrying intervals name themselves
   * and need no entry here; any the binder finds and this does not declare are
   * appended in the order they were drawn.
   */
  lanes?: (string | number)[];
  /** What a unit of the axis is called — `'days'`, `'hours'`, `'weeks'`. */
  unit?: string;
  /**
   * Chart orientation. @default Orientation.HORIZONTAL — a gantt drawn the
   * ordinary way runs its bars left to right, which puts the axis on x and the
   * lanes on y. Pass `Orientation.VERTICAL` for a schedule drawn as columns.
   */
  orientation?: Orientation;
}

/**
 * Configuration for binding a D3 boxen (letter-value) plot.
 *
 * Point `selector` at one element per distribution — the `<g>` holding the
 * stack of nested rungs — the way {@link D3BoxConfig} points at a box group.
 * Every rung of a distribution highlights that whole group, because a chart
 * does not draw an element per quantile that MAIDR could pair up positionally.
 *
 * The ladder is read from the datum rather than measured off the rungs: a
 * letter-value plot computes its quantiles before it draws them, and a height
 * in pixels is a layout fact rather than a quantile.
 *
 * @example
 * ```ts
 * bindD3Boxen(svgElement, {
 *   selector: 'g.boxen',
 *   axes: { x: 'Group', y: 'Milliseconds' },
 *   x: 'group',
 *   median: 'median',
 *   levels: 'letterValues',
 * });
 * ```
 */
export interface D3BoxenConfig extends D3BinderConfig {
  /** CSS selector for the per-distribution elements (e.g. `'g.boxen'`). */
  selector: string;
  /**
   * Accessor for the category the distribution summarises. @default 'x',
   * falling back to `z`, `category`, `label`, `name`, `key`, or `group`.
   */
  x?: DataAccessor<string | number>;
  /**
   * Accessor for the middle of the distribution. @default 'median', falling
   * back to `q2`, `mid`, or `y`.
   */
  median?: DataAccessor<number>;
  /**
   * Accessor for the ladder of quantile pairs — one entry per rung, each
   * carrying the tail probability `p` and the pair of quantiles `lo` / `hi`
   * (`lower` / `upper` are accepted too).
   *
   * @default 'levels', falling back to `letterValues`, `letter_values`,
   * `quantiles`, or `ladder`. A rung whose three numbers are not all finite is
   * dropped rather than announced as a quantile the data does not contain.
   */
  levels?: DataAccessor<unknown[]>;
  /** Accessor for values below the deepest rung. @default 'lowerOutliers' */
  lowerOutliers?: DataAccessor<number[]>;
  /** Accessor for values above the deepest rung. @default 'upperOutliers' */
  upperOutliers?: DataAccessor<number[]>;
  /** Chart orientation. @default Orientation.VERTICAL */
  orientation?: Orientation;
}

/**
 * Configuration for binding a D3 forest plot.
 *
 * Extends {@link D3ErrorBarConfig} because a forest plot *is* a point-range
 * chart: one row per study, an estimate and an interval read the same way. What
 * it adds is the part a sighted reader takes from the drawing — how much each
 * study weighs, which row is the pooled summary, and where the null line sits.
 *
 * The pooled row is usually a differently-shaped mark (a diamond `<path>`, not
 * a whip), so it is selected separately with `pooledSelector` and appended
 * after the studies. A chart that draws every row alike can instead mark it
 * with the `pooled` accessor.
 *
 * @example
 * ```ts
 * bindD3Forest(svgElement, {
 *   selector: 'g.study',
 *   pooledSelector: 'path.pooled',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'Odds ratio', y: 'Study' },
 *   x: 'study',
 *   y: 'or',
 *   yMin: 'ciLow',
 *   yMax: 'ciHigh',
 *   weight: 'weight',
 *   nullValue: 1,
 * });
 * ```
 */
export interface D3ForestConfig extends D3ErrorBarConfig {
  /**
   * Accessor for the study's weight in the pooled estimate, as a fraction of
   * one. @default 'weight', falling back to `w` or `share`. Omitted from the
   * payload when the datum carries none of them — a forest plot without
   * weights is a real chart.
   */
  weight?: DataAccessor<number>;
  /**
   * Accessor marking a row as the pooled summary rather than a study.
   * @default 'pooled', falling back to `isPooled` or `summary`. Every row
   * matched by `pooledSelector` is pooled regardless.
   */
  pooled?: DataAccessor<boolean>;
  /**
   * CSS selector for the pooled summary's own mark, when it is drawn
   * differently from the studies — the diamond a meta-analysis ends with.
   * Its rows are appended after the studies, in the order they are drawn.
   */
  pooledSelector?: string;
  /**
   * The value that means "no effect" — 1 for a ratio measure, 0 for a
   * difference.
   *
   * Whether a study's interval crosses it is the result for that study, so the
   * trace announces the crossing. There is deliberately **no default**: a ratio
   * chart guessed at 0 would report every study as not crossing, which is a
   * confident wrong answer given to every row.
   */
  nullValue?: number;
}

/**
 * Trace types that share the hierarchy extraction: one node per mark, named by
 * the path from the root down to it.
 *
 * A treemap lays the tree out as nested rectangles, a sunburst as concentric
 * arcs and an icicle as depth-ordered bands; the tree is the same, so all three
 * are built by {@link buildTreemapLayer} and differ only in the type the layer
 * announces — which is what makes the sunburst pan by the node's angle around
 * the dial.
 */
export type TreemapTraceType
  = | typeof TraceType.ICICLE
    | typeof TraceType.SUNBURST
    | typeof TraceType.TREEMAP;

/**
 * Configuration for binding a D3 treemap or sunburst.
 *
 * The canonical layout is `d3.treemap()` / `d3.partition()` over a
 * `d3.hierarchy()`, so the datum bound to each mark is a **hierarchy node**:
 * the binder recognises it and reads the node's own `value` plus its ancestor
 * chain, exactly as the pie binder unwraps a `d3.pie()` arc. Both accessors
 * are then read against YOUR datum (`node.data`), not against the node.
 *
 * Every matched element becomes one point, in DOM order — nothing is filtered.
 * A treemap draws only its leaves and a sunburst draws its interior nodes too;
 * whichever you select is what the reader navigates, and the counts have to
 * match for highlighting to survive.
 *
 * @example
 * ```ts
 * // svg.selectAll('rect.leaf').data(d3.treemap()(root).leaves())
 * bindD3Treemap(svgElement, {
 *   selector: 'rect.leaf',
 *   axes: { x: 'Region', y: 'Population, millions' },
 * });
 * ```
 */
export interface D3TreemapConfig extends D3BinderConfig {
  /** CSS selector for the node elements (e.g. `'rect.leaf'`, `'path.arc'`). */
  selector: string;
  /**
   * Accessor for the node's own name, read against your datum.
   * @default 'name', falling back to `id`, `label`, `key`, or `x`. A datum
   * that is a bare string or number names its own node.
   *
   * The same accessor names every ancestor when `path` is derived, so the
   * breadcrumb and the node agree about what things are called.
   */
  x?: DataAccessor<string | number>;
  /**
   * Accessor for the node's magnitude. Defaults to the `value` that
   * `d3.hierarchy().sum(...)` computed — which is what the rectangle's area
   * was drawn from — falling back to `value` or `size` on your datum.
   */
  y?: DataAccessor<number>;
  /**
   * Accessor for the node's ancestors, root first and **excluding the node
   * itself**. Defaults to the hierarchy node's own ancestor chain, so a layout
   * built with `d3.hierarchy()` needs nothing here.
   *
   * Supply it for a tree drawn without `d3.hierarchy()`: `[]` (or an omitted
   * value) marks a top-level node.
   */
  path?: DataAccessor<(string | number)[]>;
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
 * Configuration for binding a D3 polar area (coxcomb, rose) chart.
 *
 * The wedges are drawn the way a pie's are — `d3.arc()` per category, usually
 * over `d3.pie()` output — so this is {@link D3PieConfig} verbatim, and the
 * binder unwraps the layout's arc for you the same way. What differs is what
 * the wedge encodes: a polar area gives every category the same angle and
 * varies the **radius**, so the values are read as a series around the spokes
 * rather than as shares of a whole.
 *
 * @example
 * ```ts
 * bindD3PolarArea(svgElement, {
 *   selector: 'path.wedge',
 *   axes: { x: 'Month', y: 'Deaths' },
 *   x: 'month',
 * });
 * ```
 */
export type D3PolarAreaConfig = D3PieConfig;

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
 * Configuration for binding a D3 Kaplan-Meier survival curve.
 *
 * A survival curve is a step line — `d3.line().curve(d3.curveStepAfter)` over
 * one `<path>` per arm — so `selector`, `pointSelector` and the `x`/`y`/`fill`
 * accessors are {@link D3LineConfig}'s, unchanged. What a survival figure
 * carries beyond a step chart is the two things it is read for: which times
 * were **censored**, and how wide the **confidence band** is.
 *
 * Censoring marks are drawn as ticks from their own data join, not as vertices
 * of the curve, so they are usually a separate selection: point
 * `censoredSelector` at them and the binder merges each tick into its arm by
 * time — flagging the vertex already at that time, or inserting one carrying
 * the probability the curve holds there. When the curve's own samples already
 * say (a `censored` column), leave `censoredSelector` unset and let the
 * `censored` accessor read it.
 */
export interface D3SurvivalConfig extends D3LineConfig {
  /**
   * Accessor for whether a sample is a censored time. @default 'censored',
   * falling back to `censor` or `isCensored`. `true`, `1`, `'1'` and `'true'`
   * count as censored; anything else does not.
   *
   * Deliberately NOT aliased to `event`, which most survival datasets carry
   * with the opposite meaning — a 1 there is the event happening, which is
   * exactly the times that are not censored.
   */
  censored?: DataAccessor<unknown>;
  /**
   * CSS selector for the censoring tick marks, when the chart draws them from
   * a separate data join (e.g. `'line.censor'`). Each tick is merged into the
   * arm its `fill` names — or the only arm, on a single-curve chart — at the
   * time its `x` gives.
   */
  censoredSelector?: string;
  /** Accessor for the confidence band's lower bound. @default 'yMin', falling back to `lower`, `lo`, `ciLower` or `low`. */
  yMin?: DataAccessor<number>;
  /** Accessor for the confidence band's upper bound. @default 'yMax', falling back to `upper`, `hi`, `ciUpper` or `high`. */
  yMax?: DataAccessor<number>;
}

/**
 * Configuration for binding a D3 parallel coordinates plot.
 *
 * The chart draws one `<path>` (or `<polyline>`) per **observation** across
 * several per-variable scales, and the datum bound to it is that observation
 * as a whole — `{ mpg: 21, hp: 110, weight: 2600 }`. The layer's rows are the
 * observations and its columns are the axes, so the binder transposes: for
 * each observation it emits one point per entry of `dimensions`, whose `x` is
 * the axis' name and whose `y` is that observation's value on it.
 *
 * `dimensions` is required, and is the same list the chart already built one
 * scale per: the order is the order the axes are drawn in, which is the order
 * a reader arrows through them. Nothing on the datum says it — an object's key
 * order is not an axis order — and a guessed one would announce the chart's
 * columns in the wrong places.
 */
export interface D3ParallelConfig extends D3BinderConfig {
  /**
   * CSS selector for the observation paths (e.g. `'path.observation'`,
   * `'polyline.line'`). Each matched element is one observation.
   */
  selector: string;
  /** The axes, in the order they are drawn. Each is a key on the observation. */
  dimensions: string[];
  /**
   * Reads one dimension off an observation. Defaults to a plain property
   * lookup — supply this when the values are nested (`d.values[dimension]`)
   * or need converting.
   */
  value?: (datum: unknown, dimension: string, index: number) => number;
  /**
   * Accessor for the observation's name, announced as its series name.
   * @default 'name', falling back to `label`, `id`, `key`, `group` or `fill`.
   */
  label?: DataAccessor<string>;
}

/**
 * Configuration for binding a D3 ridgeline (joy) plot.
 *
 * One `d3.area()` density curve per group, the curves offset down the page so
 * their shapes can be compared. `selector` matches one `<path>` per group, and
 * the samples come from that path's own bound array.
 *
 * **`density` is the curve's own half-width, never the drawn y.** A ridgeline
 * is drawn by adding the group's baseline to every density, and that baseline
 * is layout rather than data: fed to MAIDR it would make every group's
 * loudness a function of where it happened to be stacked, and the lowest ridge
 * the loudest. So the binder reads the kernel-density value the chart computed
 * before* offsetting it, and refuses to guess when the samples do not carry
 * one.
 *
 * The fields are named for what they mean rather than for the payload keys
 * they land on, because a ridgeline's value axis is usually the drawn `x`
 * while the payload's `y` is that same value: `group` names the ridge,
 * `value` is the position along the value axis, `density` is the height there.
 */
export interface D3RidgelineConfig extends D3BinderConfig {
  /** CSS selector for the group curves (e.g. `'path.ridge'`). One per group. */
  selector: string;
  /**
   * Accessor for the sample array, when the path's datum wraps it rather than
   * being it. Defaults to the datum itself when it is an array, the second
   * item of a `d3.groups()` tuple, or a `values` / `samples` / `points` /
   * `curve` property.
   */
  samples?: DataAccessor<unknown[]>;
  /**
   * Accessor for the group's name, resolved against the path's datum.
   * @default 'group', falling back to `key`, `name`, `x`, `label` or
   * `category`; then to the group's ordinal when the datum names nothing.
   */
  group?: DataAccessor<string | number>;
  /**
   * Accessor for a sample's position along the value axis.
   * @default 'value', falling back to `x`, `t` or `position`.
   */
  value?: DataAccessor<number>;
  /**
   * Accessor for the curve's own half-width at a sample — the density before
   * the group's baseline was added.
   * @default 'density', falling back to `kde`, `width`, `p` or `estimate`.
   */
  density?: DataAccessor<number>;
}

/**
 * Configuration for binding a D3 hexbin density plot.
 *
 * The `d3-hexbin` plugin returns one bin per occupied hexagon, and each bin is
 * an **array** of the points that fell in it, carrying `.x` and `.y` (the
 * hexagon's centre, in SCREEN space) and `.length` (the count). So the default
 * accessors read `x`, `y` and `length` off the bin, and `x`/`y` are where the
 * inverse scales go: `x: d => xScale.invert(d.x)`. Passing the screen
 * coordinates through unchanged would announce every bin's position in pixels.
 *
 * The payload is a lattice of rows, which the binder assembles itself: a
 * hexbin's DOM is a flat list in whatever order the bins were generated, and
 * an empty bin is simply absent from it. Rows are grouped by the bins' `y`
 * (override with `row` when the y values do not come out identical per row),
 * ordered from the lowest upward, and each row is ordered left to right.
 */
export interface D3HexbinConfig extends D3BinderConfig {
  /** CSS selector for the hexagons (e.g. `'path.hexagon'`). One per bin. */
  selector: string;
  /** Accessor for the bin's centre along the x axis. @default 'x', falling back to `x0` or `cx`. */
  x?: DataAccessor<number>;
  /** Accessor for the bin's centre along the y axis. @default 'y', falling back to `y0` or `cy`. */
  y?: DataAccessor<number>;
  /** Accessor for how many points fell in the bin. @default 'count', falling back to `length`, `value`, `n` or `total`. */
  count?: DataAccessor<number>;
  /**
   * Accessor for the lattice row a bin belongs to. Supply this only when the
   * bins' `y` centres do not come out identical within a row — `d3-hexbin`'s
   * do, so the default grouping by `y` is normally right.
   */
  row?: DataAccessor<number | string>;
}

/**
 * Maps one coordinate of a contour's grid onto the data axis it stands for.
 *
 * Not a {@link DataAccessor}: the input is a single number from a coordinate
 * pair, not a bound datum, and there is no element index to pass.
 */
export type D3GridTransform = (gridCoordinate: number) => number;

/**
 * Configuration for binding a D3 contour plot.
 *
 * `d3.contours()` and `d3.contourDensity()` emit one GeoJSON `MultiPolygon`
 * per threshold, carrying the threshold as `.value`, so `selector` matches one
 * `<path>` per level and the layer's rows are the levels.
 *
 * **The coordinates are not in data space.** `d3.contours()` emits grid
 * indices and `d3.contourDensity()` emits pixels, so `x` and `y` are the
 * transforms back onto the axes — `x: i => x0 + i * dx` for the former,
 * `x: px => xScale.invert(px)` for the latter. Left out, the chart announces
 * its positions in grid cells or screen pixels.
 *
 * A level drawn as several disjoint rings is flattened into one curve, in the
 * order the rings appear, since a row of the payload is a single polyline.
 * Every point announced is a real point of the level; what a reader cannot
 * hear is the jump from the end of one ring to the start of the next.
 */
export interface D3ContourConfig extends D3BinderConfig {
  /** CSS selector for the level paths (e.g. `'path.contour'`). One per level. */
  selector: string;
  /** Accessor for the level's value. @default 'value', falling back to `level`, `threshold` or `z`. */
  level?: DataAccessor<number>;
  /** Accessor for the GeoJSON rings. @default 'coordinates'. */
  coordinates?: DataAccessor<unknown>;
  /** Maps a grid x onto the x axis. @default identity. */
  x?: D3GridTransform;
  /** Maps a grid y onto the y axis. @default identity. */
  y?: D3GridTransform;
}

/**
 * Configuration for binding a D3 choropleth map.
 *
 * A choropleth is `d3.geoPath()` over a projection: one `<path>` per region,
 * each bound to the GeoJSON feature it was drawn from. So `selector` matches
 * the region paths, and a **string accessor names a key on the feature or on
 * its `properties`**, in that order — a feature keeps only `type`, `id`,
 * `geometry` and `properties` at the top level, so the joined value and the
 * place name are in `properties` on almost every map. A function accessor is
 * invoked with the whole feature.
 *
 * **`lon` and `lat` are degrees, and the wrong call gives pixels.**
 * `d3.geoPath().centroid(feature)` returns the centre of the drawn shape in
 * projected screen coordinates; `d3.geoCentroid(feature)` returns the
 * unprojected longitude/latitude pair, and that is the one to read:
 *
 * ```ts
 * lon: d => d3.geoCentroid(d)[0],
 * lat: d => d3.geoCentroid(d)[1],
 * ```
 *
 * Where only a projection is to hand, `projection.invert([px, py])` inverts
 * the pixels — but `invert` is optional in d3's projection API and several
 * projections do not implement it. When neither yields degrees, leave both
 * out: a coordinate outside ±180°/±90° is dropped rather than converted by
 * guesswork, and the map is then read as a region list in drawn order, which
 * is the poorer reading the grammar sanctions. A wrong pair is worse, because
 * it puts regions in directions from one another that the map does not.
 *
 * `neighbors` is not read: adjacency is not recoverable from rendered paths,
 * and deriving it needs shared-border topology this repository has no
 * dependency for. A layer that declares none keeps the spatial walk.
 */
export interface D3ChoroplethConfig extends D3BinderConfig {
  /** CSS selector for the region paths (e.g. `'path.region'`). One per region. */
  selector: string;
  /**
   * Accessor for the region's name.
   * @default 'region', falling back to `name`, `NAME`, `name_long`, `admin`,
   * `state`, `id`, `label` or `x` — on the feature or in its `properties`.
   */
  region?: DataAccessor<string | number>;
  /**
   * Accessor for the value the region is shaded by. A region this resolves
   * nothing for is left out of the payload — and out of the highlight
   * selectors with it — rather than announced as a zero.
   * @default 'value', falling back to `y`, `rate`, `density` or `count`.
   */
  value?: DataAccessor<number>;
  /**
   * Accessor for the region's centroid longitude, in **degrees east**.
   * `d3.geoCentroid(d)[0]`, never `d3.geoPath().centroid(d)[0]`.
   * @default 'lon', falling back to `longitude` or `long`.
   */
  lon?: DataAccessor<number>;
  /**
   * Accessor for the region's centroid latitude, in **degrees north**.
   * `d3.geoCentroid(d)[1]`, never `d3.geoPath().centroid(d)[1]`.
   * @default 'lat', falling back to `latitude`.
   */
  lat?: DataAccessor<number>;
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
  = | { chartType: 'alluvial'; config: D3FlowConfig }
    | { chartType: 'area'; config: D3AreaConfig }
    | { chartType: 'bar'; config: D3BarConfig }
    | { chartType: 'box'; config: D3BoxConfig }
    | { chartType: 'boxen'; config: D3BoxenConfig }
    | { chartType: 'bump'; config: D3LineConfig }
    | { chartType: 'candlestick'; config: D3CandlestickConfig }
    | { chartType: 'chord'; config: D3FlowConfig }
    | { chartType: 'choropleth'; config: D3ChoroplethConfig }
    | { chartType: 'contour'; config: D3ContourConfig }
    | { chartType: 'diverging'; config: D3SegmentedConfig }
    | { chartType: 'dot'; config: D3BarConfig }
    | { chartType: 'dumbbell'; config: D3DumbbellConfig }
    | { chartType: 'errorBar'; config: D3ErrorBarConfig }
    | { chartType: 'forest'; config: D3ForestConfig }
    | { chartType: 'funnel'; config: D3BarConfig }
    | { chartType: 'gantt'; config: D3GanttConfig }
    | { chartType: 'gauge'; config: D3GaugeConfig }
    | { chartType: 'heatmap'; config: D3HeatmapConfig }
    | { chartType: 'hexbin'; config: D3HexbinConfig }
    | { chartType: 'histogram'; config: D3HistogramConfig }
    | { chartType: 'icicle'; config: D3TreemapConfig }
    | { chartType: 'line'; config: D3LineConfig }
    | { chartType: 'lollipop'; config: D3BarConfig }
    | { chartType: 'manhattan'; config: D3ManhattanConfig }
    | { chartType: 'mosaic'; config: D3MosaicConfig }
    | { chartType: 'network'; config: D3NetworkConfig }
    | { chartType: 'parallel'; config: D3ParallelConfig }
    | { chartType: 'pie'; config: D3PieConfig }
    | { chartType: 'polarArea'; config: D3PolarAreaConfig }
    | { chartType: 'radar'; config: D3LineConfig }
    | { chartType: 'ridgeline'; config: D3RidgelineConfig }
    | { chartType: 'sankey'; config: D3FlowConfig }
    | { chartType: 'scatter'; config: D3ScatterConfig }
    | { chartType: 'segmented'; config: D3SegmentedConfig }
    | { chartType: 'smooth'; config: D3SmoothConfig }
    | { chartType: 'sunburst'; config: D3TreemapConfig }
    | { chartType: 'survival'; config: D3SurvivalConfig }
    | { chartType: 'treemap'; config: D3TreemapConfig }
    | { chartType: 'volcano'; config: D3VolcanoConfig }
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
    | BoxenPoint[]
    | BoxPoint[]
    | CandlestickPoint[]
    | DumbbellData
    | ErrorBarPoint[]
    | FlowPoint[]
    | ForestPoint[]
    | GanttData
    | GaugePoint
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | MosaicPoint[][]
    | NetworkPoint[]
    | PiePoint[]
    | ScatterPoint[]
    | SegmentedPoint[][]
    | SmoothPoint[][]
    | TreemapPoint[]
    | VolcanoPoint[]
    | WaterfallPoint[]
    | WordCloudPoint[];
