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
  grid?: {
    rows?: number;
    columns?: number;
    pattern?: string;
    roworder?: string;
  };
  annotations?: PlotlyAnnotation[];
  [key: string]: unknown;
}

/**
 * A layout annotation. Plotly Express emits facet labels (e.g. "sex=Male")
 * as annotations whose `xref`/`yref` are axis-domain references such as
 * `'x2 domain'`.
 */
export interface PlotlyAnnotation {
  text?: string;
  xref?: string;
  yref?: string;
  x?: number | string;
  y?: number | string;
  showarrow?: boolean;
  textangle?: number | string;
}

export interface PlotlyFullLayout extends PlotlyLayout {
  barmode?: string;
  barnorm?: string;
  [key: string]: unknown;
}

export interface PlotlyAxis {
  title?: { text?: string } | string;
  range?: [number, number];
  dtick?: number | string;
  tick0?: number | string;
  tickmode?: 'auto' | 'linear' | 'array';
  tickvals?: number[];
  type?: string;
  categories?: string[];
  /** Fraction of the plot area this axis spans: `[start, end]` in [0, 1]. */
  domain?: [number, number];
  /** The axis this one is anchored to (e.g. `'y2'`). */
  anchor?: string;
  /** Axis id whose range this axis mirrors (facet-style shared axes). */
  matches?: string;
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
