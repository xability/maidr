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
  data: BarData | LineData;
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
