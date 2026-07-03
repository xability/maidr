/**
 * Minimal type definitions for Highcharts objects used by the MAIDR adapter.
 *
 * These types represent the subset of the Highcharts API needed for data
 * extraction and visual synchronization. Users provide the actual Highcharts
 * library; MAIDR does not depend on it directly.
 */

/**
 * Options for customizing the {@link highchartsToMaidr} adapter output.
 */
export interface HighchartsAdapterOptions {
  /** Override the generated chart ID. Defaults to `highcharts-{n}`. */
  id?: string;
  /** Override the chart title. Defaults to `chart.title.textStr`. */
  title?: string;
  /** Convert only specific series by index. Default: all visible series. */
  seriesIndices?: number[];
}

/**
 * Options for customizing the {@link highchartsGridToMaidr} adapter output.
 */
export interface HighchartsGridOptions {
  /** Override the generated figure ID. Defaults to `highcharts-grid-{n}`. */
  id?: string;
  /** Figure-level title announced for the whole grid. */
  title?: string;
  /** Figure-level subtitle. */
  subtitle?: string;
  /** Figure-level caption. */
  caption?: string;
  /**
   * Chunks a flat chart list into a grid. Ignored when a 2D chart array is
   * passed (2D input maps 1:1 to the subplot grid). When omitted, a flat
   * list becomes a single row.
   */
  layout?: {
    /** Number of grid rows (columns are derived when only rows is set). */
    rows?: number;
    /** Number of charts per row. Takes precedence over `rows`. */
    columns?: number;
  };
}

/**
 * Represents a Highcharts chart instance.
 * Passed to {@link highchartsToMaidr} to generate MAIDR-compatible data.
 */
export interface HighchartsChart {
  series: HighchartsSeries[];
  xAxis: HighchartsAxis[];
  yAxis: HighchartsAxis[];
  title: { textStr?: string };
  subtitle?: { textStr?: string };
  caption?: { textStr?: string };
  /** The `.highcharts-container` element created by Highcharts. */
  container: HTMLElement;
  /** The user-provided render target element. */
  renderTo: HTMLElement;
  options: {
    chart?: { type?: string; inverted?: boolean };
    plotOptions?: {
      series?: { stacking?: string };
      column?: { stacking?: string };
      bar?: { stacking?: string };
    };
  };
  tooltip?: {
    refresh: (point: HighchartsPoint | HighchartsPoint[]) => void;
    hide: () => void;
  };
}

/**
 * Represents a single data series within a Highcharts chart.
 */
export interface HighchartsSeries {
  type: string;
  name: string;
  data: HighchartsPoint[];
  xAxis: HighchartsAxis;
  yAxis: HighchartsAxis;
  index: number;
  visible: boolean;
  options: {
    type?: string;
    stacking?: string;
    /** Set by Highcharts on internal series (e.g. the Highstock navigator). */
    isInternal?: boolean;
    /** User- or Highcharts-assigned class name (e.g. `highcharts-navigator-series`). */
    className?: string;
  };
}

/**
 * Represents an individual data point within a Highcharts series.
 */
export interface HighchartsPoint {
  x: number;
  y: number | null;
  category?: string;
  name?: string;
  /** Boxplot / candlestick high value. */
  high?: number;
  /** Boxplot / candlestick low value. */
  low?: number;
  /** Boxplot first quartile. */
  q1?: number;
  /** Boxplot third quartile. */
  q3?: number;
  /** Boxplot median. */
  median?: number;
  /** Candlestick open value. */
  open?: number;
  /** Candlestick close value. */
  close?: number;
  /** Percentage of total when stacking is 'percent'. */
  percentage?: number;
  options?: Record<string, unknown>;
  /** Reference to the SVG element for this point (may be undefined if not rendered). */
  graphic?: { element: SVGElement };
  series: HighchartsSeries;
  index: number;
  setState?: (state: string) => void;
}

/**
 * Represents an axis in a Highcharts chart.
 */
export interface HighchartsAxis {
  categories?: string[];
  getExtremes: () => { min: number; max: number };
  isDatetimeAxis?: boolean;
  /** Rendered distance from the chart top in px (present after render). */
  top?: number;
  /** Rendered distance from the chart left in px (present after render). */
  left?: number;
  /** Rendered axis height in px (present after render). */
  height?: number;
  /** Rendered axis width in px (present after render). */
  width?: number;
  options: {
    title?: { text?: string };
    type?: string;
  };
}
