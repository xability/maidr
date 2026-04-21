/**
 * Represents the trend direction for candlestick data points.
 * Used across the application for audio palette selection and data representation.
 */
export type CandlestickTrend = 'Bull' | 'Bear' | 'Neutral';

/**
 * Format function signature for axis values.
 * Takes a value (number or string) and returns a formatted string.
 *
 * @example
 * // Currency formatting
 * const currencyFormat: FormatFunction = (v) => `$${Number(v).toFixed(2)}`;
 *
 * @example
 * // Date formatting
 * const dateFormat: FormatFunction = (v) => new Date(v).toLocaleDateString();
 */
export type FormatFunction = (value: number | string) => string;

/**
 * Supported format type specifiers for JSON/HTML API.
 */
export type FormatType = 'currency' | 'percent' | 'fixed' | 'number' | 'date' | 'scientific';

/**
 * Configuration for formatting values on an axis.
 *
 * Two ways to specify formatting:
 * 1. `function` - Function body string (for custom logic)
 * 2. `type` - Format type specifier (for common patterns)
 *
 * @example
 * // Using function string
 * { "function": "return `$${Number(value).toFixed(2)}`" }
 *
 * @example
 * // Using type specifier
 * { "type": "currency", "decimals": 2 }
 */
export interface AxisFormat {
  /**
   * Function body string for custom formatting.
   * The function receives `value` as parameter and must return a string.
   *
   * @example
   * // Currency formatting
   * { "function": "return `$${Number(value).toFixed(2)}`" }
   *
   * @example
   * // Date formatting
   * { "function": "return new Date(value).toLocaleDateString('en-US')" }
   */
  function?: string;

  /**
   * Format type specifier for common formatting patterns.
   * Use with `decimals`, `currency`, `locale`, `dateOptions` for customization.
   *
   * @example
   * { "type": "currency", "currency": "USD", "decimals": 2 }
   * { "type": "percent", "decimals": 1 }
   * { "type": "date", "dateOptions": { "month": "short", "day": "numeric" } }
   */
  type?: FormatType;

  /**
   * Number of decimal places for numeric formatters.
   * Used with: currency, percent, fixed, number, scientific
   * @default varies by type
   */
  decimals?: number;

  /**
   * ISO 4217 currency code for currency formatter.
   * @default 'USD'
   */
  currency?: string;

  /**
   * BCP 47 locale string for locale-aware formatters.
   * Used with: currency, number, date
   * @default 'en-US'
   */
  locale?: string;

  /**
   * Options for Intl.DateTimeFormat when using date type.
   *
   * @example
   * { "month": "short", "day": "numeric" } // "Jan 15"
   * { "year": "numeric", "month": "long" } // "January 2024"
   */
  dateOptions?: Intl.DateTimeFormatOptions;
}

/**
 * Configuration for formatting values across all axes in a layer.
 */
export interface FormatConfig {
  x?: AxisFormat;
  y?: AxisFormat;
  z?: AxisFormat;
}

/**
 * Configuration options for violin plot display.
 * Controls which summary statistics are shown in the violin box overlay.
 * Sent from the Python backend alongside violin_kde and violin_box layers.
 */
export interface ViolinOptions {
  /** Show median line marker. Default: true */
  showMedian?: boolean;
  /** Show mean value marker. Default: false */
  showMean?: boolean;
  /** Show extrema (min/max) markers. Default: true */
  showExtrema?: boolean;
}

/**
 * Data point for violin KDE (kernel density estimation) curves.
 * Library-agnostic — no SVG coordinates embedded in data.
 * The density field falls back to width if absent.
 */
export interface ViolinKdePoint {
  /** Categorical label for the violin (e.g., "setosa") */
  x: string | number;
  /** Position along the density axis */
  y: number;
  /** KDE density value at this point. Falls back to `width` if absent. */
  density?: number;
  /** Half-width of the violin at this Y level (used as density fallback) */
  width?: number;
  /** SVG viewport x-coordinate for highlight positioning (provided by backend) */
  svg_x?: number;
  /** SVG viewport y-coordinate for highlight positioning (provided by backend) */
  svg_y?: number;
}

/**
 * Root MAIDR data structure containing figure metadata and subplot grid.
 * This is the type for the `data` prop passed to the `<Maidr>` React component.
 *
 * @example
 * ```typescript
 * const data: Maidr = {
 *   id: 'my-chart',
 *   title: 'Sales by Quarter',
 *   subplots: [[{
 *     layers: [{
 *       id: '0',
 *       type: 'bar',
 *       axes: { x: 'Quarter', y: 'Revenue' },
 *       data: [{ x: 'Q1', y: 120 }, { x: 'Q2', y: 200 }],
 *     }],
 *   }]],
 * };
 * ```
 */
export interface Maidr {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /**
   * 2D grid of subplots. Each row is an array of subplots.
   * For a single chart, use `[[{ layers: [...] }]]`.
   */
  subplots: MaidrSubplot[][];
}

/**
 * Subplot data structure containing optional legend and trace layers.
 * A subplot groups one or more layers (traces) that share the same coordinate space.
 *
 * @example
 * ```typescript
 * const subplot: MaidrSubplot = {
 *   layers: [
 *     { id: '0', type: 'bar', axes: { x: 'X', y: 'Y' }, data: [...] },
 *     { id: '1', type: 'line', axes: { x: 'X', y: 'Y' }, data: [...] },
 *   ],
 * };
 * ```
 */
export interface MaidrSubplot {
  /** Legend labels for multi-series plots. */
  legend?: string[];
  /** CSS selector for the subplot container element. */
  selector?: string;
  /** Array of trace layers in this subplot. */
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
  z: string;
  lowerOutliers: number[];
  min: number;
  q1: number;
  q2: number;
  q3: number;
  max: number;
  upperOutliers: number[];
  /** Mean value for violin plots when mean display is enabled. */
  mean?: number;
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
  /** CSS selector for mean marker element in violin plots. */
  mean?: string;
  /** Optional direct CSS selector for Q1 element (bypasses iq edge derivation). */
  q1?: string;
  /** Optional direct CSS selector for Q3 element (bypasses iq edge derivation). */
  q3?: string;
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
  /** Optional volume data. May be undefined when source (e.g., Google Charts) doesn't provide it. */
  volume?: number;
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
  z?: string;
}

/**
 * Data point for scatter plots with x and y coordinates, plus optional z for 3D.
 */
export interface ScatterPoint {
  x: number;
  y: number;
  z?: number;
}

/**
 * Data point for segmented/grouped bar charts with fill color identifier.
 */
export interface SegmentedPoint extends BarPoint {
  z: string;
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
 * Extended axis configuration that includes an optional label and grid navigation properties.
 * Used when an axis needs both a label and grid config (min, max, tickStep).
 *
 * @example
 * // axes.x as an object with grid config
 * axes: { x: { label: "Sepal Length", min: 4.3, max: 7.9, tickStep: 0.7 } }
 */
export interface AxisConfig {
  label?: string;
  min?: number;
  max?: number;
  tickStep?: number;
}

/**
 * Alternate grid configuration shape where grid properties are grouped by property name.
 * Supports `axes.min.x`, `axes.max.x`, `axes.tickStep.x` etc.
 *
 * @example
 * axes: { x: "Sepal Length", min: { x: 4.3, y: 2 }, max: { x: 7.9, y: 4.4 }, tickStep: { x: 0.7, y: 0.5 } }
 */
export interface AxisGridProperty {
  x?: number;
  y?: number;
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
  /**
   * Axis configuration including labels, optional formatting, and grid navigation properties.
   *
   * Supports two shapes for grid config (both can coexist):
   *
   * **Format A** – per-axis objects (`axes.x.min`):
   * ```json
   * { "axes": { "x": { "label": "Sepal Length", "min": 4.3, "max": 7.9, "tickStep": 0.7 } } }
   * ```
   *
   * **Format B** – grouped by property (`axes.min.x`):
   * ```json
   * { "axes": { "x": "Sepal Length", "min": { "x": 4.3, "y": 2 }, "tickStep": { "x": 0.7, "y": 0.5 } } }
   * ```
   *
   * @example
   * // Basic axis labels (no grid)
   * axes: { x: "Date", y: "Price" }
   *
   * @example
   * // With formatting
   * axes: { x: "Date", y: "Price", format: { y: { type: "currency", decimals: 2 } } }
   */
  axes?: {
    /** Axis label (string) or axis config object with label + grid properties. */
    x?: string | AxisConfig;
    /** Axis label (string) or axis config object with label + grid properties. */
    y?: string | AxisConfig;
    /** Z-axis label (string) or axis config object. Used for grouping/fill in multi-series plots. */
    z?: string | AxisConfig;
    /** Grouped grid property: `min: { x: 4.3, y: 2 }` */
    min?: AxisGridProperty;
    /** Grouped grid property: `max: { x: 7.9, y: 4.4 }` */
    max?: AxisGridProperty;
    /** Grouped grid property: `tickStep: { x: 0.7, y: 0.5 }` */
    tickStep?: AxisGridProperty;
    /**
     * Optional formatting configuration for axis values.
     * When provided, values displayed in text descriptions will be formatted.
     *
     * @example
     * format: {
     *   x: { function: "return new Date(value).toLocaleDateString()" },
     *   y: { type: "currency", decimals: 2 }
     * }
     */
    format?: FormatConfig;
  };
  /**
   * Optional display configuration for violin plot layers (VIOLIN_KDE and VIOLIN_BOX).
   * Controls which summary statistics are shown in the violin box overlay.
   */
  violinOptions?: ViolinOptions;
  data:
    | BarPoint[]
    | BoxPoint[]
    | CandlestickPoint[]
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | ScatterPoint[]
    | SegmentedPoint[][]
    | SmoothPoint[][]
    | ViolinKdePoint[][];
}

/**
 * Enumeration of supported plot trace types.
 * Use these values for the `type` field in {@link MaidrLayer}.
 *
 * @example
 * ```typescript
 * import { TraceType } from 'maidr/react';
 * const layer = { id: '0', type: TraceType.BAR, ... };
 * // Or use the string value directly:
 * const layer2 = { id: '0', type: 'bar', ... };
 * ```
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
  VIOLIN_BOX = 'violin_box',
  VIOLIN_KDE = 'violin_kde',
}
