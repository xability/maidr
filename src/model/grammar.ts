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
  x: number;
  y: number;
}

export interface SegmentedPoint extends BarPoint {
  fill: string;
}
