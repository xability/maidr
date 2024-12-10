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
  data: BarPoint[][] | LinePoint[][] | HeatmapData;
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
