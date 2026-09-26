/**
 * Structural types for the parts of TradingView Lightweight Charts (v5) the
 * MAIDR adapter reads.
 *
 * The adapter never imports `lightweight-charts`: it is handed the live chart
 * the host page created and duck-types what it needs off it, the way the
 * amCharts and Chart.js adapters do. These interfaces name only that subset,
 * so the published declaration file does not require the library's own types.
 */

/** Seconds since the Unix epoch, UTC -- Lightweight Charts' `UTCTimestamp`. */
export type LwcTimestamp = number;

/** A calendar day, as Lightweight Charts' `BusinessDay`. */
export interface LwcBusinessDay {
  year: number;
  month: number;
  day: number;
}

/** A horizontal-scale item: a timestamp, a business day or a `yyyy-mm-dd` string. */
export type LwcTime = LwcTimestamp | LwcBusinessDay | string;

/**
 * One item of `series.data()`. Which value fields are present depends on the
 * series type; an item carrying only `time` is whitespace (a gap).
 */
export interface LwcDataItem {
  time: LwcTime;
  value?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

/** The series types Lightweight Charts ships. Custom series report their own name. */
export type LwcSeriesType
  = | 'Candlestick'
    | 'Bar'
    | 'Line'
    | 'Area'
    | 'Baseline'
    | 'Histogram'
    | string;

/** The subset of a series' options the adapter reads. */
export interface LwcSeriesOptions {
  title?: string;
  visible?: boolean;
  /** The histogram's baseline. */
  base?: number;
  priceFormat?: {
    type?: 'price' | 'volume' | 'percent' | 'custom';
    precision?: number;
  };
}

/** A series handle, as returned by `chart.addSeries(...)`. */
export interface LwcSeries {
  seriesType: () => LwcSeriesType;
  data: () => readonly LwcDataItem[];
  options: () => LwcSeriesOptions;
  priceToCoordinate: (price: number) => number | null;
  subscribeDataChanged: (handler: (scope: 'full' | 'update') => void) => void;
  unsubscribeDataChanged: (handler: (scope: 'full' | 'update') => void) => void;
}

/** A pane: one horizontal band of the chart with its own price scales. */
export interface LwcPane {
  paneIndex: () => number;
  getSeries: () => LwcSeries[];
  getHeight: () => number;
  getHTMLElement: () => HTMLElement | null;
}

/** The chart's shared horizontal (time) scale. */
export interface LwcTimeScale {
  timeToCoordinate: (time: LwcTime) => number | null;
  logicalToCoordinate: (logical: number) => number | null;
  width: () => number;
  subscribeVisibleLogicalRangeChange: (handler: () => void) => void;
  unsubscribeVisibleLogicalRangeChange: (handler: () => void) => void;
}

/** A price scale; only its width is read, to find where a pane's plot starts. */
export interface LwcPriceScale {
  width: () => number;
}

/** A chart, as returned by `createChart(...)`. */
export interface LwcChart {
  panes: () => LwcPane[];
  timeScale: () => LwcTimeScale;
  priceScale: (priceScaleId: string, paneIndex?: number) => LwcPriceScale;
  chartElement: () => HTMLDivElement;
}
