import type { BarPoint, BoxPoint, HeatmapData, HistogramPoint, LinePoint, SegmentedPoint } from '@model/grammar';

import type { Orientation } from '@type/plot';

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
    | BoxPoint[]
    | HeatmapData
    | HistogramPoint[]
    | LinePoint[][]
    | SegmentedPoint[][];
}
