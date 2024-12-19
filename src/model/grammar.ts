export interface Maidr {
  id: string;
  type: string;
  selector?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  orientation?: string;
  axes?: {
    x?: string;
    y?: string;
    fill?: string;
    level?: string[];
  };
  data:
    | BarPoint[][]
    | LinePoint[][]
    | HeatmapData
    | HistogramPoint[]
    | BoxPoint[][];
}

export type BarPoint = {
  x: string | number;
  y: number | string;
  fill?: string;
};

export type LinePoint = {
  x: number;
  y: number;
};

export type HeatmapData = {
  x: string[];
  y: string[];
  points: number[][];
};

export type HistogramPoint = {
  x: number;
  y: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
};

export type BoxPoint = {
  lower_outlier: number[];
  min: number;
  q1: number;
  q2: number;
  q3: number;
  max: number;
  upper_outlier: number[];
};
