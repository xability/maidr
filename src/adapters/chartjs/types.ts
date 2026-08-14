/**
 * Minimal Chart.js type definitions for the MAIDR plugin.
 *
 * These provide type safety without requiring `chart.js` as a compile-time
 * dependency of the main MAIDR package. At runtime, the actual Chart.js
 * objects will satisfy these interfaces.
 */

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
    | { x: string | number; y: string | number; v: number };

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
   */
  reverse?: boolean;
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
 * Metadata for a dataset (returned by `chart.getDatasetMeta()`).
 */
export interface ChartJsDatasetMeta {
  data: ChartJsMetaElement[];
  type: string;
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
