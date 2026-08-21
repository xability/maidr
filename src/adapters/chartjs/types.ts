/**
 * Minimal Chart.js type definitions for the MAIDR plugin.
 *
 * These provide type safety without requiring `chart.js` as a compile-time
 * dependency of the main MAIDR package. At runtime, the actual Chart.js
 * objects will satisfy these interfaces.
 */

import type { MaidrTraceDeclaration } from '../../type/declaration';
import type { GaugeBand, TraceType } from '../../type/grammar';

/**
 * One end of a floating bar.
 *
 * A number on a linear scale; a `Date` when the bar is drawn against a time
 * scale, which is how Chart.js's own gantt and range-bar recipes write them.
 * ISO date *strings* are also accepted by Chart.js there and are deliberately
 * not read here — parsing one means guessing a calendar for a value that may
 * equally be a category label.
 */
export type ChartJsRangeBound = number | Date;

/**
 * A point-shaped datum: a scatter or bubble point, a line vertex on a
 * continuum, one time of a survival curve.
 *
 * The three optional members after `r` are not Chart.js's. Chart.js passes
 * unknown properties on a datum through untouched, which is how a page carries
 * a fact its config has no field for — and a Kaplan-Meier curve has two of
 * those, the censoring mark and the confidence band, neither of which is a
 * position the chart draws. They are named here rather than read off an index
 * signature so this stays a statement about what the adapter looks for.
 */
export interface ChartJsPointValue {
  x: number;
  y: number;
  /** A bubble's radius: a third encoded variable. */
  r?: number;
  /** A subject left the study here without the event happening. */
  censored?: boolean;
  /** Lower bound of the confidence band at this point. */
  yMin?: number;
  /** Upper bound of the confidence band at this point. */
  yMax?: number;
  /**
   * Whatever else the author's own row carries.
   *
   * The three members above are the facts this adapter looks for under a fixed
   * name. A volcano's gene and a Manhattan's chromosome are the same kind of
   * rider, but their column is the author's to name — the co-located `maidr`
   * block says which it is — so they cannot be listed, and a datum written in
   * TypeScript would otherwise be rejected for carrying the very column the
   * declaration points at.
   */
  [column: string]: unknown;
}

/**
 * Union of data value shapes found in Chart.js datasets.
 * Covers native chart types and popular plugins (boxplot, financial, matrix).
 */
export type ChartJsDataValue
  = | number
    | null
    /**
     * A floating bar: `[start, end]` rather than a magnitude from the
     * baseline. Chart.js draws gantt lanes, range bars and waterfall steps
     * this way.
     */
    | [ChartJsRangeBound, ChartJsRangeBound]
    | ChartJsPointValue
    | { x: number | string; o: number; h: number; l: number; c: number }
    | {
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      outliers?: number[];
    }
    | { x: string | number; y: string | number; v: number }
    /**
     * A rectangle the treemap plugin laid out. It replaces the caller's
     * `tree` in `dataset.data` during `chart.update()`, so this union has to
     * admit it for the dataset to be read at all.
     */
    | ChartJsTreemapValue;

/**
 * Minimal representation of a Chart.js chart instance.
 */
export interface ChartJsChart {
  readonly canvas: HTMLCanvasElement;
  readonly data: ChartJsData;
  readonly options: ChartJsOptions;
  readonly config: { readonly type: string };
  /** Runtime scale instances keyed by scale id, laid out with pixel geometry. */
  readonly scales?: Record<string, ChartJsRuntimeScale>;
  getDatasetMeta: (datasetIndex: number) => ChartJsDatasetMeta;
  setActiveElements: (elements: ChartJsActiveElement[]) => void;
  tooltip?: {
    setActiveElements: (
      elements: ChartJsActiveElement[],
      eventPosition: { x: number; y: number },
    ) => void;
  };
  update: (mode?: string) => void;
}

/**
 * Chart.js data configuration.
 */
export interface ChartJsData {
  labels?: (string | number)[];
  datasets: ChartJsDataset[];
}

/**
 * A single dataset in a Chart.js chart.
 */
export interface ChartJsDataset {
  label?: string;
  data: ChartJsDataValue[];
  type?: string;
  stack?: string;
  /** Id of the x scale this dataset is plotted against (defaults to `'x'`). */
  xAxisID?: string;
  /** Id of the y scale this dataset is plotted against (defaults to `'y'`). */
  yAxisID?: string;
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  /**
   * Whether a line dataset joins its points. `false` draws the markers alone,
   * which is Chart.js's own way of writing a dot plot.
   */
  showLine?: boolean;
  /**
   * Step interpolation for a line dataset. `'before'` (and the legacy `true`)
   * hold the current value until the next x and jump there, `'after'` jumps at
   * the current x and holds the new value across, `'middle'` jumps midway.
   * `false` or absent draws an ordinary interpolated line.
   */
  stepped?: boolean | 'before' | 'after' | 'middle';
  /**
   * Whether a line dataset is filled to a boundary, making it an area band.
   *
   * Chart.js accepts a boundary name (`'origin'`, `'start'`, `'end'`), a
   * dataset index to fill to (absolute `2`, or relative `'+1'` / `'-1'`), the
   * bare `true` for the origin, `false` for no fill, or an object — either
   * `{ target }` naming any of the above, or `{ value }` filling to a constant
   * on the value axis. Every one of those except `false` draws a band.
   */
  fill?:
    | boolean
    | number
    | string
    | { target?: boolean | number | string; value?: number };
  /**
   * What this dataset *means*, when the drawing cannot say.
   *
   * Chart.js has no reserved slot for third-party metadata, but it passes
   * dataset properties it does not know through untouched — the same mechanism
   * a survival curve's `censored` datum rides on ({@link ChartJsPointValue}) —
   * so the co-located `maidr` block is written straight onto the dataset:
   *
   * ```js
   * datasets: [{
   *   label: 'chr1',
   *   data: [{ x: 1e6, y: 8.2, snp: 'rs1234' }],
   *   maidr: { type: 'manhattan', label: 'snp', significance: 7.3 },
   * }]
   * ```
   *
   * It wins over `plugins.maidr.traceType`, which stays the chart-wide
   * shorthand for a figure drawn as one dataset. A block whose `type` names
   * nothing, or whose keys the declared type does not accept, is reported and
   * the chart is read as if it carried none.
   */
  maidr?: MaidrTraceDeclaration;
  /**
   * The `chartjs-chart-treemap` source: an array of numbers, an array of rows,
   * or an object. After `chart.update()` the plugin has replaced `data` with
   * one {@link ChartJsTreemapValue} per drawn rectangle, so this is the
   * caller's input rather than what is read.
   */
  tree?: unknown;
  /**
   * The fields the treemap groups by, outermost first — e.g.
   * `['continent', 'country']`. Absent for a flat tree, which draws one
   * unnamed rectangle per entry.
   */
  groups?: string[];
  /** Which field of a row carries the value the rectangles are sized by. */
  key?: string;
}

/**
 * Chart.js options object.
 */
export interface ChartJsOptions {
  indexAxis?: 'x' | 'y';
  scales?: Record<string, ChartJsScale>;
  plugins?: Record<string, unknown>;
  /** Chart-wide `showLine`; a dataset's own setting wins over it. */
  showLine?: boolean;
  /**
   * How much of the circle an arc chart sweeps, in degrees. Less than the full
   * 360 is what turns a doughnut into a dial.
   */
  circumference?: number;
  /** Where the sweep starts, in degrees clockwise from the top. */
  rotation?: number;
  /** Chart-wide element defaults; a dataset's own setting wins over these. */
  elements?: {
    line?: {
      stepped?: ChartJsDataset['stepped'];
      fill?: ChartJsDataset['fill'];
    };
  };
}

/**
 * A Chart.js scale (axis) configuration.
 */
export interface ChartJsScale {
  title?: { text?: string; display?: boolean };
  type?: string;
  stacked?: boolean;
  /**
   * Whether the scale runs the other way (largest value at the origin end).
   * A rank axis is the case that matters here: a bump chart reverses y so
   * rank 1 sits at the top.
   *
   * Chart.js resolves a controller's own default back into `chart.options`,
   * so this is populated even when the author never wrote it — which is how
   * a matrix chart's y scale reads `true` off an otherwise bare config.
   */
  reverse?: boolean;
  /**
   * A category scale's domain, in the order it is drawn along the axis
   * (before {@link ChartJsScale.reverse} is applied).
   */
  labels?: (string | number)[];
  /** Time-scale options; `unit` names what one step of the axis measures. */
  time?: { unit?: string };
  /** Which axis this scale belongs to; defaults from the scale id's first letter. */
  axis?: 'x' | 'y';
  /**
   * Which chart edge the scale is placed against. Chart.js also accepts
   * dynamic positions (`'center'` or an `{ [scaleId]: value }` object), hence
   * the loose type; only the static edge strings participate in axis stacking.
   */
  position?: string | Record<string, number>;
  /**
   * Axis-stacking group name (Chart.js >= 3.7). Scales of the same axis kind
   * sharing a `stack` are laid out in separate, non-overlapping bands — the
   * native Chart.js way to express stacked panels within one canvas.
   */
  stack?: string;
  /** Relative size of this scale's band within its axis stack. */
  stackWeight?: number;
}

/**
 * A laid-out runtime scale instance (from `chart.scales`), exposing the pixel
 * band it occupies. Used to order axis-stacked panels by visual position.
 */
export interface ChartJsRuntimeScale {
  axis?: 'x' | 'y' | 'r';
  /** Resolved edge the scale was laid out against. */
  position?: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * One drawn rectangle of a `chartjs-chart-treemap` dataset.
 *
 * The plugin replaces `dataset.data` with these during `chart.update()`, one
 * per rectangle it laid out — measured on `chartjs-chart-treemap@4.2.0`, they
 * are the identical objects each element's `$context.raw` points at, so the
 * dataset is read directly and no element walk is needed.
 *
 * The layout reorders: a two-row source listing France then Japan comes back
 * Japan first, largest rectangle first. That is the order the chart draws in
 * and so the order the nodes are emitted in.
 *
 * A **flat** tree carries only `v`, `s` and a numeric `_data`: no `g`, no `l`,
 * no `isLeaf`. Those three fields arrive together, once `groups` is declared.
 */
export interface ChartJsTreemapValue {
  /** The rectangle, in pixels. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** The node's magnitude: a leaf's own value, or a group's sum. */
  v: number;
  /** The value the layout sized by, which `sumKeys` can separate from `v`. */
  s?: number;
  /** Its depth, 0 at the outermost declared group. */
  l?: number;
  /** Its name at that level — the value of `groups[l]` on its rows. */
  g?: string;
  /** Its parent group's sum. */
  gs?: number;
  /**
   * Whether it sits at the **deepest declared group**, which is not the same
   * as having no children in the source: measured with `groups: ['continent']`
   * over rows that also carry a country, `Asia` comes back `isLeaf: true` with
   * two children. It says where the drawn hierarchy stops.
   */
  isLeaf?: boolean;
  /**
   * The plugin's own record for the node. For a grouped tree it is an object
   * whose `children` are the source rows that fell under it; for a flat tree
   * it is the source number itself.
   */
  _data?: unknown;
}

/**
 * Metadata for a dataset (returned by `chart.getDatasetMeta()`).
 */
export interface ChartJsDatasetMeta {
  data: ChartJsMetaElement[];
  type: string;
  /**
   * What Chart.js parsed each of the dataset's values into.
   *
   * The distribution controllers are the ones that need it. A boxplot or a
   * violin accepts either a raw array of samples or a pre-computed summary,
   * and only this is the same shape for both -- the plugin does the
   * quartile and density work here, so reading `dataset.data` sees the raw
   * samples of the first form and nothing usable (#1049).
   */
  _parsed?: ChartJsParsedValue[];
}

/**
 * One sample of a violin's kernel density estimate, as the boxplot plugin
 * computes it: the value on the measured axis and the density there.
 */
export interface ChartJsKdeCoord {
  v: number;
  estimate: number;
}

/**
 * What Chart.js parsed one dataset value into.
 *
 * Every field is optional because the controllers disagree about which they
 * produce: a plain bar parses to `{x, y}`, while the boxplot plugin adds the
 * five-number summary and a violin adds `coords` on top of it.
 *
 * `min`/`max` are the **data** extremes and `whiskerMin`/`whiskerMax` the ends
 * the chart draws its whiskers to; on a sample with an outlier the two differ,
 * and it is the whiskers a box plot shows (#1049).
 */
export interface ChartJsParsedValue {
  x?: number;
  y?: number;
  min?: number;
  max?: number;
  q1?: number;
  median?: number;
  q3?: number;
  mean?: number;
  whiskerMin?: number;
  whiskerMax?: number;
  outliers?: number[];
  items?: number[];
  /** A violin's density curve; absent on a boxplot. */
  coords?: ChartJsKdeCoord[];
}

/**
 * A visual element from dataset metadata, providing pixel coordinates.
 */
export interface ChartJsMetaElement {
  x: number;
  y: number;
}

/**
 * Identifies a specific data element in a Chart.js chart.
 */
export interface ChartJsActiveElement {
  datasetIndex: number;
  index: number;
}

/**
 * Chart.js Plugin interface (subset used by MAIDR).
 */
export interface ChartJsPlugin {
  id: string;
  afterInit?: (chart: ChartJsChart, args: unknown, options: unknown) => void;
  afterUpdate?: (chart: ChartJsChart, args: unknown, options: unknown) => void;
  resize?: (
    chart: ChartJsChart,
    args: { size: { width: number; height: number } },
    options: unknown,
  ) => void;
  beforeDestroy?: (chart: ChartJsChart, args: unknown, options: unknown) => void;
}

/**
 * Per-chart options for the MAIDR plugin, configurable via
 * `options.plugins.maidr` in the Chart.js config.
 */
export interface MaidrPluginOptions {
  /** Set to `false` to disable the MAIDR plugin for a specific chart. */
  enabled?: boolean;
  /** Override the auto-detected chart title. */
  title?: string;
  /** Override axis labels. */
  axes?: { x?: string; y?: string; z?: string };
  /**
   * What the chart actually is, when Chart.js cannot say.
   *
   * Several figures are drawn in Chart.js as a recipe rather than as a type of
   * their own, and a few of those are shape-identical to another recipe: a
   * Kaplan-Meier curve is a stepped line, a dumbbell is a horizontal floating
   * bar exactly as a one-interval gantt is, and a gauge is a part-circle
   * doughnut exactly as a half-pie is. Where the values cannot settle it — see
   * the value heuristics in the extractor for the cases where they can — this
   * is the author saying so, and it wins over every heuristic.
   */
  traceType?: TraceType;
  /**
   * What one unit of a gantt chart's interval axis measures — "days",
   * "sprints", "hours".
   *
   * The length of an interval is the fact a schedule is drawn to carry, and
   * Chart.js states the unit nowhere: a linear axis is bare numbers, and a
   * time axis is parsed to epoch milliseconds whatever `time.unit` displays.
   * Absent, MAIDR announces a length without naming a unit rather than
   * inventing one.
   */
  unit?: string;
  /**
   * What a dumbbell's two ends are called — "1990" and "2020", "before" and
   * "after".
   *
   * A dumbbell drawn as a floating bar carries one datum per row and no name
   * for either end, so without these a reader is told which dot they are on
   * ("start", "end") but not which year it is — the one thing the legend gives
   * a sighted reader for free.
   */
  startLabel?: string;
  endLabel?: string;
  /**
   * The target a bullet chart's marker sits at, and the qualitative bands its
   * arc is coloured in.
   *
   * A doughnut gauge draws neither: the target is a second arc or a needle and
   * the bands are background colours, and Chart.js records both as styling
   * rather than as data. They are part of the reading — "7 below target, in
   * the 'ok' band" — so the author supplies them here or they go unannounced.
   */
  target?: number;
  bands?: GaugeBand[];
  /**
   * Outline color used for the DOM highlight overlay drawn on top of the
   * canvas during MAIDR navigation. Accepts any CSS color string.
   * Defaults to a translucent orange.
   */
  highlightColor?: string;
}
