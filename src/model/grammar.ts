export type FillData = {
  label?: string;
  level?: number[];
};
export interface Maidr {
  id: string;
  type: string;
  subtype?: string;
  selector?: string;
  title?: string;
  orientation?: string;
  axes?: {
    x?: string;
    y?: string;
    fill?: FillData;
  };
  data: BarData | LineData;
}

export type BarData = {
  x: string[] | number[][];
  y: string[] | number[][];
};

export type LineData = [
  {
    x: number;
    y: number;
  },
];
