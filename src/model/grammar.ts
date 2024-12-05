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
  };
  data: BarData | LineData | ScatterData[][];
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

export type ScatterData = {
  x: number;
  y: number[];
};

export type ScatterDataRaw = {
  x: number[];
  y: number[];
};