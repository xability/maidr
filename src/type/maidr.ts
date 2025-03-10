import type {
  BarPoint,
  BoxPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  ScatterSeries,
  SegmentedPoint,
} from '@model/grammar';
import type { Orientation } from './plot';

export interface Maidr {
  id: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  panels: Panel[][];
}

export interface Panel {
  legend?: string[];
  layers: Layer[];
}

export interface Layer {
  type: string;
  title?: string;
  selector?: string;
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
    | ScatterSeries[]
    | SegmentedPoint[][];
}
