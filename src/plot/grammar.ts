export interface Maidr {
  id: string;
  type: string;
  selector?: string;
  title?: string;
  orientation?: string;
  axes?: {
    x?: string;
    y?: string;
    z?: string;
  };
  data: BarData | LineData | HistData | BoxData;
}

export type BarData =
  | {
    x: string[];
    y: number[];
  }
  | {
    x: number[];
    y: string[];
  };

export type LineData = [
  {
    x: Date[] | number[];
    y: number[];
  }
];


export type HistData = [
  {
    x: number[];
    y: number[];
  },
];


export type BoxData =
  | {
    x: string[];
    y: number[];
  }
  | {
    x: number[];
    y: string[];
  };
