/**
 * Represents the trend direction for candlestick data points.
 * Used across the application for audio palette selection and data representation.
 */
export type CandlestickTrend = 'Bull' | 'Bear' | 'Neutral';

export interface AxisFormatConfig {

  dateFormat?: {

    style?: 'short' | 'medium' | 'long' | 'full';

    format?: string;
  };

  numberFormat?: {

    style?: 'decimal' | 'currency' | 'percent' | 'scientific';

    currency?: string;

    minimumFractionDigits?: number;

    maximumFractionDigits?: number;

    useGrouping?: boolean;
  };

  priceFormat?: {

    currency?: string;

    minimumFractionDigits?: number;

    maximumFractionDigits?: number;

    useGrouping?: boolean;
  };
}

export interface FormattingConfig {

  locale?: string;

  timezone?: string;

  numberFormat?: {

    style?: 'decimal' | 'currency' | 'percent' | 'scientific';

    currency?: string;

    minimumFractionDigits?: number;

    maximumFractionDigits?: number;

    useGrouping?: boolean;

    notation?: 'standard' | 'scientific' | 'engineering' | 'compact';

    compactDisplay?: 'short' | 'long';
  };

  priceFormat?: {

    currency?: string;

    minimumFractionDigits?: number;

    maximumFractionDigits?: number;

    useGrouping?: boolean;
  };

  dateFormat?: {

    style?: 'short' | 'medium' | 'long' | 'full';

    includeTime?: boolean;

    timeFormat?: '12h' | '24h';

    customFormat?: string;

    relative?: boolean;

    showTime?: boolean;

    showSeconds?: boolean;

    showTimezone?: boolean;
  };

  textFormat?: {

    maxLength?: number;

    truncateStrategy?: 'end' | 'middle' | 'word';

    case?: 'lower' | 'upper' | 'title' | 'sentence';

    ellipsis?: string;
  };

  /**
   * Axis-specific formatting overrides
   */
  axes?: {
    x?: Partial<FormattingConfig>;
    y?: Partial<FormattingConfig>;
    volume?: Partial<FormattingConfig>;
    fill?: Partial<FormattingConfig>;
  };
}

export interface Maidr {
  id: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  subplots: MaidrSubplot[][];

  formatting?: FormattingConfig;
}

export interface MaidrSubplot {
  legend?: string[];
  layers: MaidrLayer[];
  formatting?: FormattingConfig;
}

export interface BarPoint {
  x: string | number;
  y: number | string;
}

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

export interface BoxSelector {
  lowerOutliers: string[];
  min: string;
  iq: string;
  q2: string;
  max: string;
  upperOutliers: string[];
}

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

export interface HeatmapData {
  x: string[];
  y: string[];
  points: number[][];
}

export interface HistogramPoint extends BarPoint {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface LinePoint {
  x: number | string;
  y: number;
  fill?: string;
}

export interface ScatterPoint {
  x: number;
  y: number;
}

export interface SegmentedPoint extends BarPoint {
  fill: string;
}

export interface SmoothPoint {
  x: number;
  y: number;
  svg_x: number;
  svg_y: number;
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export interface CandlestickSelector {
  body: string | string[];
  wickHigh?: string | string[];
  wickLow?: string | string[];
  wick?: string | string[]; // single combined wick (high-to-low) line
  open?: string | string[];
  close?: string | string[];
}

export interface MaidrLayer {
  id: string;
  type: TraceType;
  title?: string;
  selectors?: string | string[] | BoxSelector[] | CandlestickSelector;
  orientation?: Orientation;
  axes?: {
    x?: string;
    y?: string;
    fill?: string;
    xAxisFormat?: AxisFormatConfig;
    yAxisFormat?: AxisFormatConfig;
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
