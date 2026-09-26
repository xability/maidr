/**
 * Reading values, labels and settings off a rendered ApexCharts chart.
 *
 * Values come from `w.globals`, which ApexCharts fills from every point
 * format it accepts (plain numbers, `[x, y]` pairs, `{x, y}` objects,
 * `parsing` paths) and which records what was actually drawn. Settings come
 * from `w.config`. Series membership comes from `w.globals` too: a series
 * hidden through the legend keeps its slot, with an empty value array and an
 * entry in `collapsedSeriesIndices`, and is skipped.
 */

import type { AxisFormat } from '../../type/grammar';
import type { ApexAxisOption, ApexChartsInstance, ApexLabel, ApexValue } from './types';

/** One day, in milliseconds. */
const DAY_MS = 86_400_000;

/**
 * The y axis options, which ApexCharts normalises to an array.
 *
 * @param chart - The chart
 * @returns The first y axis' options, or undefined
 */
export function firstYAxis(chart: ApexChartsInstance): ApexAxisOption | undefined {
  const yaxis = chart.w.config.yaxis;
  return Array.isArray(yaxis) ? yaxis[0] : yaxis;
}

/**
 * The title of the y axis a series is drawn against.
 *
 * ApexCharts records which of the `yaxis` entries each series uses in
 * `seriesYAxisReverseMap`, whether the axes were matched to series by
 * position or by `seriesName`.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @returns The axis title, or undefined when it has none
 */
export function yAxisTitle(chart: ApexChartsInstance, i: number): string | undefined {
  const yaxis = chart.w.config.yaxis;
  const axes = Array.isArray(yaxis) ? yaxis : [yaxis];
  const k = chart.w.globals.seriesYAxisReverseMap?.[i] ?? 0;
  const text: unknown = (axes[k] ?? axes[0])?.title?.text;
  const joined = Array.isArray(text) ? text.join(' ') : text;
  return typeof joined === 'string' && joined.trim() !== '' ? joined : undefined;
}

/**
 * The chart-level type, e.g. `'line'`, `'pie'` or `'heatmap'`.
 *
 * @param chart - The chart
 * @returns The configured chart type
 */
export function chartType(chart: ApexChartsInstance): string {
  return chart.w.config.chart.type ?? 'line';
}

/**
 * A series' own type, which in a combo chart can differ from the chart's.
 * `column` is ApexCharts' name for a vertical bar and is read as `bar`.
 *
 * @param chart - The chart
 * @param i     - The series' index in `w.config.series`
 * @returns The series type
 */
export function seriesType(chart: ApexChartsInstance, i: number): string {
  const type = chart.w.config.series[i]?.type ?? chart.w.globals.initialSeries?.[i]?.type ?? chartType(chart);
  return type === 'column' ? 'bar' : type;
}

/**
 * The name the legend gives a series.
 *
 * @param chart - The chart
 * @param i     - The series' index in `w.config.series`
 * @returns The name, or `Series <n>` when it has none
 */
export function seriesName(chart: ApexChartsInstance, i: number): string {
  const g = chart.w.globals;
  const name = g.seriesNames?.[i] ?? g.initialSeries?.[i]?.name ?? chart.w.config.series[i]?.name;
  return typeof name === 'string' && name !== '' ? name : `Series ${i + 1}`;
}

/**
 * One series' values, `[]` when ApexCharts drew none for it.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @returns The values, in data order
 */
export function seriesValues(chart: ApexChartsInstance, i: number): ApexValue[] {
  const row = chart.w.globals.series[i];
  return Array.isArray(row) ? row : [];
}

/**
 * The indices of the series the chart is drawing: every series in
 * `w.config.series` except those hidden through the legend and those
 * ApexCharts dropped (an empty value array — mixed point formats, for one).
 *
 * @param chart - The chart
 * @returns Series indices, in config order
 */
export function visibleSeries(chart: ApexChartsInstance): number[] {
  const g = chart.w.globals;
  const collapsed = new Set(g.collapsedSeriesIndices ?? []);
  for (const entry of g.collapsedSeries ?? []) {
    collapsed.add(entry.index);
  }
  const count = Math.max(chart.w.config.series.length, g.series.length);
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!collapsed.has(i) && seriesValues(chart, i).length > 0) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * A value as a number, or null for a gap.
 *
 * @param value - The value as ApexCharts stores it
 * @returns A finite number, or null
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * A category label as text; a multi-line label is joined with spaces.
 *
 * @param label - The label as ApexCharts stores it
 * @returns The text
 */
export function labelText(label: ApexLabel): string {
  if (Array.isArray(label)) {
    return label.join(' ');
  }
  return label === null || label === undefined ? '' : String(label);
}

/**
 * Whether the x axis is a datetime axis.
 *
 * @param chart - The chart
 * @returns True for `xaxis.type: 'datetime'`
 */
export function isDatetime(chart: ApexChartsInstance): boolean {
  return chart.w.config.xaxis?.type === 'datetime';
}

/**
 * Whether datetime labels are drawn in UTC, ApexCharts' default.
 *
 * @param chart - The chart
 * @returns False only when `xaxis.labels.datetimeUTC` is `false`
 */
function isUtc(chart: ApexChartsInstance): boolean {
  return chart.w.config.xaxis?.labels?.datetimeUTC !== false;
}

/**
 * The x position of a point, as the chart reads it.
 *
 * - a datetime axis gives the timestamp, in epoch milliseconds;
 * - a category axis gives the category's label — line, area and combo charts
 *   keep those in `categoryLabels`, bar charts in `labels`;
 * - a numeric axis gives the series' own x value.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @param j     - The point's index
 * @returns The x value
 */
export function xAt(chart: ApexChartsInstance, i: number, j: number): string | number {
  const g = chart.w.globals;
  const own = g.seriesX?.[i]?.[j];
  if (isDatetime(chart)) {
    const stamp = toNumber(own) ?? toNumber(g.labels?.[j]);
    return stamp ?? labelText(g.labels?.[j]);
  }
  if (g.categoryLabels && g.categoryLabels.length > 0) {
    return labelText(g.categoryLabels[j]);
  }
  if (g.isXNumeric && own !== undefined) {
    return toNumber(own) ?? String(own);
  }
  return labelText(g.labels?.[j] ?? own);
}

/**
 * The `Intl.DateTimeFormat` options that describe a set of timestamps: the
 * date, and the time of day as well when any of them is not at midnight.
 *
 * @param chart      - The chart, for its UTC setting
 * @param timestamps - The timestamps to be formatted
 * @returns The options
 */
export function dateOptions(chart: ApexChartsInstance, timestamps: number[]): Intl.DateTimeFormatOptions {
  const utc = isUtc(chart);
  const hasTime = timestamps.some((stamp) => {
    if (utc) {
      return stamp % DAY_MS !== 0;
    }
    const date = new Date(stamp);
    return date.getHours() !== 0 || date.getMinutes() !== 0;
  });
  return {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    ...(utc ? { timeZone: 'UTC' } : {}),
  };
}

/**
 * Formats a timestamp.
 *
 * @param stamp   - Epoch milliseconds
 * @param options - From {@link dateOptions}
 * @returns The formatted date
 */
export function formatDate(stamp: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(stamp).toLocaleString('en-US', options);
}

/**
 * The axis format for a datetime axis carrying epoch milliseconds.
 *
 * @param chart      - The chart
 * @param timestamps - The timestamps the axis carries
 * @returns A `date` format in the chart's time zone
 */
export function dateFormat(chart: ApexChartsInstance, timestamps: number[]): AxisFormat {
  return { type: 'date', dateOptions: dateOptions(chart, timestamps) };
}

/**
 * The marker size a series is drawn with.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @returns The size; `0` means ApexCharts draws no per-point markers
 */
export function markerSize(chart: ApexChartsInstance, i: number): number {
  const size = chart.w.config.markers?.size;
  const value = Array.isArray(size) ? size[i] : size;
  return typeof value === 'number' ? value : 0;
}

/**
 * The stroke curve a series is drawn with.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @returns E.g. `'straight'`, `'smooth'` or `'stepline'`
 */
export function strokeCurve(chart: ApexChartsInstance, i: number): string {
  const curve = chart.w.config.stroke?.curve;
  const value = Array.isArray(curve) ? curve[i] : curve;
  return typeof value === 'string' ? value : 'straight';
}

/**
 * Whether bars, box plots and range bars are drawn horizontally.
 *
 * @param chart - The chart
 * @returns True for `plotOptions.bar.horizontal`
 */
export function isHorizontal(chart: ApexChartsInstance): boolean {
  return Boolean(chart.w.globals.isBarHorizontal ?? chart.w.config.plotOptions?.bar?.horizontal);
}

/**
 * The `x` a series' point was written with, if the point is an object.
 *
 * @param series - A series option
 * @param j      - The point's index
 * @returns The written `x`, or undefined when the point has none
 */
function writtenX(series: unknown, j: number): unknown {
  if (!series || typeof series !== 'object' || !Array.isArray((series as { data?: unknown }).data)) {
    return undefined;
  }
  const point: unknown = (series as { data: unknown[] }).data[j];
  if (point && typeof point === 'object' && !Array.isArray(point) && 'x' in point) {
    return (point as { x: unknown }).x;
  }
  return undefined;
}

/**
 * A point's `x` exactly as the author wrote it, for the data on screen.
 *
 * Read from `w.globals.initialSeries` first: ApexCharts copies the series
 * there on every `updateSeries` and `updateOptions` and keeps a series'
 * data there when the legend hides it. `w.config.series` comes next, and
 * `chart.opts`, which ApexCharts never updates after the chart was created,
 * last — so a chart whose data was replaced is not read with its old names.
 *
 * @param chart - The chart
 * @param i     - The series' index
 * @param j     - The point's index
 * @returns The written `x`, or undefined when the point has none
 */
export function authoredX(chart: ApexChartsInstance, i: number, j: number): unknown {
  const sources = [chart.w.globals.initialSeries, chart.w.config.series, chart.opts?.series];
  for (const source of sources) {
    const series = Array.isArray(source) ? source[i] : undefined;
    if (series !== undefined) {
      return writtenX(series, j);
    }
  }
  return undefined;
}
