/**
 * Minimal type definitions for Highcharts objects used by the MAIDR adapter.
 *
 * These types represent the subset of the Highcharts API needed for data
 * extraction and visual synchronization. Users provide the actual Highcharts
 * library; MAIDR does not depend on it directly.
 */

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
  options: {
    title?: { text?: string };
    type?: string;
  };
}
