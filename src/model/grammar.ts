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

export interface BoxBound {
  lowerOutliers: BoxBoundPoint;
  min: BoxBoundPoint;
  q1: BoxBoundPoint;
  q2: BoxBoundPoint;
  q3: BoxBoundPoint;
  max: BoxBoundPoint;
  upperOutliers: BoxBoundPoint;
}
export interface BoxBoundPoint {
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  type: string;
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
