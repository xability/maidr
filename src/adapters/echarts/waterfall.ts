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
 */

import type { MaidrLayer, WaterfallKind, WaterfallPoint } from '@type/grammar';
import type { EChartsList, EChartsSeriesModel } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';

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
 * @param seriesModel - The waterfall
 * @param name        - The series' name, when it has one
 * @param axes        - The axis titles
 * @param axes.x      - The category axis' title
 * @param axes.y      - The value axis' title
 * @param selectors   - One selector per step, when its bars were found
 * @returns The layer, or `undefined` when no step was drawn
 */
export function waterfallLayer(
  seriesModel: EChartsSeriesModel,
  name: string,
  axes: { x: string; y: string },
  selectors: string[] | undefined,
): MaidrLayer | undefined {
  const points = steps(seriesModel);
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

function measured(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
