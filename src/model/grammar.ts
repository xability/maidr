interface AxesDetails {
  label: string;
  level: string[];
}

interface Axes {
  x: string | AxesDetails;
  y: string | AxesDetails;
}
export interface Maidr {
  id: string;
  type: string;
  selector?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  orientation?: string;
  axes?: Axes;
  data: BarData | LineData | HeatMapData;
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

export type HeatMapData = [[number]];
