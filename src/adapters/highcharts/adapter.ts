/**
 * Core adapter that converts a Highcharts chart instance into MAIDR-compatible
 * data. The returned {@link Maidr} object can be passed directly to the
 * `<Maidr data={...}>` React component or serialized as a `maidr-data`
 * HTML attribute.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { highchartsToMaidr } from 'maidr/highcharts';
 *
 * const chart = Highcharts.chart('container', { ... });
 * const maidrData = highchartsToMaidr(chart);
 * ```
 */

import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  CandlestickTrend,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '../../type/grammar';
import type { HighchartsChart, HighchartsPoint, HighchartsSeries } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import {
  barSelector,
  boxplotSelector,
  candlestickSelector,
  ensureContainerId,
  heatmapSelector,
  histogramSelector,
  lineSelectors,
  scatterSelector,
} from './selectors';

/**
 * Options for customizing the adapter output.
 */
export interface HighchartsAdapterOptions {
  /** Override the generated chart ID. Defaults to `highcharts-{n}`. */
  id?: string;
  /** Override the chart title. Defaults to `chart.title.textStr`. */
  title?: string;
  /** Convert only specific series by index. Default: all visible series. */
  seriesIndices?: number[];
}

let chartCounter = 0;

/**
 * Converts a rendered Highcharts chart into a MAIDR data structure.
 *
 * The chart must already be rendered (i.e. the SVG DOM exists) so that
 * CSS selectors can be generated for element highlighting.
 *
 * Supported Highcharts series types:
 * - `bar`, `column` → {@link TraceType.BAR}
 * - `line`, `spline`, `area`, `areaspline` → {@link TraceType.LINE}
 * - `scatter` → {@link TraceType.SCATTER}
 * - `boxplot` → {@link TraceType.BOX}
 * - `heatmap` → {@link TraceType.HEATMAP}
 * - `histogram` → {@link TraceType.HISTOGRAM}
 * - `candlestick`, `ohlc` → {@link TraceType.CANDLESTICK}
 * - Stacked `column`/`bar` → {@link TraceType.STACKED}
 * - Grouped (dodged) `column`/`bar` → {@link TraceType.DODGED}
 * - Percent-stacked `column`/`bar` → {@link TraceType.NORMALIZED}
 *
 * @param chart - A Highcharts chart instance (the return value of `Highcharts.chart()`).
 * @param options - Optional overrides for ID, title, or series filtering.
 * @returns A {@link Maidr} object ready for use with the MAIDR library.
 */
export function highchartsToMaidr(
  chart: HighchartsChart,
  options?: HighchartsAdapterOptions,
): Maidr {
  const id = options?.id ?? `highcharts-${chartCounter++}`;
  const title = options?.title ?? chart.title?.textStr ?? '';
  const subtitle = chart.subtitle?.textStr;
  const caption = chart.caption?.textStr;

  const containerId = ensureContainerId(chart);

  const seriesToConvert = filterSeries(chart, options?.seriesIndices);

  // Categorize series by how they need to be converted.
  const lineTypes = new Set(['line', 'spline', 'area', 'areaspline']);
  const barTypes = new Set(['bar', 'column']);

  const lineSeries = seriesToConvert.filter(s => lineTypes.has(resolveSeriesType(s, chart)));
  const barSeries = seriesToConvert.filter(s => barTypes.has(resolveSeriesType(s, chart)));
  const otherSeries = seriesToConvert.filter(
    s => !lineTypes.has(resolveSeriesType(s, chart)) && !barTypes.has(resolveSeriesType(s, chart)),
  );

  const layers: MaidrLayer[] = [];

  // Convert bar/column series — may be stacked, dodged, or normalized.
  if (barSeries.length > 0) {
    layers.push(...convertBarGroup(barSeries, chart, containerId));
  }

  // Convert non-line/non-bar series individually.
  for (const series of otherSeries) {
    const layer = convertSeries(series, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  // Convert line series together as a single multi-line layer (MAIDR expects LinePoint[][]).
  if (lineSeries.length > 0) {
    const layer = convertLineSeries(lineSeries, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  const subplot: MaidrSubplot = { layers };

  // Add legend labels when multiple layers are present, aligned to layers.
  if (layers.length > 1) {
    subplot.legend = layers.map(l => l.title ?? `Series ${l.id}`);
  }

  return {
    id,
    title,
    subtitle,
    caption,
    subplots: [[subplot]],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterSeries(
  chart: HighchartsChart,
  indices?: number[],
): HighchartsSeries[] {
  if (!indices) {
    return chart.series.filter(s => s.visible);
  }

  const result: HighchartsSeries[] = [];
  for (const i of indices) {
    const series = chart.series[i];
    if (!series) {
      console.warn(`[MAIDR Highcharts] Series index ${i} does not exist; skipping.`);
      continue;
    }
    if (!series.visible) {
      console.warn(`[MAIDR Highcharts] Series index ${i} ("${series.name}") is hidden; skipping.`);
      continue;
    }
    result.push(series);
  }
  return result;
}

function resolveSeriesType(series: HighchartsSeries, chart: HighchartsChart): string {
  return series.type || series.options.type || chart.options.chart?.type || 'line';
}

function getAxisLabel(series: HighchartsSeries, axis: 'x' | 'y'): string {
  const axisObj = axis === 'x' ? series.xAxis : series.yAxis;
  return axisObj?.options?.title?.text ?? (axis === 'x' ? 'X' : 'Y');
}

function pointLabel(point: HighchartsPoint): string | number {
  return point.category ?? point.name ?? point.x;
}

/**
 * Determines the stacking mode for a series by checking series-level then chart-level options.
 */
function getStackingMode(series: HighchartsSeries, chart: HighchartsChart): string | undefined {
  // Series-level stacking takes precedence.
  if (series.options.stacking) {
    return series.options.stacking;
  }

  // Chart-level plotOptions.
  const seriesType = resolveSeriesType(series, chart);
  const plotOptions = chart.options.plotOptions;
  if (seriesType === 'column' && plotOptions?.column?.stacking) {
    return plotOptions.column.stacking;
  }
  if (seriesType === 'bar' && plotOptions?.bar?.stacking) {
    return plotOptions.bar.stacking;
  }
  return plotOptions?.series?.stacking;
}

// ---------------------------------------------------------------------------
// Bar / Column group handler (stacked, dodged, normalized)
// ---------------------------------------------------------------------------

function convertBarGroup(
  barSeries: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer[] {
  if (barSeries.length === 0)
    return [];

  const first = barSeries[0];

  // Check stacking mode across all series and warn on inconsistencies.
  const stackingModes = barSeries.map(s => getStackingMode(s, chart));
  const uniqueModes = [...new Set(stackingModes)];
  if (uniqueModes.length > 1) {
    console.warn(
      `[MAIDR Highcharts] Inconsistent stacking modes across bar series: ${
        JSON.stringify(uniqueModes)}. Using mode from first series.`,
    );
  }
  const stacking = stackingModes[0];

  const isInverted = chart.options.chart?.inverted === true;
  const seriesType = resolveSeriesType(first, chart);
  const defaultOrientation = seriesType === 'bar' ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  const orientation = isInverted
    ? (defaultOrientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL)
    : defaultOrientation;

  // Single series: always a plain bar chart.
  if (barSeries.length === 1) {
    return [convertSingleBar(first, containerId, orientation)];
  }

  // Multiple series with stacking.
  if (stacking === 'normal') {
    return [convertStackedBar(barSeries, containerId, orientation, TraceType.STACKED)];
  }
  if (stacking === 'percent') {
    return [convertStackedBar(barSeries, containerId, orientation, TraceType.NORMALIZED)];
  }

  // Multiple series without stacking → dodged (grouped).
  return [convertDodgedBar(barSeries, containerId, orientation)];
}

function convertSingleBar(
  series: HighchartsSeries,
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.BAR,
    title: series.name || undefined,
    orientation,
    selectors: barSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts multiple bar/column series with `stacking: 'normal'` or `'percent'`
 * into a MAIDR segmented (stacked/normalized) layer.
 *
 * MAIDR expects `SegmentedPoint[][]` where each inner array is one group
 * (one fill/category level) and points within share x-axis categories.
 */
function convertStackedBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
  traceType: TraceType.STACKED | TraceType.NORMALIZED,
): MaidrLayer {
  // Each series is one "group" (fill level). Points within share x-categories.
  const data: SegmentedPoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: traceType === TraceType.NORMALIZED ? (p.percentage ?? (p.y as number)) : (p.y as number),
        fill: series.name,
      })),
  );

  const first = seriesList[0];
  // Combine selectors for all series — MAIDR's SegmentedTrace expects a single selector string.
  const selectors = seriesList
    .map(s => barSelector(containerId, s.index))
    .join(', ');

  return {
    id: String(first.index),
    type: traceType,
    title: first.name || undefined,
    orientation,
    selectors,
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * Converts multiple bar/column series without stacking into a MAIDR dodged layer.
 *
 * Dodged bars share x-categories but are placed side by side. MAIDR expects
 * `SegmentedPoint[][]` (same as stacked, but with `TraceType.DODGED`).
 */
function convertDodgedBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  const data: SegmentedPoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: p.y as number,
        fill: series.name,
      })),
  );

  const first = seriesList[0];
  const selectors = seriesList
    .map(s => barSelector(containerId, s.index))
    .join(', ');

  return {
    id: String(first.index),
    type: TraceType.DODGED,
    title: first.name || undefined,
    orientation,
    selectors,
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Individual series converters
// ---------------------------------------------------------------------------

function convertSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  const seriesType = resolveSeriesType(series, chart);

  switch (seriesType) {
    case 'scatter':
      return convertScatterSeries(series, containerId);
    case 'boxplot':
      return convertBoxSeries(series, containerId);
    case 'heatmap':
      return convertHeatmapSeries(series, chart, containerId);
    case 'histogram':
      return convertHistogramSeries(series, containerId);
    case 'candlestick':
    case 'ohlc':
      return convertCandlestickSeries(series, containerId);
    default:
      console.warn(`[MAIDR Highcharts] Unsupported series type: "${seriesType}"; skipping.`);
      return null;
  }
}

function convertLineSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: p.y as number,
        fill: series.name || undefined,
      })),
  );

  const first = seriesList[0];
  const selectors = lineSelectors(containerId, seriesList.map(s => s.index));

  // Use a combined title for multi-line layers so all series are represented.
  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: TraceType.LINE,
    title: layerTitle,
    selectors,
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

function convertScatterSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: ScatterPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: p.x,
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.SCATTER,
    title: series.name || undefined,
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

function convertBoxSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BoxPoint[] = series.data.map((p, i) => {
    const missing: string[] = [];
    if (p.low == null)
      missing.push('low');
    if (p.q1 == null)
      missing.push('q1');
    if (p.median == null)
      missing.push('median');
    if (p.q3 == null)
      missing.push('q3');
    if (p.high == null)
      missing.push('high');

    if (missing.length > 0) {
      console.warn(
        `[MAIDR Highcharts] Boxplot series "${series.name}" point ${i}: missing ${missing.join(', ')}; defaulting to 0.`,
      );
    }

    return {
      fill: p.category ?? p.name ?? String(p.x),
      lowerOutliers: [],
      min: p.low ?? 0,
      q1: p.q1 ?? 0,
      q2: p.median ?? 0,
      q3: p.q3 ?? 0,
      max: p.high ?? 0,
      upperOutliers: [],
    };
  });

  return {
    id: String(series.index),
    type: TraceType.BOX,
    title: series.name || undefined,
    selectors: boxplotSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

function convertHeatmapSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const xCategories = chart.xAxis[0]?.categories ?? [];
  const yCategories = chart.yAxis[0]?.categories ?? [];

  // Determine grid dimensions. If numeric axes are used, infer from data.
  let rows = yCategories.length;
  let cols = xCategories.length;

  if (rows === 0 || cols === 0) {
    // Numeric axes — determine grid size from actual data indices.
    let maxX = 0;
    let maxY = 0;
    for (const p of series.data) {
      if (p.y !== null) {
        maxX = Math.max(maxX, Math.round(p.x));
        maxY = Math.max(maxY, Math.round(p.y));
      }
    }
    if (cols === 0)
      cols = maxX + 1;
    if (rows === 0)
      rows = maxY + 1;
  }

  // Build 2D points grid: points[y][x], initialized to 0.
  const points: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0));

  for (const p of series.data) {
    if (p.y === null)
      continue;

    const xIdx = Math.round(p.x);
    const yIdx = Math.round(p.y);
    if (yIdx < 0 || yIdx >= rows || xIdx < 0 || xIdx >= cols)
      continue;

    // Heatmap cell value lives in `point.options.value` (colorAxis metric).
    // Falls back to the point's `value` property if available.
    const opts = p.options ?? {};
    const cellValue = typeof opts.value === 'number'
      ? opts.value
      : (typeof opts.colorValue === 'number' ? opts.colorValue : null);

    // Only use p.y as fallback when it genuinely represents the cell value
    // (single-row heatmaps where y IS the value); otherwise default to 0.
    points[yIdx][xIdx] = cellValue ?? 0;
  }

  const data: HeatmapData = {
    x: xCategories.length > 0
      ? xCategories
      : Array.from({ length: cols }, (_, i) => String(i)),
    y: yCategories.length > 0
      ? yCategories
      : Array.from({ length: rows }, (_, i) => String(i)),
    points,
  };

  return {
    id: String(series.index),
    type: TraceType.HEATMAP,
    title: series.name || undefined,
    selectors: heatmapSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

function convertHistogramSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: HistogramPoint[] = series.data
    .filter(p => p.y !== null)
    .map((p) => {
      const opts = p.options ?? {};
      // Highcharts histogram points have `x` (bin start) and `x2` (bin end).
      const binStart = typeof opts.x === 'number' ? opts.x : p.x;
      const binEnd = typeof opts.x2 === 'number' ? opts.x2 : binStart;
      return {
        x: pointLabel(p),
        y: p.y as number,
        xMin: binStart as number,
        xMax: binEnd as number,
        yMin: 0,
        yMax: p.y as number,
      };
    });

  return {
    id: String(series.index),
    type: TraceType.HISTOGRAM,
    title: series.name || undefined,
    selectors: histogramSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a Highcharts candlestick or OHLC series into MAIDR CandlestickPoint data.
 */
function convertCandlestickSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: CandlestickPoint[] = series.data
    .filter(p => p.open != null && p.close != null)
    .map((p) => {
      const open = p.open!;
      const close = p.close!;
      const high = p.high ?? Math.max(open, close);
      const low = p.low ?? Math.min(open, close);

      let trend: CandlestickTrend = 'Neutral';
      if (close > open)
        trend = 'Bull';
      else if (close < open)
        trend = 'Bear';

      return {
        value: p.category ?? p.name ?? String(p.x),
        open,
        high,
        low,
        close,
        volume: typeof p.options?.volume === 'number' ? p.options.volume : 0,
        trend,
        volatility: high - low,
      };
    });

  return {
    id: String(series.index),
    type: TraceType.CANDLESTICK,
    title: series.name || undefined,
    selectors: candlestickSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}
