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
  subplots: MaidrSubplot[][];
}

export interface MaidrSubplot {
  legend?: string[];
  layers: MaidrLayer[];
}

export interface MaidrLayer {
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
