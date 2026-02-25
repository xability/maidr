/**
 * Configuration types for the MAIDR D3.js binder.
 *
 * These types define the configuration options for extracting data from
 * D3.js-rendered SVG charts and converting them to the MAIDR JSON schema.
 */

import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  FormatConfig,
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
} from '../type/grammar';

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
  /** Axis labels. */
  axes?: {
    x?: string;
    y?: string;
    fill?: string;
  };
  /** Optional formatting configuration for axis values. */
  format?: FormatConfig;
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
 */
export interface D3SegmentedConfig extends D3BinderConfig {
  /** CSS selector for all bar segment elements (e.g., `'rect.bar'`). */
  selector: string;
  /** The type of segmented chart. @default TraceType.STACKED */
  type?: SegmentedTraceType;
  /** Accessor for the x-axis (category) value. @default 'x' */
  x?: DataAccessor<string | number>;
  /** Accessor for the y-axis (numeric) value. @default 'y' */
  y?: DataAccessor<number | string>;
  /** Accessor for the fill/group identifier. @default 'fill' */
  fill?: DataAccessor<string>;
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
