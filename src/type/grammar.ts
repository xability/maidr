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

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export interface MaidrLayer {
  type: string;
  title?: string;
  selectors?: string | string[];
  orientation?: Orientation;
  axes?: {
    x?: string;
    y?: string;
    fill?: string;
  };
  data:
    | BarPoint[]
    | BoxPoint[]
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | ScatterPoint[]
    | SegmentedPoint[][];
}
