import {Orientation} from './plot';

export interface Maidr {
  id: string;
  type: string;
  selector?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  orientation?: Orientation;
  axes?: {
    x?: string;
    y?: string;
    fill?: string;
  };
  data:
    | BarPoint[]
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | SegmentPoint[][];
}

export type BarPoint = {
  x: string | number;
  y: number | string;
};

export type HeatmapData = {
  x: string[];
  y: string[];
  points: number[][];
};

export type HistogramPoint = BarPoint & {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
};

export type LinePoint = {
  x: number;
  y: number;
};

export type SegmentPoint = BarPoint & {
  fill: string;
};
