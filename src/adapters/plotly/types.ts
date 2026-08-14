/**
 * Shared Plotly.js internal types used across adapter modules.
 */

/** Plotly graph-div element with internal properties. */
export interface PlotlyGraphDiv extends HTMLElement {
  data?: PlotlyTrace[];
  layout?: PlotlyLayout;
  _fullData?: PlotlyTrace[];
  _fullLayout?: PlotlyFullLayout;
  calcdata?: PlotlyCalcData[][];
}

export interface PlotlyTrace {
  type?: string;
  mode?: string;
  name?: string;
  uid?: string;
  visible?: boolean | 'legendonly';
  /**
   * Line styling. `shape` is how plotly joins consecutive samples: `linear`
   * and `spline` interpolate, while `hv`, `vh`, `hvh` and `vhv` draw a
   * piecewise-constant staircase.
   */
  line?: { shape?: string };
  /**
   * What the trace fills towards: `tozeroy`, `tonexty`, `toself`, … Plotly
   * resolves an unfilled trace to the string `'none'` rather than dropping
   * the attribute, so a filled trace is any other non-empty value.
   */
  fill?: string;
  /**
   * The stack this trace belongs to. Plotly stacks scatter traces that name
   * the same group, drawing them as an area chart whose bands sit on one
   * another; an empty or absent value means the trace stands alone.
   */
  stackgroup?: string;
  /**
   * How a stack group is rescaled: `percent` makes each column sum to 100,
   * `fraction` to 1. Empty or absent leaves the bands at their own totals.
   */
  groupnorm?: string;
  x?: (number | string)[];
  y?: (number | string)[];
  z?: number[][];
  xaxis?: string;
  yaxis?: string;
  orientation?: 'v' | 'h';
  /** Value-axis offset every bar-like size is measured from. */
  base?: number;
  // Waterfall-specific
  /**
   * What each step does to the running total: `relative` contributes,
   * `total` restates it, `absolute` resets it. Parallel to the position
   * array, and `relative` where it says nothing.
   */
  measure?: string[];
  // Error bars, which any scatter or bar trace may carry
  error_x?: PlotlyErrorBar;
  error_y?: PlotlyErrorBar;
  // Box-specific
  q1?: number[];
  median?: number[];
  q3?: number[];
  lowerfence?: number[];
  upperfence?: number[];
  mean?: number[];
  // Violin-specific
  /** Inner box overlay. Plotly draws `path.box` only when `visible` is true. */
  box?: { visible?: boolean };
  /** Mean line overlay drawn across the violin. */
  meanline?: { visible?: boolean };
  // Candlestick-specific
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  // Histogram-specific
  xbins?: { start?: number; end?: number; size?: number };
  // Pie-specific, and shared with the hierarchy traces below, which name and
  // size their sectors through the same two arrays.
  /** Slice labels, in the order the trace was authored. */
  labels?: (number | string)[];
  /** Slice magnitudes, parallel to {@link labels}. */
  values?: (number | string)[];
  // Hierarchy traces (sunburst, icicle, treemap)
  /**
   * Each sector's parent, parallel to {@link labels}. An empty string means
   * the sector sits at the root. Plotly matches these against `ids` when a
   * trace has them and against `labels` otherwise.
   */
  parents?: (number | string)[];
  /** Sector ids, for a hierarchy whose labels repeat. Parallel to {@link labels}. */
  ids?: (number | string)[];
  // Sankey-specific
  /** The nodes the flows run between. */
  node?: { label?: (number | string)[]; groups?: number[][] };
  /**
   * The flows themselves, held as three parallel arrays. `source` and
   * `target` are INDICES into {@link node}'s labels rather than the names a
   * MAIDR flow carries.
   */
  link?: { source?: number[]; target?: number[]; value?: number[] };
  // Indicator-specific (gauge and bullet charts)
  /** The measure a gauge draws. */
  value?: number;
  /** What the measure is called. Only the indicator traces carry one. */
  title?: { text?: string } | string;
  /** The dial. Present only when `mode` includes `gauge`. */
  gauge?: PlotlyGauge;
  /** The comparison an indicator draws its delta against. */
  delta?: { reference?: number };
  // Polar-specific (scatterpolar, barpolar)
  /**
   * Which polar subplot the trace is drawn on (`polar`, `polar2`, …). Polar
   * traces carry this instead of an `xaxis`/`yaxis` pair.
   */
  subplot?: string;
  /** Radial coordinates — the magnitude on each spoke. */
  r?: (number | string)[];
  /** Angular coordinates — which spoke each value sits on. */
  theta?: (number | string)[];
  // Parallel-coordinates-specific
  /**
   * One entry per axis, each carrying the whole column of observations.
   * Plotly stores the transpose of the row-per-observation grid MAIDR reads.
   */
  dimensions?: PlotlyDimension[];
  /**
   * Whether plotly reorders the slices largest-first before drawing them.
   * Defaults to true, so the authored order is NOT the drawn order unless a
   * trace turns this off.
   */
  sort?: boolean;
  /**
   * Fraction of the paper the trace occupies, `[start, end]` in [0, 1] on each
   * side. A pie is positioned by this rather than by axes, so it is the only
   * thing that says where one sits relative to its siblings.
   */
  domain?: { x?: [number, number]; y?: [number, number] };
  // Heatmap colorbar
  colorbar?: { title?: { text?: string } | string };
}

/**
 * The dial an indicator trace draws, as plotly resolves it.
 *
 * Only present when the trace's `mode` includes `gauge`; a `number`-only
 * indicator is a text tile with no dial and no container here.
 */
export interface PlotlyGauge {
  /** `angular` (the default dial) or `bullet` (a horizontal bar). */
  shape?: 'angular' | 'bullet';
  /** The dial's ends, on `axis.range`. */
  axis?: { range?: [number, number] };
  /**
   * The coloured arcs behind the bar. Plotly resolves `range` and `color` for
   * every step; `name` only when the author wrote one.
   */
  steps?: { range?: [number, number]; name?: string }[];
  /**
   * The target line. Plotly resolves `value` to the boolean `false` when the
   * author set none, which is why it is not simply coerced to a number.
   */
  threshold?: { value?: number | false };
}

/**
 * One series of a polar layer, together with where its trace sits among the
 * subplot's traces of that kind — which is what a selector counts by.
 */
export interface PolarSeries {
  trace: PlotlyTrace;
  position: number;
}

/** One axis of a parallel-coordinates trace, with its whole column of values. */
export interface PlotlyDimension {
  label?: string;
  values?: (number | string)[];
  /** False for an axis the author hid, which plotly then does not draw. */
  visible?: boolean;
}

/**
 * One node of a drawn sankey, as its calcdata holds it.
 *
 * `pointNumber` is the node's index in the trace's own `node.label` array;
 * `label` is the name plotly resolved for it.
 */
export interface PlotlySankeyNode {
  pointNumber?: number;
  label?: number | string;
}

/**
 * One flow of a drawn sankey.
 *
 * The ends start out as indices, exactly as the trace authored them, and the
 * layout pass REPLACES them with the node objects themselves — so a link read
 * off a rendered chart carries objects and one read before layout carries
 * numbers. Both are admitted here because both are reachable.
 */
export interface PlotlySankeyLink {
  source?: number | PlotlySankeyNode;
  target?: number | PlotlySankeyNode;
  value?: number;
}

/**
 * One node of the tree a hierarchy trace was drawn from, as plotly's calc
 * leaves it on the first calcdata entry.
 *
 * `data.data` is the calc entry for the sector — the double hop is d3's: the
 * hierarchy wraps the stratified node, which wraps what plotly computed.
 */
export interface PlotlyHierarchyNode {
  children?: PlotlyHierarchyNode[];
  parent?: PlotlyHierarchyNode | null;
  /** The magnitude d3 resolved, which is the one the sector was drawn at. */
  value?: number;
  data?: { data?: PlotlySector };
}

/** What plotly computed for one sector of a hierarchy trace. */
export interface PlotlySector {
  /** Index into the trace's own arrays; absent on a root plotly synthesised. */
  i?: number;
  label?: string;
  /** Set on the stand-in root plotly adds when several sectors claim the top. */
  hasMultipleRoots?: boolean;
}

/**
 * The interval drawn around each sample on one axis.
 *
 * Plotly resolves `visible` for every trace that could carry error bars, so a
 * trace without them has `visible: false` rather than no container at all —
 * which is what makes the flag the reliable test. The magnitudes below are
 * what `type` selects between; plotly turns them into absolute bounds during
 * calc, and they are only read here when it has not.
 */
export interface PlotlyErrorBar {
  visible?: boolean;
  type?: 'data' | 'percent' | 'constant' | 'sqrt';
  /** False when the two sides are given separately. */
  symmetric?: boolean;
  /** Per-sample magnitudes, for `type: 'data'`. */
  array?: number[];
  /** Per-sample magnitudes below the estimate, when not symmetric. */
  arrayminus?: number[];
  /** Single magnitude, for `percent` and `constant`. */
  value?: number;
  /** Single magnitude below the estimate, when not symmetric. */
  valueminus?: number;
}

export interface PlotlyLayout {
  title?: { text?: string } | string;
  xaxis?: PlotlyAxis;
  yaxis?: PlotlyAxis;
  grid?: {
    rows?: number;
    columns?: number;
    pattern?: string;
    roworder?: string;
  };
  annotations?: PlotlyAnnotation[];
  [key: string]: unknown;
}

/**
 * A layout annotation. plotly.py (Plotly Express facets, `make_subplots`
 * row/column/subplot titles) emits facet labels (e.g. "sex=Male") as
 * annotations with `xref: 'paper'` / `yref: 'paper'` positioned via paper
 * coordinates; hand-authored charts may instead use axis-domain references
 * such as `'x2 domain'`. Both shapes are recognised by the extractor.
 */
export interface PlotlyAnnotation {
  text?: string;
  xref?: string;
  yref?: string;
  x?: number | string;
  y?: number | string;
  showarrow?: boolean;
  textangle?: number | string;
}

export interface PlotlyFullLayout extends PlotlyLayout {
  barmode?: string;
  barnorm?: string;
  /**
   * The placeholder titles Plotly resolves an *absent* title to. Plotly's own
   * title renderer compares against this container to decide that a title is
   * a placeholder, and only draws it in editable mode.
   */
  _dfltTitle?: PlotlyDfltTitle;
  [key: string]: unknown;
}

/**
 * Plotly's placeholder title strings, one per title slot. Populated by
 * plotly.js through its localisation dictionary, so the values are translated
 * on a chart configured with a non-English locale.
 *
 * The slots below are the ones plotly.js 3.1.1 fills. The index signature
 * carries the rest: a version that adds a slot should have it recognised as a
 * placeholder rather than announced, and without it `Object.entries` widens
 * each value to `any`.
 */
export interface PlotlyDfltTitle {
  plot?: string;
  subtitle?: string;
  x?: string;
  y?: string;
  colorbar?: string;
  annotation?: string;
  [key: string]: string | undefined;
}

export interface PlotlyAxis {
  title?: { text?: string } | string;
  range?: [number, number];
  dtick?: number | string;
  tick0?: number | string;
  tickmode?: 'auto' | 'linear' | 'array';
  tickvals?: number[];
  type?: string;
  categories?: string[];
  /** Fraction of the plot area this axis spans: `[start, end]` in [0, 1]. */
  domain?: [number, number];
  /** The axis this one is anchored to (e.g. `'y2'`). */
  anchor?: string;
  /** Axis id whose range this axis mirrors (facet-style shared axes). */
  matches?: string;
  /** Computed pixel offset of the axis within the SVG (plotly internal). */
  _offset?: number;
  /** Computed pixel length of the axis within the SVG (plotly internal). */
  _length?: number;
  /** Category labels in axis order, indexed by a categorical coordinate. */
  _categories?: (number | string)[];
  /**
   * Converts a data coordinate to a pixel position within the plot area
   * (plotly internal, available once the chart has been drawn).
   */
  c2p?: (value: number) => number;
}

export interface PlotlyCalcData {
  x?: number;
  y?: number;
  p?: number | string; // position (bar, box)
  s?: number; // size/value (bar); running total after the step (waterfall)
  s0?: number;
  s1?: number;
  /**
   * Index into the trace's own arrays, and `null` for a sample plotly
   * inserted rather than the author writing it — the positions a stacked
   * scatter borrows from the other traces in its stack.
   */
  i?: number | null;
  // Stacked scatter (area)
  /** This band's own size after `groupnorm` rescaled the stack. */
  sNorm?: number;
  // Waterfall calc data
  /** The step's authored contribution, before it was accumulated. */
  rawS?: number;
  /** Whether the step restates the running total rather than changing it. */
  isSum?: boolean;
  /** Base the bar is measured from, set while plotly positions the group. */
  b?: number;
  // Error bars: the bounds plotly resolved per sample, on each axis
  xs?: number;
  xh?: number;
  ys?: number;
  yh?: number;
  // Box calc data
  pos?: number | string;
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
  med?: number;
  mean?: number;
  lf?: number; // lower fence
  uf?: number; // upper fence
  lo?: number; // lower outlier threshold
  uo?: number; // upper outlier threshold
  pts?: PlotlyCalcPoint[];
  pts2?: PlotlyCalcPoint[];
  // Violin calc data
  /** KDE samples: `t` is the value-axis coordinate, `v` the density there. */
  density?: PlotlyDensitySample[];
  /** Pixel centre of this violin on the position axis, set when plotly draws it. */
  posCenterPx?: number;
  /** Per-trace calc metadata; plotly stores it on the first entry of a trace. */
  t?: PlotlyCalcMeta;
  // Pie calc data
  /**
   * Slice magnitude, after plotly dropped the values it would not draw. A
   * waterfall keeps the running total the step produced here instead.
   */
  v?: number;
  /** Slice label. */
  label?: number | string;
  // Hierarchy traces: plotly stashes the whole tree on the first entry
  /** The stratified, sorted tree the sectors were drawn from. */
  hierarchy?: PlotlyHierarchyNode;
  // Sankey: plotly stashes the whole graph on the first entry
  /** The flows plotly kept, in the order it drew the ribbons. */
  _links?: PlotlySankeyLink[];
  // Polar
  /** Radial coordinate (scatterpolar). */
  r?: number;
  /** Angular coordinate (scatterpolar). */
  theta?: number | string;
  // Heatmap
  z?: number[][];
  trace?: PlotlyTrace;
  [key: string]: unknown;
}

/**
 * One polar subplot's layout. Polar traces name theirs on `trace.subplot`,
 * and it is what says where the subplot sits on the paper — polar has no
 * axis pair with a domain to read one from.
 */
export interface PlotlyPolarLayout {
  domain?: { x?: [number, number]; y?: [number, number] };
  radialaxis?: PlotlyAxis;
  angularaxis?: PlotlyAxis;
}

export interface PlotlyDensitySample {
  /** Density at this position. */
  v: number;
  /** Value-axis coordinate of the sample. */
  t: number;
}

export interface PlotlyCalcMeta {
  /** Offset from the position-axis centre, non-zero for grouped box/violin traces. */
  bPos?: number;
}

export interface PlotlyCalcPoint {
  v?: number;
  x?: number;
  y?: number;
  i?: number;
}
