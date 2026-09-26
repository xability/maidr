/**
 * Reads a TradingView Lightweight Charts instance into MAIDR's schema.
 *
 * Everything comes off the chart's public API: `chart.panes()` for the panes,
 * `pane.getSeries()` for what each one draws, `series.seriesType()` for how to
 * read it and `series.data()` for the rows. Nothing is scraped from the canvas.
 *
 * | Series type                 | MAIDR layer   |
 * | --------------------------- | ------------- |
 * | `Candlestick`, `Bar` (OHLC) | `candlestick` |
 * | `Line`, `Area`, `Baseline`  | `line`        |
 * | `Histogram`                 | `bar`         |
 *
 * Each pane becomes one subplot and each series in it one layer -- so a price
 * pane with a moving average and a volume pane below it is two subplots, the
 * price one with two layers. The panes are stacked bottom-first, as the
 * Chart.js adapter stacks its panels: the chart is a canvas, so MAIDR has no
 * geometry to order the grid by and takes the grammar's convention, where row
 * 0 is the bottom and Up moves to the row above.
 */

import type {
  AxisFormat,
  BarPoint,
  CandlestickPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
} from '@type/grammar';
import type {
  LwcBusinessDay,
  LwcChart,
  LwcDataItem,
  LwcSeries,
  LwcSeriesOptions,
  LwcTime,
} from './types';
import { TraceType } from '@type/grammar';

/**
 * Options for reading a Lightweight Charts chart.
 */
export interface LightweightChartsOptions {
  /**
   * The MAIDR figure id; it must be unique on the page, and is what the live
   * API addresses the chart by. Defaults to the chart container's `id`, or a
   * generated one when the container has none.
   */
  id?: string;
  /** Chart title announced on focus. */
  title?: string;
  subtitle?: string;
  caption?: string;
  /**
   * Axis labels. `x` labels the time axis of every layer (default `Time`).
   * `y` labels any series without a `title` option of its own (default
   * `Price` for candlestick and OHLC bar series, `Value` otherwise).
   */
  axes?: { x?: string; y?: string };
  /**
   * Turns a horizontal-scale item into the label MAIDR announces. By default a
   * business day or a `yyyy-mm-dd` string is read as it is written, and a
   * timestamp as its UTC date -- with the time of day as well when any bar on
   * the chart falls other than at midnight.
   */
  formatTime?: (time: LwcTime) => string;
  /**
   * Mark the figure live, which enables monitor mode (`M`) and in-place data
   * updates. `bindLightweightChart` defaults it to `true`, since it keeps
   * MAIDR in step with the chart; `fromLightweightChart`, which does not,
   * defaults it to `false`.
   */
  live?: boolean;
  /** Keep only the newest `maxWidth` points of each series. */
  maxWidth?: number;
}

/** How a series is read, by the MAIDR layer it becomes. */
export type SeriesKind = 'candlestick' | 'line' | 'bar';

/** A MAIDR point of any of the three layer kinds the adapter emits. */
export type SeriesPoint = CandlestickPoint | LinePoint | BarPoint;

/**
 * One series as read, with what the highlight needs to find it again.
 */
export interface SeriesReading {
  layerId: string;
  series: LwcSeries;
  kind: SeriesKind;
  /** The pane the series is drawn in, as `pane.paneIndex()` reports it. */
  paneIndex: number;
  /** Row of the subplot in the figure's grid, counted from the bottom pane read. */
  subplotRow: number;
  /** The points handed to MAIDR, oldest first, after the `maxWidth` window. */
  points: SeriesPoint[];
  /**
   * The source row of each point in {@link points}, by the same index -- so a
   * MAIDR column is a bar the chart can place on its time scale.
   */
  items: LwcDataItem[];
  /** How many points the series had before the `maxWidth` window. */
  total: number;
}

/**
 * A chart as read: the MAIDR figure, and each series behind its layers.
 */
export interface LightweightChartsReading {
  maidr: Maidr;
  series: SeriesReading[];
}

/**
 * The layer kind a series type is read as, or `null` for one MAIDR has no
 * reading of (a custom series).
 * @param seriesType - What `series.seriesType()` reports
 */
export function kindOf(seriesType: string): SeriesKind | null {
  switch (seriesType) {
    case 'Candlestick':
    case 'Bar':
      return 'candlestick';
    case 'Line':
    case 'Area':
    case 'Baseline':
      return 'line';
    case 'Histogram':
      return 'bar';
    default:
      return null;
  }
}

function isBusinessDay(time: LwcTime): time is LwcBusinessDay {
  return typeof time === 'object' && time !== null && 'year' in time;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A timestamp's UTC date, `yyyy-mm-dd`. */
function utcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Whether a timestamp falls other than at midnight UTC -- which is what says
 * a chart is intraday, since a daily chart's timestamps are all midnight.
 */
function hasTimeOfDay(time: LwcTime): boolean {
  return typeof time === 'number' && time % 86400 !== 0;
}

/**
 * The default label maker for one chart. Whether timestamps carry a time of
 * day is decided once for the whole chart, so every layer spells the same bar
 * the same way -- the x values are what keep the layers in step with each
 * other as the reader moves between them.
 * @param times - Every time on the chart
 */
export function defaultTimeFormatter(times: Iterable<LwcTime>): (time: LwcTime) => string {
  let intraday = false;
  let seconds = false;
  for (const time of times) {
    if (hasTimeOfDay(time)) {
      intraday = true;
      if ((time as number) % 60 !== 0) {
        seconds = true;
        break;
      }
    }
  }
  return (time) => {
    if (typeof time === 'string') {
      return time;
    }
    if (isBusinessDay(time)) {
      return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
    }
    const date = new Date(time * 1000);
    if (!intraday) {
      return utcDate(date);
    }
    const clock = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    return `${utcDate(date)} ${seconds ? `${clock}:${pad(date.getUTCSeconds())}` : clock}`;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The series' points, each with the row it came from. A row without the
 * values its kind needs is passed over. Whitespace -- a time with no value,
 * which the chart leaves blank -- never reaches here: `series.data()` holds
 * only the rows the chart plots, so a line reads from the bar before a gap
 * straight to the bar after it, whose time says how far it jumped.
 */
function readPoints(
  kind: SeriesKind,
  data: readonly LwcDataItem[],
  label: (time: LwcTime) => string,
): { points: SeriesPoint[]; items: LwcDataItem[] } {
  const points: SeriesPoint[] = [];
  const items: LwcDataItem[] = [];
  for (const item of data) {
    if (kind === 'candlestick') {
      if (!isFiniteNumber(item.high) || !isFiniteNumber(item.low) || !isFiniteNumber(item.close)) {
        continue;
      }
      const point: CandlestickPoint = {
        value: label(item.time),
        high: item.high,
        low: item.low,
        close: item.close,
        volatility: item.high - item.low,
      };
      if (isFiniteNumber(item.open)) {
        point.open = item.open;
        point.trend = item.close > item.open ? 'Bull' : item.close < item.open ? 'Bear' : 'Neutral';
      }
      points.push(point);
    } else {
      if (!isFiniteNumber(item.value)) {
        continue;
      }
      points.push({ x: label(item.time), y: item.value });
    }
    items.push(item);
  }
  return { points, items };
}

/**
 * The value format a series' `priceFormat` asks for, where MAIDR has the same
 * one. The others are left alone and read as their values are. A percentage
 * series's values are already percentages, which MAIDR's percent format would
 * scale by a hundred. A volume series is shown rounded to its precision with
 * trailing zeros dropped, which no fixed decimal count matches: whole numbers
 * would announce a volume of 0.4 as 0.
 */
function formatOf(options: LwcSeriesOptions): AxisFormat | undefined {
  const format = options.priceFormat;
  if ((format?.type === undefined || format.type === 'price') && isFiniteNumber(format?.precision)) {
    return { type: 'number', decimals: format.precision };
  }
  return undefined;
}

/**
 * Builds one layer from a series' points.
 */
function toLayer(
  reading: SeriesReading,
  seriesType: string,
  options: LwcSeriesOptions,
  chartOptions: LightweightChartsOptions,
): MaidrLayer {
  const title = options.title?.trim() || undefined;
  const yLabel = title
    ?? chartOptions.axes?.y
    ?? (reading.kind === 'candlestick' ? 'Price' : 'Value');
  const format = formatOf(options);
  const axes = {
    x: { label: chartOptions.axes?.x ?? 'Time' },
    y: format ? { label: yLabel, format } : { label: yLabel },
  };
  const layerTitle = title ?? `${seriesType} series`;

  switch (reading.kind) {
    case 'candlestick':
      return {
        id: reading.layerId,
        type: TraceType.CANDLESTICK,
        title: layerTitle,
        axes,
        data: reading.points as CandlestickPoint[],
      };
    case 'line':
      return {
        id: reading.layerId,
        type: TraceType.LINE,
        title: layerTitle,
        axes,
        data: [reading.points as LinePoint[]],
      };
    case 'bar':
      return {
        id: reading.layerId,
        type: TraceType.BAR,
        title: layerTitle,
        axes,
        data: reading.points as BarPoint[],
      };
  }
}

let generatedIds = 0;

/**
 * The figure id: the one asked for, else the chart container's, else a new one.
 */
function figureId(chart: LwcChart, options: LightweightChartsOptions): string {
  if (options.id) {
    return options.id;
  }
  const container = chart.chartElement().parentElement;
  if (container?.id) {
    return container.id;
  }
  generatedIds += 1;
  return `maidr-lightweight-chart-${generatedIds}`;
}

/**
 * Reads a chart into a MAIDR figure, keeping each layer's series and source
 * rows alongside for the highlight and the live sync.
 *
 * Panes with nothing MAIDR can read are left out, as are hidden series,
 * custom series and series with no data yet.
 *
 * @param chart - The chart `createChart` returned
 * @param options - Titles, labels and live settings
 * @param id - The figure id to use, when it is already settled
 * @throws If no pane has a series MAIDR can read with data in it
 */
export function readLightweightChart(
  chart: LwcChart,
  options: LightweightChartsOptions = {},
  id?: string,
): LightweightChartsReading {
  const panes = chart.panes();

  const everyTime: LwcTime[] = [];
  const candidates = panes.map(pane => pane.getSeries().flatMap((series, index) => {
    const seriesType = series.seriesType();
    const kind = kindOf(seriesType);
    const seriesOptions = series.options();
    if (kind === null) {
      console.warn(`MAIDR Lightweight Charts adapter: skipping "${seriesType}" series, which MAIDR has no reading of.`);
      return [];
    }
    if (seriesOptions.visible === false) {
      return [];
    }
    const data = series.data();
    for (const item of data) {
      everyTime.push(item.time);
    }
    return [{ series, index, seriesType, kind, seriesOptions, data }];
  }));

  const label = options.formatTime ?? defaultTimeFormatter(everyTime);
  const maxWidth = options.maxWidth !== undefined && options.maxWidth > 0 ? options.maxWidth : undefined;

  const readings: SeriesReading[] = [];
  const subplots: MaidrSubplot[][] = [];
  // Bottom pane first; see the module comment.
  panes.map((pane, paneIndex) => ({ pane, paneIndex })).reverse().forEach(({ pane, paneIndex }) => {
    const layers: MaidrLayer[] = [];
    for (const candidate of candidates[paneIndex]) {
      const read = readPoints(candidate.kind, candidate.data, label);
      if (read.points.length === 0) {
        continue;
      }
      const start = maxWidth !== undefined ? Math.max(0, read.points.length - maxWidth) : 0;
      const reading: SeriesReading = {
        layerId: `pane${pane.paneIndex()}-series${candidate.index}`,
        series: candidate.series,
        kind: candidate.kind,
        paneIndex: pane.paneIndex(),
        subplotRow: subplots.length,
        points: read.points.slice(start),
        items: read.items.slice(start),
        total: read.points.length,
      };
      readings.push(reading);
      layers.push(toLayer(reading, candidate.seriesType, candidate.seriesOptions, options));
    }
    if (layers.length > 0) {
      subplots.push([{ layers }]);
    }
  });

  if (subplots.length === 0) {
    throw new Error(
      'MAIDR Lightweight Charts adapter: the chart has no Candlestick, Bar, Line, Area, '
      + 'Baseline or Histogram series with data. Bind after calling series.setData(...).',
    );
  }

  const maidr: Maidr = {
    id: id ?? figureId(chart, options),
    subplots,
  };
  if (options.title !== undefined)
    maidr.title = options.title;
  if (options.subtitle !== undefined)
    maidr.subtitle = options.subtitle;
  if (options.caption !== undefined)
    maidr.caption = options.caption;
  if (options.live !== false)
    maidr.live = true;
  if (maxWidth !== undefined)
    maidr.maxWidth = maxWidth;

  return { maidr, series: readings };
}

/**
 * Converts a Lightweight Charts chart into MAIDR JSON.
 *
 * The result drives audio, text and braille when set as a `maidr` attribute
 * or passed to `<Maidr data={...}>`, but it carries no highlight -- the chart
 * draws on a canvas, so the highlight needs {@link bindLightweightChart}, which
 * also keeps MAIDR in step with the chart's data.
 *
 * @param chart - The chart `createChart` returned
 * @param options - Titles and labels
 * @returns The MAIDR figure
 */
export function fromLightweightChart(
  chart: LwcChart,
  options: LightweightChartsOptions = {},
): Maidr {
  // Nothing keeps this JSON in step with the chart, so it is live only when
  // the caller streams into it themselves and says so.
  return readLightweightChart(chart, { ...options, live: options.live === true }).maidr;
}
