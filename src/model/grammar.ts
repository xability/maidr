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
  };
  data: BarData | LineData | HistogramData;
}

export type BarData =
  | {
      x: number[] | string[];
      y: number[];
    }
  | {
      x: number[];
      y: number[] | string[];
    };

export type LineData = [
  {
    x: number;
    y: number;
  },
];

export type HistogramData = {
  x: number;
  xmin: number;
  xmax: number;
  y: number;
  ymin: number;
  ymax: number;
}[];
