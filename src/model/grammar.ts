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

export interface CandlestickPoint {
  value: string;
  low: number;
  open: number;
  close: number;
  high: number;
  volume: number;
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

export interface ScatterSeries {
  fill?: string;
  points: {
    x: number;
    y: number;
  }[];
}

export interface SegmentedPoint extends BarPoint {
  fill: string;
}
