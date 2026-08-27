/**
 * The ECharts series that hand over a summary already computed.
 *
 * A heat grid and a price chart both sit on the cartesian axes the bar family
 * uses, and both differ from it in the same way: a datum is not one magnitude
 * but a set of them, and ECharts has already worked them out. Measured on
 * echarts 6.1.0, the model reports them under named dimensions:
 *
 *     heatmap      ['x', 'y', 'value']
 *     candlestick  ['base', 'open', 'close', 'lowest', 'highest']
 *
 * so neither needs anything recovered from the drawing. Both draw exactly one
 * filled mark per datum -- a cell, a candle body with its wick -- which is the
 * same shape `markPerDatum` already counts and stamps for a bar.
 *
 * Tier 2b of #1195. `boxplot` and `radar` are measured and deliberately left
 * for later: see the note at the foot of this file.
 */

import type {
  CandlestickPoint,
  HeatmapData,
  MaidrLayer,
} from '@type/grammar';
import type { EChartsComponentModel, EChartsSeriesModel } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';

/** The series types this module reads. */
export const GRID_VALUE: ReadonlySet<string> = new Set([
  'heatmap',
  'candlestick',
]);

/** The category names an axis was drawn with, in axis order. */
export interface AxisCategories {
  x: string[];
  y: string[];
}

/** The titles the chart wrote beside each axis. */
export interface AxisNames {
  x: string;
  y: string;
}

/**
 * Reads a category axis' own labels.
 *
 * @param axis - The axis component, when the chart declared one
 * @returns The labels in axis order, empty when the axis carries numbers
 */
export function categoriesOf(axis: EChartsComponentModel | undefined): string[] {
  const data = axis?.get('data');
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(entry => (typeof entry === 'string' ? entry : String(entry)));
}

/**
 * Builds the layer for one heatmap series.
 *
 * ECharts numbers a cell by **axis index**, not by name, and a category y
 * axis runs bottom-up -- measured, a 2x2 grid reports its four cells as
 * `[0,0]`, `[0,1]`, `[1,0]`, `[1,1]` with `y = 0` at the bottom.
 * `HeatmapData.y` and `points` are top-first, so the rows are turned over on
 * the way out.
 *
 * A cell the chart drew nothing at stays `null` rather than becoming a zero:
 * a grid is a rectangle and the data need not fill it (#1191).
 *
 * @param seriesModel - The series to read
 * @param axes        - The category names of both axes
 * @param names       - The axis titles
 * @param selectorFor - One selector per drawn cell, in data order
 * @returns The layer, or `undefined` when the grid has no named axes to sit on
 */
export function heatmapLayer(
  seriesModel: EChartsSeriesModel,
  axes: AxisCategories,
  names: AxisNames,
  selectorFor: string[] | undefined,
): MaidrLayer | undefined {
  if (axes.x.length === 0 || axes.y.length === 0) {
    return undefined;
  }

  const rows = axes.y.length;
  const columns = axes.x.length;
  const points: (number | null)[][] = Array.from(
    { length: rows },
    () => Array.from({ length: columns }, () => null),
  );
  const grid: (string | null)[][] = Array.from(
    { length: rows },
    () => Array.from({ length: columns }, () => null),
  );

  placedCells(seriesModel, axes).forEach((cell, drawn) => {
    // `points` is top-first and `cell.row` counts up from the bottom.
    points[rows - 1 - cell.row][cell.column] = cell.value;
    grid[cell.row][cell.column] = selectorFor?.[drawn] ?? null;
  });

  const named = seriesModel.get('name');
  const name = typeof named === 'string' ? named : '';
  const payload: HeatmapData = { x: axes.x, y: [...axes.y].reverse(), points };

  return {
    id: nextId('layer'),
    type: TraceType.HEATMAP,
    ...(name ? { name } : {}),
    ...(selectorFor ? { selectors: grid } : {}),
    axes: {
      x: { label: names.x || undefined },
      y: { label: names.y || undefined },
    },
    data: payload,
  };
}

/**
 * How many cells a heatmap series actually drew.
 *
 * @param seriesModel - The series to read
 * @param axes        - The category names of both axes
 * @returns The number of cells that carry a value inside the grid
 */
export function drawnGridCount(
  seriesModel: EChartsSeriesModel,
  axes: AxisCategories,
): number {
  return placedCells(seriesModel, axes).length;
}

/** One cell that was drawn, at the axis indices ECharts placed it by. */
interface PlacedCell {
  row: number;
  column: number;
  value: number;
}

/**
 * The cells a heatmap series drew, in data order.
 *
 * The count check and the layer ask the same question -- which cells reached
 * the page -- so they ask it in one place. Two copies of this predicate would
 * agree until one of them was edited, and the disagreement would show up as a
 * selector list one longer than the marks it addresses: every cell after the
 * first divergence outlined one place off, silently.
 *
 * A cell is drawn when it has whole, non-negative coordinates, a finite
 * value, and a place inside the axes. Each of those was measured against a
 * real chart: `[0.5, 0.5]` and `[5, 5]` on a 2x2 grid are both kept in the
 * model, and a `null` or `'-'` value is kept as `null`.
 *
 * @param seriesModel - The series to read
 * @param axes        - The category names of both axes
 * @returns One entry per drawn cell, in the order the data declared them
 */
function placedCells(
  seriesModel: EChartsSeriesModel,
  axes: AxisCategories,
): PlacedCell[] {
  const data = seriesModel.getData();
  const cells: PlacedCell[] = [];
  for (let index = 0; index < data.count(); index++) {
    const column = whole(data.get('x', index));
    const row = whole(data.get('y', index));
    const value = data.get('value', index);
    if (column === null || row === null || !measured(value)) {
      continue;
    }
    if (row >= axes.y.length || column >= axes.x.length) {
      continue;
    }
    cells.push({ row, column, value });
  }
  return cells;
}

/**
 * Builds the layer for one candlestick series.
 *
 * ECharts hands over the four prices already named -- `open`, `close`,
 * `lowest`, `highest` -- so nothing is recovered from the drawing. The
 * period's label comes from the category axis through `getName`, the way
 * every other categorical reading here takes it.
 *
 * `volatility` is the day's range, which is the convention every other
 * candlestick producer in this tree uses.
 *
 * The selectors go in `CandlestickSelector.body` and not in a bare list.
 * `Candlestick.mapToSvgElements` reads an array as the *legacy* shape -- one
 * selector for the whole chart -- and takes `selectors[0]` for every candle,
 * so a per-candle list would outline the first candle wherever the reader
 * stood. Only `body` is filled: ECharts draws a candle as one path holding
 * the body and its wick together, so there is no separate element to name a
 * wick with, and the trace derives what it can from the body.
 *
 * @param seriesModel - The series to read
 * @param names       - The axis titles
 * @param selectors   - One selector per drawn candle, in data order
 * @returns The layer
 */
export function candlestickLayer(
  seriesModel: EChartsSeriesModel,
  names: AxisNames,
  selectors: string[] | undefined,
): MaidrLayer {
  const data = seriesModel.getData();
  const points: CandlestickPoint[] = [];

  for (let index = 0; index < data.count(); index++) {
    const candle = pricesOf(seriesModel, index);
    if (!candle) {
      continue;
    }
    points.push({
      value: data.getName(index) || `${index + 1}`,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volatility: candle.high - candle.low,
    });
  }

  const named = seriesModel.get('name');
  const name = typeof named === 'string' ? named : '';

  return {
    id: nextId('layer'),
    type: TraceType.CANDLESTICK,
    ...(name ? { name } : {}),
    ...(selectors ? { selectors: { body: selectors } } : {}),
    axes: {
      x: { label: names.x || undefined },
      y: { label: names.y || undefined },
    },
    data: points,
  };
}

/**
 * How many candles a series actually drew.
 *
 * @param seriesModel - The series to read
 * @returns The number of periods that carry all four prices
 */
export function drawnCandleCount(seriesModel: EChartsSeriesModel): number {
  const data = seriesModel.getData();
  let drawn = 0;
  for (let index = 0; index < data.count(); index++) {
    if (pricesOf(seriesModel, index)) {
      drawn += 1;
    }
  }
  return drawn;
}

/**
 * One period's four prices, when it carries all of them.
 *
 * A candle needs every one to be drawn at all, so a period missing any is a
 * period the chart put nothing on the page for.
 *
 * @param seriesModel - The series to read
 * @param index       - Which period to read
 * @returns The four prices, or `undefined` when one is missing
 */
function pricesOf(
  seriesModel: EChartsSeriesModel,
  index: number,
): { open: number; close: number; low: number; high: number } | undefined {
  const data = seriesModel.getData();
  const open = data.get('open', index);
  const close = data.get('close', index);
  const low = data.get('lowest', index);
  const high = data.get('highest', index);

  if (!measured(open) || !measured(close) || !measured(low) || !measured(high)) {
    return undefined;
  }
  return { open, close, low, high };
}

function measured(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * An axis index, which is what a heatmap datum carries in place of a name.
 *
 * @param value - The coordinate as the model reports it
 * @returns The index, or `null` when it is not a whole number
 */
function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

/*
 * `boxplot` is the one series type still refused, because of how it is drawn
 * rather than what it carries.
 *
 * A **box plot** hands over its five-number summary outright --
 * `['base', 'min', 'Q1', 'median', 'Q3', 'max']` -- so the reading is easy and
 * the highlighting is not: `BoxSelector` wants a selector per part (the
 * whiskers, the box, the median, each outlier), and ECharts draws the whole
 * box and both whiskers as **one path**. There is nothing to name the parts
 * with. It is also painted `#fff`, which this adapter's paint filter counts as
 * furniture, so it would fail the mark check even if the shape fitted.
 *
 * A **radar** used to stand here beside it, and the reason recorded for it
 * was wrong. It said a two-series radar draws six vertex symbols plus a ring
 * background that is neither furniture nor white, so seven marks are found
 * where six are expected. That counts the wrong mark class: `RadarTrace`
 * wants one selector per *series*, and the filled marks are one per *vertex*
 * -- three per series -- so they never fitted, ring background or not. The
 * series outline is a **stroked** polyline, one per series, weighted and in
 * the series colour, which is the shape `markPerSeries()` already finds for
 * a line. See `radar.ts`; it is read, and highlighted.
 */
