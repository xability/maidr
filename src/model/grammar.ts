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
    | SegmentedPoint[][];
}

export interface BarPoint {
  x: string | number;
  y: number | string;
}

export interface HeatmapData {
  x: string[];
  y: string[];
  points: number[][];
}

export interface HistogramPoint extends BarPoint {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface LinePoint {
  x: number;
  y: number;
}

export interface SegmentedPoint extends BarPoint {
  fill: string;
}
