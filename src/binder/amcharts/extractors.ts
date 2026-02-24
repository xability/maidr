/**
 * Data extraction functions that convert amCharts 5 series data
 * into MAIDR-compatible data point arrays.
 */

import type {
  BarPoint,
  CandlestickPoint,
  CandlestickTrend,
  LinePoint,
  ScatterPoint,
} from '@type/grammar';
import type { AmAxis, AmDataItem, AmXYSeries } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a string label from an axis, falling back to `"x"` / `"y"`.
 */
export function readAxisLabel(axis: AmAxis | undefined, fallback: string): string {
  if (!axis)
    return fallback;

  const titleEntity = axis.get('title');
  if (titleEntity != null && typeof (titleEntity as Record<string, unknown>).get === 'function') {
    const text = (titleEntity as { get: (k: string) => unknown }).get('text');
    if (typeof text === 'string' && text.length > 0)
      return text;
  }

  const name = axis.get('name');
  if (typeof name === 'string' && name.length > 0)
    return name;
  return fallback;
}

/**
 * Determine whether a series is category-based (bar/column) vs. value-based (scatter).
 */
function hasCategoryX(series: AmXYSeries): boolean {
  return typeof series.get('categoryXField') === 'string';
}

function hasCategoryY(series: AmXYSeries): boolean {
  return typeof series.get('categoryYField') === 'string';
}

// ---------------------------------------------------------------------------
// Column / Bar extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link BarPoint} data from a column or bar series.
 */
export function extractBarPoints(series: AmXYSeries): BarPoint[] {
  const points: BarPoint[] = [];

  const isHorizontal = hasCategoryY(series);
  const categoryField = isHorizontal ? 'categoryY' : 'categoryX';
  const valueField = isHorizontal ? 'valueX' : 'valueY';

  for (const item of series.dataItems) {
    const category = item.get(categoryField);
    const value = item.get(valueField);

    if (category == null || value == null)
      continue;

    points.push({
      x: isHorizontal ? toNumber(value) : toStringOrNumber(category),
      y: isHorizontal ? toStringOrNumber(category) : toNumber(value),
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Line extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link LinePoint} data from a single line series.
 * Returns a flat array of points for one series. The adapter aggregates
 * multiple series into the 2D array (`LinePoint[][]`) that MAIDR expects.
 */
export function extractLinePoints(series: AmXYSeries): LinePoint[] {
  const seriesName = series.get('name') as string | undefined;
  const points: LinePoint[] = [];

  for (const item of series.dataItems) {
    const x = readXValue(item, series);
    const y = item.get('valueY');

    if (x == null || y == null)
      continue;

    const point: LinePoint = { x: toStringOrNumber(x), y: toNumber(y) };
    if (seriesName)
      point.fill = seriesName;
    points.push(point);
  }

  return points;
}

// ---------------------------------------------------------------------------
// Scatter extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link ScatterPoint} data from a value-value (scatter) series.
 */
export function extractScatterPoints(series: AmXYSeries): ScatterPoint[] {
  const points: ScatterPoint[] = [];

  for (const item of series.dataItems) {
    const x = item.get('valueX');
    const y = item.get('valueY');

    if (x == null || y == null)
      continue;

    points.push({ x: toNumber(x), y: toNumber(y) });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Candlestick extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link CandlestickPoint} data from a candlestick series.
 */
export function extractCandlestickPoints(series: AmXYSeries): CandlestickPoint[] {
  const points: CandlestickPoint[] = [];

  for (const item of series.dataItems) {
    const label = readXValue(item, series);
    const open = item.get('openValueY');
    const high = item.get('highValueY');
    const low = item.get('lowValueY');
    const close = item.get('valueY');
    const volume = item.get('valueX'); // volume sometimes on X

    if (open == null || close == null)
      continue;

    const openNum = toNumber(open);
    const closeNum = toNumber(close);
    const highNum = high != null ? toNumber(high) : Math.max(openNum, closeNum);
    const lowNum = low != null ? toNumber(low) : Math.min(openNum, closeNum);

    let trend: CandlestickTrend = 'Neutral';
    if (closeNum > openNum)
      trend = 'Bull';
    else if (closeNum < openNum)
      trend = 'Bear';

    points.push({
      value: label != null ? String(label) : '',
      open: openNum,
      high: highNum,
      low: lowNum,
      close: closeNum,
      volume: volume != null ? toNumber(volume) : 0,
      trend,
      volatility: highNum - lowNum,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Series type detection
// ---------------------------------------------------------------------------

/** Recognized amCharts 5 series class names. */
const COLUMN_CLASSES = new Set([
  'ColumnSeries',
  'CurvedColumnSeries',
]);

const LINE_CLASSES = new Set([
  'LineSeries',
  'SmoothedXLineSeries',
  'SmoothedYLineSeries',
  'SmoothedXYLineSeries',
  'StepLineSeries',
]);

const CANDLESTICK_CLASSES = new Set([
  'CandlestickSeries',
  'OHLCSeries',
]);

export type SeriesKind = 'bar' | 'line' | 'scatter' | 'candlestick' | 'unknown';

/**
 * Determine the MAIDR trace kind for a given amCharts series.
 */
export function classifySeriesKind(series: AmXYSeries): SeriesKind {
  const className = series.className ?? '';

  if (CANDLESTICK_CLASSES.has(className))
    return 'candlestick';
  if (COLUMN_CLASSES.has(className))
    return 'bar';
  if (LINE_CLASSES.has(className)) {
    // A "line" series with value-only axes (no category) is still a line in MAIDR.
    return 'line';
  }

  // Fallback heuristic: if both X and Y are value fields → scatter.
  if (!hasCategoryX(series) && !hasCategoryY(series))
    return 'scatter';

  // Default to bar for category-based series.
  return 'bar';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function readXValue(item: AmDataItem, series: AmXYSeries): unknown {
  // Try category first, then numeric value.
  const cat = item.get('categoryX');
  if (cat != null)
    return cat;
  const val = item.get('valueX');
  if (val != null)
    return val;

  // Date axis: amCharts stores Date objects.
  const dateX = item.get('dateX');
  if (dateX instanceof Date)
    return dateX.toISOString();

  // Try reading from the category field name.
  const fieldName = series.get('categoryXField') as string | undefined;
  if (fieldName)
    return item.get(fieldName);

  return undefined;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toStringOrNumber(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value))
    return value;
  return String(value ?? '');
}
