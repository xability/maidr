/**
 * Represents the trend direction for candlestick data points.
 * Used across the application for audio palette selection and data representation.
 */
export type CandlestickTrend = 'Bull' | 'Bear' | 'Neutral';

export interface Maidr {
  id: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  subplots: MaidrSubplot[][];
}

export interface MaidrSubplot {
  legend?: string[];
  layers: MaidrLayer[];
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

export interface MaidrLayer {
  id: string;
  type: TraceType;
  title?: string;
  selectors?: string | string[] | BoxSelector[];
  orientation?: Orientation;
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
