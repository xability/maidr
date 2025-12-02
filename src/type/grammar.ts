/**
 * Represents the trend direction for candlestick data points.
 * Used across the application for audio palette selection and data representation.
 */
export type CandlestickTrend = 'Bull' | 'Bear' | 'Neutral';

/**
 * Root MAIDR data structure containing figure metadata and subplot grid.
 */
export interface Maidr {
  id: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  subplots: MaidrSubplot[][];
}

/**
 * Subplot data structure containing optional legend and trace layers.
 */
export interface MaidrSubplot {
  legend?: string[];
  layers: MaidrLayer[];
}

/**
 * Data point for bar charts with x and y coordinates.
 */
export interface BarPoint {
  x: string | number;
  y: number | string;
}

/**
 * Data point for boxplots containing quartiles, min/max, and outliers.
 */
export interface BoxPoint {
  fill: string;
  lowerOutliers: number[];
  min: number;
  q1: number;
  q2: number;
  q3: number;
  max: number;
  upperOutliers: number[];
}

/**
 * DOM selectors for boxplot visual elements.
 */
export interface BoxSelector {
  lowerOutliers: string[];
  min: string;
  iq: string;
  q2: string;
  max: string;
  upperOutliers: string[];
}

/**
 * Data point for candlestick charts with OHLC values, volume, and trend information.
 */
export interface CandlestickPoint {
  value: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trend: CandlestickTrend;
  volatility: number;
}

/**
 * Data structure for heatmap charts with x/y labels and 2D point values.
 */
export interface HeatmapData {
  x: string[];
  y: string[];
  points: number[][];
}

/**
 * Data point for histograms extending bar points with bin ranges.
 */
export interface HistogramPoint extends BarPoint {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Data point for line charts with optional fill color for multi-series plots.
 */
export interface LinePoint {
  x: number | string;
  y: number;
  fill?: string;
}

/**
 * Data point for scatter plots with x and y coordinates.
 */
export interface ScatterPoint {
  x: number;
  y: number;
}

/**
 * Data point for segmented/grouped bar charts with fill color identifier.
 */
export interface SegmentedPoint extends BarPoint {
  fill: string;
}

/**
 * Data point for smooth/regression plots with data and SVG coordinate pairs.
 */
export interface SmoothPoint {
  x: number;
  y: number;
  svg_x: number;
  svg_y: number;
}

/**
 * Chart orientation for bar and box plots.
 */
export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

/**
 * DOM selectors for candlestick chart visual elements.
 */
export interface CandlestickSelector {
  body: string | string[];
  wickHigh?: string | string[];
  wickLow?: string | string[];
  wick?: string | string[]; // single combined wick (high-to-low) line
  open?: string | string[];
  close?: string | string[];
}

/**
 * Layer/trace definition containing plot type, data, and rendering configuration.
 */
export interface MaidrLayer {
  id: string;
  type: TraceType;
  title?: string;
  selectors?: string | string[] | BoxSelector[] | CandlestickSelector;
  orientation?: Orientation;
  /**
   * Optional DOM mapping hints. When provided, individual traces can opt-in
   * to use these hints to map DOM elements to the internal row-major data grid
   * without changing default behavior when omitted.
   */
  domMapping?: {
    /**
     * Specify DOM flattening order for grid-like traces.
     * 'row' => row-major, 'column' => column-major.
     */
    order?: 'row' | 'column';
    /**
     * For segmented/dodged bars, control the per-column group/level iteration.
     * 'forward' => iterate groups top-to-bottom (as previously domOrder='forward').
     * 'reverse' => iterate bottom-to-top (default).
     */
    groupDirection?: 'forward' | 'reverse';
    /**
     * For boxplots, control the Q1/Q3 edge mapping for IQR box.
     * 'forward' => Q1=bottom, Q3=top (default for vertical)
     * 'reverse' => Q1=top, Q3=bottom (for Base R vertical boxplots)
     */
    iqrDirection?: 'forward' | 'reverse';
  };
  axes?: {
    x?: string;
    y?: string;
    fill?: string;
  };
  data:
    | BarPoint[]
    | BoxPoint[]
    | CandlestickPoint[]
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | ScatterPoint[]
    | SegmentedPoint[][];
}

/**
 * Enumeration of supported plot trace types.
 */
export enum TraceType {
  BAR = 'bar',
  BOX = 'box',
  CANDLESTICK = 'candlestick',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  SCATTER = 'point',
  SMOOTH = 'smooth',
  STACKED = 'stacked_bar',
}
