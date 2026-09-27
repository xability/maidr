/**
 * A waterfall drawn with a `custom` series.
 *
 * ECharts has no waterfall series. Metabase draws one with a `custom`
 * series that encodes **two** columns onto the value axis -- measured on
 * 0.63, `encode: { x: '\0_x', y: ['start', 'end'] }` over a dataset whose
 * rows hold each step's running total before and after it -- and paints a
 * floating bar between them with its own `renderItem`. Read without this,
 * the chart's only readable series was its separate "Total" bar, and a
 * reader heard one number for a chart of six (#1304).
 *
 * A `custom` series is otherwise a blank canvas for its author's drawing
 * code, so only that shape is read: two columns on the value axis, which is
 * a range and nothing else. Any other `custom` series is left unread, as
 * every `custom` series was before.
 *
 * The other waterfall ECharts is used for is its own documented recipe, and
 * Superset's: a stack of bars whose first series is a transparent
 * placeholder lifting each visible bar to where its step starts. Read as the
 * stack it is, it was announced with an "Assist" segment no reader can see,
 * and nothing said which steps rose and which fell (#1304). See
 * {@link placeholderWaterfall}.
 */

import type { MaidrLayer, WaterfallKind, WaterfallPoint } from '@type/grammar';
import type { EChartsList, EChartsSeriesModel } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';
import { dimensionOf } from './dimension';
import { instant } from './multiAxis';

/**
 * The two columns a custom series draws a range between, when it is one.
 *
 * @param data - The series' data list
 * @returns The `[start, end]` columns, or `undefined` for any other shape
 */
function rangeColumns(data: EChartsList): [string, string] | undefined {
  const columns = data.mapDimensionsAll?.('y') ?? [];
  return columns.length === 2 ? [columns[0], columns[1]] : undefined;
}

/**
 * Whether a series is a waterfall this module reads.
 *
 * @param seriesModel - The series to test
 * @returns True for a `custom` series ranging over two value columns
 */
export function isRangeWaterfall(seriesModel: EChartsSeriesModel): boolean {
  return seriesModel.subType === 'custom' && rangeColumns(seriesModel.getData()) !== undefined;
}

/**
 * The steps a range waterfall drew: one per datum with both ends.
 *
 * @param seriesModel - The waterfall
 * @returns One step per drawn bar, in data order
 */
function steps(seriesModel: EChartsSeriesModel): WaterfallPoint[] {
  const data = seriesModel.getData();
  const columns = rangeColumns(data);
  if (!columns) {
    return [];
  }

  const points: WaterfallPoint[] = [];
  for (let index = 0; index < data.count(); index++) {
    const start = data.get(columns[0], index);
    const end = data.get(columns[1], index);
    if (!measured(start) || !measured(end)) {
      continue;
    }
    points.push({
      x: data.getName(index) || index,
      start,
      end,
      delta: end - start,
      kind: kindOf(start, end, points.length),
    });
  }
  return points;
}

/**
 * How many bars a range waterfall drew.
 *
 * @param seriesModel - The waterfall
 * @returns The number of steps
 */
export function drawnStepCount(seriesModel: EChartsSeriesModel): number {
  return steps(seriesModel).length;
}

/**
 * What a step does to the running total.
 *
 * A total restates the running total from the baseline, so it is a bar that
 * starts at zero -- after the first step, which starts there too and is a
 * contribution like any other. Measured on Metabase: its closing "Total" row
 * is `start: 0, end: 150`.
 *
 * @param start - The running total before the step
 * @param end   - The running total after it
 * @param order - How many steps came before it
 * @returns The step's kind
 */
function kindOf(start: number, end: number, order: number): WaterfallKind {
  if (order > 0 && start === 0) {
    return 'total';
  }
  return end >= start ? 'increase' : 'decrease';
}

/**
 * Builds the layer for a range waterfall.
 *
 * @param seriesModel - The waterfall, or the steps already read off a stack
 * @param name        - The series' name, when it has one
 * @param axes        - The axis titles
 * @param axes.x      - The category axis' title
 * @param axes.y      - The value axis' title
 * @param selectors   - One selector per step, when its bars were found
 * @returns The layer, or `undefined` when no step was drawn
 */
export function waterfallLayer(
  seriesModel: EChartsSeriesModel | WaterfallPoint[],
  name: string,
  axes: { x: string; y: string },
  selectors: string[] | undefined,
): MaidrLayer | undefined {
  const points = Array.isArray(seriesModel) ? seriesModel : steps(seriesModel);
  if (points.length === 0) {
    return undefined;
  }
  return {
    id: nextId('layer'),
    type: TraceType.WATERFALL,
    ...(name ? { name } : {}),
    ...(selectors ? { selectors } : {}),
    axes: {
      x: { label: axes.x || undefined },
      y: { label: axes.y || undefined },
    },
    data: points,
  };
}

/**
 * Whether one of a bar series' data is painted so it cannot be seen.
 *
 * @param data  - The series' data list
 * @param index - Which datum
 * @returns True when its resolved fill is `transparent`, `none` or clear
 */
export function paintedClear(data: EChartsList, index: number): boolean {
  const style = data.getItemVisual?.(index, 'style');
  const fill = typeof style === 'object' && style !== null ? (style as { fill?: unknown }).fill : undefined;
  if (typeof fill !== 'string') {
    return false;
  }
  const paint = fill.replace(/\s+/g, '').toLowerCase();
  return paint === 'transparent' || paint === 'none' || /^rgba\(.*,0(?:\.0*)?\)$/.test(paint);
}

/**
 * The stack of bars read as a waterfall, when it is one.
 *
 * ECharts' recipe for a waterfall stacks a transparent placeholder under each
 * visible bar. Superset follows it -- measured on 6.1.0, an `Assist` series
 * painted `transparent` item by item under `Increase`, `Decrease` and
 * `Total`, each holding a value only where it draws. So a stack is a
 * waterfall when exactly one of its series is painted clear wherever it
 * lifts something, and every category is drawn by at most one visible bar.
 *
 * Each visible bar spans the placeholder's height to that plus its own. Which
 * way it went is not in the names -- a chart may call them anything -- but in
 * the running total: a step that starts where the last one ended rose, one
 * that ends there fell, and one rising from the baseline to the running total
 * restates it. A stack that follows none of these is not a waterfall, and is
 * read as the stack it is.
 *
 * @param bars       - The chart's bar series, all in one stack
 * @param horizontal - Whether the bars run along x
 * @param utc        - Whether the chart's times are UTC
 * @param marksOf    - One selector per mark a series drew, when found
 * @returns The steps and their selectors, or `undefined` when the stack is
 *   not a waterfall
 */
export function placeholderWaterfall(
  bars: EChartsSeriesModel[],
  horizontal: boolean,
  utc: boolean,
  marksOf: (seriesModel: EChartsSeriesModel) => string[] | undefined,
): { points: WaterfallPoint[]; selectors: string[] | undefined } | undefined {
  const lifts = bars.filter(seriesModel => liftsOnly(seriesModel, horizontal));
  if (bars.length < 2 || lifts.length !== 1) {
    return undefined;
  }
  const lift = lifts[0];
  const shown = bars.filter(seriesModel => seriesModel !== lift);

  const points: WaterfallPoint[] = [];
  const selectors: (string | undefined)[] = [];
  const drawnSoFar = new Map<EChartsSeriesModel, number>();
  const count = lift.getData().count();
  let running: number | undefined;

  for (let index = 0; index < count; index++) {
    const drawing = shown.filter(seriesModel => valueAt(seriesModel, index, horizontal) !== undefined);
    if (drawing.length === 0) {
      continue;
    }
    const bar = drawing[0];
    const height = valueAt(bar, index, horizontal);
    if (drawing.length > 1 || height === undefined || height < 0) {
      return undefined;
    }
    const base = valueAt(lift, index, horizontal) ?? 0;
    const step = stepOf(base, height, running, points.length);
    if (!step) {
      return undefined;
    }
    running = step.end;
    points.push({ x: labelOf(bar.getData(), index, utc), ...step });

    const order = drawnSoFar.get(bar) ?? 0;
    drawnSoFar.set(bar, order + 1);
    selectors.push(marksOf(bar)?.[order]);
  }

  if (points.length === 0) {
    return undefined;
  }
  return {
    points,
    selectors: selectors.every((one): one is string => one !== undefined) ? selectors : undefined,
  };
}

/**
 * Whether a bar series only lifts others: clear wherever it holds anything.
 *
 * @param seriesModel - The series to test
 * @param horizontal  - Whether the bars run along x
 * @returns True for a waterfall's placeholder
 */
function liftsOnly(seriesModel: EChartsSeriesModel, horizontal: boolean): boolean {
  const data = seriesModel.getData();
  let lifted = false;
  for (let index = 0; index < data.count(); index++) {
    const value = valueAt(seriesModel, index, horizontal);
    if (value === undefined || value === 0) {
      continue;
    }
    if (!paintedClear(data, index)) {
      return false;
    }
    lifted = true;
  }
  return lifted;
}

/**
 * Where one visible bar starts and ends, read against the running total.
 *
 * @param base    - Where the placeholder lifts it to
 * @param height  - Its own height
 * @param running - The running total so far, before the first step none
 * @param order   - How many steps came before it
 * @returns The step, or `undefined` when it continues from nothing before it
 */
function stepOf(
  base: number,
  height: number,
  running: number | undefined,
  order: number,
): Omit<WaterfallPoint, 'x'> | undefined {
  const top = base + height;
  if (running === undefined) {
    return { start: base, end: top, delta: height, kind: 'increase' };
  }
  if (order > 0 && base === 0 && near(top, running)) {
    return { start: 0, end: top, delta: top, kind: 'total' };
  }
  if (near(base, running)) {
    return { start: base, end: top, delta: height, kind: 'increase' };
  }
  if (near(top, running)) {
    return { start: top, end: base, delta: -height, kind: 'decrease' };
  }
  return undefined;
}

/**
 * What a step is called along the category axis.
 *
 * Superset hands its waterfall's categories over as epoch milliseconds
 * written as strings -- `'1704067200000'` -- and formats them only for the
 * eye, so a name of twelve or thirteen digits is read as the date it is.
 *
 * @param data  - The bar's data list
 * @param index - Which category
 * @param utc   - Whether the chart's times are UTC
 * @returns The label
 */
function labelOf(data: EChartsList, index: number, utc: boolean): string | number {
  const name = data.getName(index);
  if (/^\d{12,13}$/.test(name)) {
    return instant(Number(name), true, utc);
  }
  return name || index;
}

/**
 * One bar's value at a category, when it drew one.
 *
 * @param seriesModel - The bar series
 * @param index       - Which category
 * @param horizontal  - Whether the bars run along x
 * @returns The value, or `undefined` for a gap
 */
function valueAt(seriesModel: EChartsSeriesModel, index: number, horizontal: boolean): number | undefined {
  const data = seriesModel.getData();
  const value = data.get(horizontal ? dimensionOf(data, 'x', 0) : dimensionOf(data, 'y', 1), index);
  return measured(value) ? value : undefined;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function measured(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
