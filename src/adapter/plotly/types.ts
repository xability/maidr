/**
 * Shared Plotly.js internal types used across adapter modules.
 */

/** Plotly graph-div element with internal properties. */
export interface PlotlyGraphDiv extends HTMLElement {
  data?: PlotlyTrace[];
  layout?: PlotlyLayout;
  _fullData?: PlotlyTrace[];
  _fullLayout?: PlotlyFullLayout;
  calcdata?: PlotlyCalcData[][];
}

export interface PlotlyTrace {
  type?: string;
  mode?: string;
  name?: string;
  uid?: string;
  visible?: boolean | 'legendonly';
  x?: (number | string)[];
  y?: (number | string)[];
  z?: number[][];
  xaxis?: string;
  yaxis?: string;
  orientation?: 'v' | 'h';
  // Box-specific
  q1?: number[];
  median?: number[];
  q3?: number[];
  lowerfence?: number[];
  upperfence?: number[];
  mean?: number[];
  // Candlestick-specific
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  // Histogram-specific
  xbins?: { start?: number; end?: number; size?: number };
  // Heatmap colorbar
  colorbar?: { title?: { text?: string } | string };
}

export interface PlotlyLayout {
  title?: { text?: string } | string;
  xaxis?: PlotlyAxis;
  yaxis?: PlotlyAxis;
  grid?: { rows?: number; columns?: number };
  [key: string]: unknown;
}

export interface PlotlyFullLayout extends PlotlyLayout {
  barmode?: string;
  barnorm?: string;
  [key: string]: unknown;
}

export interface PlotlyAxis {
  title?: { text?: string } | string;
  range?: [number, number];
  dtick?: number;
  type?: string;
  categories?: string[];
}

export interface PlotlyCalcData {
  x?: number;
  y?: number;
  p?: number | string; // position (bar, box)
  s?: number; // size/value (bar)
  s0?: number;
  s1?: number;
  // Box calc data
  pos?: number | string;
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
  med?: number;
  mean?: number;
  lf?: number; // lower fence
  uf?: number; // upper fence
  lo?: number; // lower outlier threshold
  uo?: number; // upper outlier threshold
  pts?: PlotlyCalcPoint[];
  pts2?: PlotlyCalcPoint[];
  // Heatmap
  z?: number[][];
  trace?: PlotlyTrace;
  [key: string]: unknown;
}

export interface PlotlyCalcPoint {
  v?: number;
  x?: number;
  y?: number;
  i?: number;
}
