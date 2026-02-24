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
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '../../type/grammar';
import type { HighchartsChart, HighchartsPoint, HighchartsSeries } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import {
  barSelector,
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

  // Group series by type to handle multi-line charts correctly.
  const lineTypes = new Set(['line', 'spline', 'area', 'areaspline']);
  const lineSeries = seriesToConvert.filter(s => lineTypes.has(resolveSeriesType(s, chart)));
  const nonLineSeries = seriesToConvert.filter(s => !lineTypes.has(resolveSeriesType(s, chart)));

  const layers: MaidrLayer[] = [];

  // Convert non-line series individually.
  for (const series of nonLineSeries) {
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

  // Add legend labels when multiple series are present.
  if (seriesToConvert.length > 1) {
    subplot.legend = seriesToConvert.map(s => s.name);
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
  const all = indices
    ? indices.map(i => chart.series[i]).filter(Boolean)
    : chart.series;
  return all.filter(s => s.visible);
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

// ---------------------------------------------------------------------------
// Series converters
// ---------------------------------------------------------------------------

function convertSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  const seriesType = resolveSeriesType(series, chart);

  switch (seriesType) {
    case 'bar':
      return convertBarOrColumn(series, chart, containerId, Orientation.HORIZONTAL);
    case 'column':
      return convertBarOrColumn(series, chart, containerId, Orientation.VERTICAL);
    case 'scatter':
      return convertScatterSeries(series, containerId);
    case 'boxplot':
      return convertBoxSeries(series, containerId);
    case 'heatmap':
      return convertHeatmapSeries(series, chart, containerId);
    case 'histogram':
      return convertHistogramSeries(series, containerId);
    default:
      return null;
  }
}

function convertBarOrColumn(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
  defaultOrientation: Orientation,
): MaidrLayer {
  const isInverted = chart.options.chart?.inverted === true;
  const orientation = isInverted
    ? (defaultOrientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL)
    : defaultOrientation;

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
  const selectors = lineSelectors(
    containerId,
    seriesList.map(s => s.index),
  );

  return {
    id: String(first.index),
    type: TraceType.LINE,
    title: first.name || undefined,
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
  const data: BoxPoint[] = series.data
    .map(p => ({
      fill: p.category ?? p.name ?? String(p.x),
      lowerOutliers: [],
      min: p.low ?? 0,
      q1: p.q1 ?? 0,
      q2: p.median ?? 0,
      q3: p.q3 ?? 0,
      max: p.high ?? 0,
      upperOutliers: [],
    }));

  return {
    id: String(series.index),
    type: TraceType.BOX,
    title: series.name || undefined,
    selectors: `#${containerId} .highcharts-series-${series.index} g.highcharts-point`,
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

  // Build 2D points grid: points[y][x]
  const rows = yCategories.length || 1;
  const cols = xCategories.length || 1;
  const points: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0));

  for (const p of series.data) {
    if (p.y !== null) {
      const xIdx = Math.round(p.x);
      const yIdx = Math.round(p.y);
      if (yIdx >= 0 && yIdx < rows && xIdx >= 0 && xIdx < cols) {
        const value = p.options?.value;
        points[yIdx][xIdx] = typeof value === 'number' ? value : (p.y as number);
      }
    }
  }

  const data: HeatmapData = {
    x: xCategories.length > 0 ? xCategories : Array.from({ length: cols }, (_, i) => String(i)),
    y: yCategories.length > 0 ? yCategories : Array.from({ length: rows }, (_, i) => String(i)),
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
      const x2 = typeof opts.x2 === 'number' ? opts.x2 : p.x + 1;
      return {
        x: pointLabel(p),
        y: p.y as number,
        xMin: p.x,
        xMax: x2 as number,
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
