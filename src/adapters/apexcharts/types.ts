/**
 * Minimal structural types for the ApexCharts objects the MAIDR adapter reads.
 *
 * These describe the subset of an ApexCharts 7 chart instance the adapter
 * needs — the normalised values in `w.globals`, the resolved options in
 * `w.config`, the untouched options in `opts`, the user's container in `el`
 * and the event API. Users provide the actual ApexCharts library; MAIDR does
 * not depend on it and never imports it.
 *
 * Every field is optional where ApexCharts leaves it unset for some chart
 * types, so the adapter has to narrow before it reads.
 */

import type { Maidr } from '../../type/grammar';

/**
 * A category label as ApexCharts stores it: a string, a number (an index or
 * a timestamp), or an array for a multi-line label.
 */
export type ApexLabel = string | number | (string | number)[] | null | undefined;

/**
 * A single value as ApexCharts normalises it into `w.globals.series`.
 * `null` is a point the chart has no value for.
 */
export type ApexValue = number | null | undefined;

/**
 * A series as it appears in `w.globals.initialSeries`, `w.config.series` and
 * `chart.opts.series`.
 */
export interface ApexSeriesOption {
  /** The series name, as the legend shows it. */
  name?: string;
  /** Per-series chart type in a combo chart, e.g. `'column'` or `'line'`. */
  type?: string;
  /** The stack a bar series joins, in a stacked chart with several stacks. */
  group?: string;
  /** The data as the author wrote it, in any of ApexCharts' point formats. */
  data?: unknown;
}

/**
 * A series ApexCharts has hidden through its legend, as recorded in
 * `w.globals.collapsedSeries`.
 */
export interface ApexCollapsedSeries {
  /** Index of the series in `w.config.series`. */
  index: number;
  /** The series' name. */
  name?: string;
  /** The series' type. */
  type?: string;
}

/**
 * The normalised chart state ApexCharts keeps in `w.globals`.
 *
 * This is the honest record of what was drawn: every point format the author
 * may have used is normalised here, and series ApexCharts silently dropped
 * (mixed point formats, for one) show up as empty arrays.
 */
export interface ApexGlobals {
  /** The chart's id, as used in the wrapper's `apexcharts<chartID>` id. */
  chartID: string;
  /**
   * Values per series and point (`[series][point]`). Flat for pie, donut,
   * polar area and radial bar charts, where each slice is a value.
   */
  series: ApexValue[][] | ApexValue[];
  /** X values per series and point, for numeric and datetime x axes. */
  seriesX?: (number | string)[][];
  /** Bubble sizes per series and point. */
  seriesZ?: ApexValue[][];
  /** Series names, in `w.config.series` order. */
  seriesNames?: string[];
  /** Category labels, or slice labels for pie-like charts. */
  labels?: ApexLabel[];
  /** Category labels for line and area charts on a category axis. */
  categoryLabels?: ApexLabel[];
  /** Whether the x axis is numeric (true for line charts on categories too). */
  isXNumeric?: boolean;
  /** Whether bars (and box plots, range bars) are drawn horizontally. */
  isBarHorizontal?: boolean;
  /** Whether series of different types share the chart. */
  comboCharts?: boolean;
  /** Candlestick open, or box plot minimum. */
  seriesCandleO?: ApexValue[][];
  /** Candlestick high, or box plot first quartile. */
  seriesCandleH?: ApexValue[][];
  /** Box plot median. */
  seriesCandleM?: ApexValue[][];
  /** Candlestick low, or box plot third quartile. */
  seriesCandleL?: ApexValue[][];
  /** Candlestick close, or box plot maximum. */
  seriesCandleC?: ApexValue[][];
  /** Range bar starts per series and point. */
  seriesRangeStart?: ApexValue[][];
  /** Range bar ends per series and point. */
  seriesRangeEnd?: ApexValue[][];
  /** The series as first rendered; survives a legend collapse. */
  initialSeries?: ApexSeriesOption[];
  /** Series hidden through the legend. */
  collapsedSeries?: ApexCollapsedSeries[];
  /** Indices of the series hidden through the legend. */
  collapsedSeriesIndices?: number[];
  /** The y axis each series is drawn against, by series index. */
  seriesYAxisReverseMap?: number[];
  /** Whether the entry animation (or the last update's) has finished. */
  animationEnded?: boolean;
  /** Set once `chart.destroy()` has run. */
  isDestroyed?: boolean;
  /** DOM references ApexCharts keeps for the chart (older location). */
  dom?: ApexDom;
}

/**
 * The DOM references ApexCharts keeps for a chart.
 */
export interface ApexDom {
  /** The `div.apexcharts-canvas` wrapper, id `apexcharts<chartID>`. */
  elWrap?: Element | null;
}

/**
 * The title-like options, as `{ text }`.
 */
export interface ApexTextOption {
  /** The text, when one is set. */
  text?: string;
}

/**
 * An axis' options, as far as the adapter reads them.
 */
export interface ApexAxisOption {
  /** The axis title. */
  title?: ApexTextOption;
  /** `'category'`, `'numeric'` or `'datetime'` (x axis only). */
  type?: string;
  /** Whether the axis runs backwards (y axis). */
  reversed?: boolean;
  /** The labels' options. */
  labels?: {
    /** Whether datetime labels are shown in UTC (ApexCharts' default). */
    datetimeUTC?: boolean;
  };
}

/**
 * The resolved chart options in `w.config`, as far as the adapter reads them.
 *
 * ApexCharts mutates these while drawing — `xaxis.categories` is emptied on a
 * line chart and a collapsed series loses its data — so values are read from
 * {@link ApexGlobals} and only settings are read from here.
 */
export interface ApexConfig {
  /** Chart-wide settings. */
  chart: {
    /** The default series type. */
    type?: string;
    /** Whether bars or areas are stacked. */
    stacked?: boolean;
    /** `'normal'` or `'100%'`. */
    stackType?: string;
    /** The chart's width: a number of pixels, or a string such as `'100%'`. */
    width?: string | number;
    /** Animation settings. */
    animations?: {
      enabled?: boolean;
      speed?: number;
      dynamicAnimation?: { enabled?: boolean; speed?: number };
    };
    /** ApexCharts 7's own accessibility layer. */
    accessibility?: {
      enabled?: boolean;
      keyboard?: {
        enabled?: boolean;
        navigation?: { enabled?: boolean };
      };
    };
  };
  /** The series, possibly mutated by ApexCharts. */
  series: ApexSeriesOption[];
  /** The chart title. */
  title?: ApexTextOption;
  /** The chart subtitle. */
  subtitle?: ApexTextOption;
  /** The x axis. */
  xaxis?: ApexAxisOption;
  /** The y axes; ApexCharts always normalises this to an array. */
  yaxis?: ApexAxisOption[] | ApexAxisOption;
  /** Line and area stroke settings. */
  stroke?: {
    /** `'straight'`, `'smooth'`, `'stepline'`, `'linestep'` or `'monotoneCubic'`, or one per series. */
    curve?: string | string[];
    /** Whether strokes are drawn at all. */
    show?: boolean;
  };
  /** Marker settings for line, area and radar charts. */
  markers?: {
    /** Marker size, or one per series. `0` means no per-point markers. */
    size?: number | number[];
  };
  /** Per-type drawing options. */
  plotOptions?: {
    bar?: {
      horizontal?: boolean;
      isFunnel?: boolean;
    };
    pie?: {
      startAngle?: number;
      endAngle?: number;
    };
  };
}

/**
 * The chart state ApexCharts exposes on `chart.w`.
 */
export interface ApexW {
  /** Normalised values and flags. */
  globals: ApexGlobals;
  /** Resolved options. */
  config: ApexConfig;
  /** DOM references (ApexCharts 7 location). */
  dom?: ApexDom;
}

/**
 * The options exactly as the author passed them to `new ApexCharts()`.
 */
export interface ApexOptions {
  /** The series as written; treemap leaf names are read from here. */
  series?: ApexSeriesOption[] | (number | null)[];
}

/**
 * An event handler registered with {@link ApexChartsInstance.addEventListener}.
 */
export type ApexEventHandler = (...args: unknown[]) => void;

/**
 * The part of an ApexCharts chart instance the adapter reads.
 *
 * Pass the object `new ApexCharts(el, options)` returned. The adapter needs
 * the instance itself: ApexCharts keeps no reference from the element back
 * to its chart, and registers only charts that set `chart.id`.
 */
export interface ApexChartsInstance {
  /** The container element the chart was created on. */
  el: Element;
  /** The chart's state. */
  w: ApexW;
  /** The options as the author passed them. */
  opts?: ApexOptions;
  /** Subscribes to a chart event such as `'mounted'` or `'updated'`. */
  addEventListener?: (name: string, handler: ApexEventHandler) => void;
  /** Removes a handler added with {@link addEventListener}. */
  removeEventListener?: (name: string, handler: ApexEventHandler) => void;
  /**
   * What ApexCharts runs when the element it watches for size changes — the
   * container's parent at `render()` time — resizes: it redraws a chart
   * whose container width changed, once any running animation is over, and
   * does nothing otherwise. Not part of ApexCharts' documented API.
   */
  parentResizeHandler?: () => void;
}

/**
 * Options for customizing the {@link apexchartsToMaidr} output.
 *
 * Each overrides what the chart's own configuration says.
 */
export interface ApexChartsAdapterOptions {
  /** The MAIDR figure id. Defaults to `maidr-apexcharts-<chartID>`. */
  id?: string;
  /** The chart title. Defaults to `title.text`. */
  title?: string;
  /** The chart subtitle. Defaults to `subtitle.text`. */
  subtitle?: string;
  /** A caption read after the title. The chart has no default. */
  caption?: string;
  /**
   * Axis labels. Default to `xaxis.title.text` and the `title.text` of the
   * y axis each layer's series are drawn against (`yaxis[0]` by default).
   * ApexCharts draws each title where its axis is drawn, so on a horizontal
   * bar chart `x` is the value axis along the bottom.
   */
  axes?: {
    x?: string;
    y?: string;
    z?: string;
  };
}

/**
 * The handle {@link bindApexCharts} returns.
 */
export interface ApexChartsBinding {
  /**
   * Resolves with the MAIDR data once the chart has finished drawing and
   * MAIDR has been bound to it for the first time. The data is marked
   * `live: true`. Rejects when the chart could not be converted, or when
   * `dispose()` is called before that first binding. For a chart that is
   * never rendered it stays pending, with a console warning once the time
   * the chart had to draw has passed; it resolves if the chart is rendered
   * later.
   */
  ready: Promise<Maidr>;
  /**
   * Stops following the chart and takes MAIDR off it: removes the event
   * listeners, cancels a pending rebind, puts back the container width the
   * binding was setting, and, once MAIDR has been mounted, removes the
   * `maidr-data` attribute and dispatches `maidr:unbindchart` so the mounted
   * instance is torn down -- as the ECharts adapter's cleanup does. Call it
   * before `chart.destroy()` when a page removes the chart.
   */
  dispose: () => void;
}
