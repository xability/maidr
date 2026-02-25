/**
 * Extracts data from Chart.js chart instances and converts it to the MAIDR
 * JSON schema format.
 *
 * Supported chart types:
 * - Native: bar (plain/stacked/dodged), line, scatter, bubble, pie, doughnut, radar, polarArea
 * - Plugin: boxplot, candlestick/ohlc, matrix (heatmap)
 * Unsupported types fall back to a bar-chart extraction.
 */

import type { BarPoint, BoxPoint, CandlestickPoint, HeatmapData, LinePoint, Maidr, MaidrLayer, NavigateCallback, ScatterPoint, SegmentedPoint } from '../type/grammar';
import type { ChartJsChart, ChartJsDataValue, MaidrPluginOptions } from './types';
import { Orientation, TraceType } from '../type/grammar';

// ---------------------------------------------------------------------------
// Monotonic ID counter for guaranteed unique IDs
// ---------------------------------------------------------------------------

let nextId = 0;

/**
 * Extracts a complete {@link Maidr} data object from a Chart.js chart instance.
 *
 * @param chart - The Chart.js chart instance to extract data from
 * @param pluginOptions - Optional per-chart plugin options
 * @param onNavigate - Optional callback invoked on data-point navigation
 * @returns A MAIDR data object ready to be passed to `<Maidr data={...}>`
 */
export function extractMaidrData(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  onNavigate?: NavigateCallback,
): Maidr {
  const chartType = chart.config.type;
  const layers = extractLayers(chart, chartType, pluginOptions);

  return {
    id: `maidr-chartjs-${chart.canvas.id || String(nextId++)}`,
    title: pluginOptions?.title ?? getChartTitle(chart),
    subplots: [[{ layers }]],
    ...(onNavigate ? { onNavigate } : {}),
  };
}

// ---------------------------------------------------------------------------
// Title & axis helpers
// ---------------------------------------------------------------------------

function getChartTitle(chart: ChartJsChart): string {
  const titlePlugin = chart.options.plugins?.title as
    | { text?: string | string[] }
    | undefined;
  if (!titlePlugin?.text)
    return 'Chart';
  return Array.isArray(titlePlugin.text) ? titlePlugin.text.join(' ') : titlePlugin.text;
}

function getAxisLabel(
  chart: ChartJsChart,
  axisId: string,
  pluginOptions?: MaidrPluginOptions,
): string {
  const override = axisId === 'x' ? pluginOptions?.axes?.x : pluginOptions?.axes?.y;
  if (override)
    return override;

  const scale = chart.options.scales?.[axisId];
  if (scale?.title?.text)
    return scale.title.text;

  return axisId.toUpperCase();
}

// ---------------------------------------------------------------------------
// Data value helpers
// ---------------------------------------------------------------------------

/** Safely extract a numeric value from heterogeneous Chart.js dataset entries. */
function toNumber(value: ChartJsDataValue): number {
  if (typeof value === 'number')
    return value;
  if (value != null && typeof value === 'object') {
    if ('y' in value && typeof value.y === 'number')
      return value.y;
    if ('v' in value && typeof value.v === 'number')
      return value.v;
  }
  return 0;
}

function isPointValue(v: ChartJsDataValue): v is { x: number; y: number; r?: number } {
  return v != null && typeof v === 'object' && 'x' in v && 'y' in v && !('o' in v) && !('v' in v) && !('median' in v);
}

function isBoxplotValue(v: ChartJsDataValue): v is { min: number; q1: number; median: number; q3: number; max: number; outliers?: number[] } {
  return v != null && typeof v === 'object' && 'median' in v;
}

function isCandlestickValue(v: ChartJsDataValue): v is { x: number | string; o: number; h: number; l: number; c: number } {
  return v != null && typeof v === 'object' && 'o' in v && 'h' in v && 'l' in v && 'c' in v;
}

function isMatrixValue(v: ChartJsDataValue): v is { x: string | number; y: string | number; v: number } {
  return v != null && typeof v === 'object' && 'v' in v;
}

function isStacked(chart: ChartJsChart): boolean {
  const scales = chart.options.scales;
  if (!scales)
    return false;
  return scales.x?.stacked === true || scales.y?.stacked === true;
}

// ---------------------------------------------------------------------------
// Layer extraction dispatcher
// ---------------------------------------------------------------------------

function extractLayers(
  chart: ChartJsChart,
  chartType: string,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  switch (chartType) {
    case 'bar':
      return extractBarLayers(chart, pluginOptions);
    case 'line':
      return extractLineLayers(chart, pluginOptions);
    case 'scatter':
    case 'bubble':
      return extractScatterLayers(chart, pluginOptions);
    case 'pie':
    case 'doughnut':
      return extractPieLayers(chart, pluginOptions);
    case 'radar':
    case 'polarArea':
      return extractRadarLayers(chart, pluginOptions);
    case 'boxplot':
      return extractBoxplotLayers(chart, pluginOptions);
    case 'candlestick':
    case 'ohlc':
      return extractCandlestickLayers(chart, pluginOptions);
    case 'matrix':
      return extractHeatmapLayers(chart, pluginOptions);
    default:
      return extractBarLayers(chart, pluginOptions);
  }
}

// ---------------------------------------------------------------------------
// Bar chart extraction (plain, stacked, dodged)
// ---------------------------------------------------------------------------

function extractBarLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const data = chart.data;

  if (data.datasets.length === 0)
    return [];

  if (data.datasets.length > 1) {
    const traceType = isStacked(chart) ? TraceType.STACKED : TraceType.DODGED;
    return extractSegmentedBarLayers(chart, pluginOptions, traceType);
  }

  return [singleDatasetToBarLayer(data.datasets[0], data.labels ?? [], chart, pluginOptions)];
}

function singleDatasetToBarLayer(
  dataset: { label?: string; data: ChartJsDataValue[] },
  labels: (string | number)[],
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  id: number = 0,
): MaidrLayer {
  const points: BarPoint[] = dataset.data.map((value, i) => ({
    x: labels[i] ?? i,
    y: toNumber(value),
  }));

  return {
    id: String(id),
    type: TraceType.BAR,
    title: dataset.label,
    ...(chart.options.indexAxis === 'y' ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: {
      x: getAxisLabel(chart, 'x', pluginOptions),
      y: getAxisLabel(chart, 'y', pluginOptions),
    },
    data: points,
  };
}

function extractSegmentedBarLayers(
  chart: ChartJsChart,
  pluginOptions: MaidrPluginOptions | undefined,
  traceType: TraceType,
): MaidrLayer[] {
  const data = chart.data;
  const labels = data.labels ?? [];
  const numCategories = Math.max(labels.length, ...data.datasets.map(ds => ds.data.length));

  const points: SegmentedPoint[][] = [];
  for (let i = 0; i < numCategories; i++) {
    const categoryPoints: SegmentedPoint[] = data.datasets.map(dataset => ({
      x: labels[i] ?? i,
      y: toNumber(dataset.data[i]),
      fill: dataset.label ?? '',
    }));
    points.push(categoryPoints);
  }

  return [
    {
      id: '0',
      type: traceType,
      ...(chart.options.indexAxis === 'y' ? { orientation: Orientation.HORIZONTAL } : {}),
      axes: {
        x: getAxisLabel(chart, 'x', pluginOptions),
        y: getAxisLabel(chart, 'y', pluginOptions),
        fill: 'Group',
      },
      data: points,
    },
  ];
}

// ---------------------------------------------------------------------------
// Line chart extraction
// ---------------------------------------------------------------------------

function extractLineLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const data = chart.data;
  const labels = data.labels ?? [];

  const lineData: LinePoint[][] = data.datasets.map((dataset, dsIdx) =>
    dataset.data.map((value, i) => ({
      x: labels[i] ?? i,
      y: toNumber(value),
      fill: dataset.label ?? `Line ${dsIdx + 1}`,
    })),
  );

  return [
    {
      id: '0',
      type: TraceType.LINE,
      axes: {
        x: getAxisLabel(chart, 'x', pluginOptions),
        y: getAxisLabel(chart, 'y', pluginOptions),
      },
      data: lineData,
    },
  ];
}

// ---------------------------------------------------------------------------
// Scatter / Bubble chart extraction
// ---------------------------------------------------------------------------

function extractScatterLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const scatterData: ScatterPoint[] = [];

  for (const dataset of chart.data.datasets) {
    for (const point of dataset.data) {
      if (isPointValue(point)) {
        scatterData.push({ x: point.x, y: point.y });
      }
    }
  }

  return [
    {
      id: '0',
      type: TraceType.SCATTER,
      axes: {
        x: getAxisLabel(chart, 'x', pluginOptions),
        y: getAxisLabel(chart, 'y', pluginOptions),
      },
      data: scatterData,
    },
  ];
}

// ---------------------------------------------------------------------------
// Pie / Doughnut chart extraction (mapped to bar)
// ---------------------------------------------------------------------------

function extractPieLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const data = chart.data;
  const labels = data.labels ?? [];
  const dataset = data.datasets[0];

  if (!dataset)
    return [];

  const barData: BarPoint[] = dataset.data.map((value, i) => ({
    x: labels[i] ?? `Slice ${i + 1}`,
    y: toNumber(value),
  }));

  return [
    {
      id: '0',
      type: TraceType.BAR,
      title: pluginOptions?.title ?? dataset.label ?? chart.config.type,
      axes: {
        x: pluginOptions?.axes?.x ?? 'Category',
        y: pluginOptions?.axes?.y ?? 'Value',
      },
      data: barData,
    },
  ];
}

// ---------------------------------------------------------------------------
// Radar / Polar Area chart extraction (mapped to bar)
// ---------------------------------------------------------------------------

function extractRadarLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const data = chart.data;
  const labels = data.labels ?? [];

  if (data.datasets.length === 0)
    return [];

  return data.datasets.map((dataset, idx) => {
    const barData: BarPoint[] = dataset.data.map((value, i) => ({
      x: labels[i] ?? i,
      y: toNumber(value),
    }));

    return {
      id: String(idx),
      type: TraceType.BAR,
      title: dataset.label ?? chart.config.type,
      axes: {
        x: pluginOptions?.axes?.x ?? 'Category',
        y: pluginOptions?.axes?.y ?? 'Value',
      },
      data: barData,
    };
  });
}

// ---------------------------------------------------------------------------
// Boxplot chart extraction (chartjs-chart-boxplot plugin)
// ---------------------------------------------------------------------------

function extractBoxplotLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const labels = chart.data.labels ?? [];
  const boxData: BoxPoint[] = [];

  for (const dataset of chart.data.datasets) {
    for (let i = 0; i < dataset.data.length; i++) {
      const point = dataset.data[i];
      if (isBoxplotValue(point)) {
        const outliers = point.outliers ?? [];
        boxData.push({
          fill: String(labels[i] ?? dataset.label ?? `Box ${i + 1}`),
          lowerOutliers: outliers.filter(v => v < point.min),
          min: point.min,
          q1: point.q1,
          q2: point.median,
          q3: point.q3,
          max: point.max,
          upperOutliers: outliers.filter(v => v > point.max),
        });
      }
    }
  }

  return [
    {
      id: '0',
      type: TraceType.BOX,
      axes: {
        x: getAxisLabel(chart, 'x', pluginOptions),
        y: getAxisLabel(chart, 'y', pluginOptions),
      },
      data: boxData,
    },
  ];
}

// ---------------------------------------------------------------------------
// Candlestick / OHLC chart extraction (chartjs-chart-financial plugin)
// ---------------------------------------------------------------------------

function extractCandlestickLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const candlestickData: CandlestickPoint[] = [];

  for (const dataset of chart.data.datasets) {
    for (const point of dataset.data) {
      if (isCandlestickValue(point)) {
        candlestickData.push({
          value: String(point.x),
          open: point.o,
          high: point.h,
          low: point.l,
          close: point.c,
          volume: 0,
          trend: point.c > point.o ? 'Bull' : point.c < point.o ? 'Bear' : 'Neutral',
          volatility: point.h - point.l,
        });
      }
    }
  }

  return [
    {
      id: '0',
      type: TraceType.CANDLESTICK,
      axes: {
        x: getAxisLabel(chart, 'x', pluginOptions),
        y: getAxisLabel(chart, 'y', pluginOptions),
      },
      data: candlestickData,
    },
  ];
}

// ---------------------------------------------------------------------------
// Heatmap / Matrix chart extraction (chartjs-chart-matrix plugin)
// ---------------------------------------------------------------------------

function extractHeatmapLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();
  const valueMap = new Map<string, number>();

  for (const dataset of chart.data.datasets) {
    for (const point of dataset.data) {
      if (isMatrixValue(point)) {
        const x = String(point.x);
        const y = String(point.y);
        if (!xSet.has(x)) {
          xSet.add(x);
          xLabels.push(x);
        }
        if (!ySet.has(y)) {
          ySet.add(y);
          yLabels.push(y);
        }
        valueMap.set(`${x}|${y}`, point.v);
      }
    }
  }

  const points: number[][] = yLabels.map(y =>
    xLabels.map(x => valueMap.get(`${x}|${y}`) ?? 0),
  );

  const heatmapData: HeatmapData = { x: xLabels, y: yLabels, points };

  return [
    {
      id: '0',
      type: TraceType.HEATMAP,
      axes: {
        x: getAxisLabel(chart, 'x', pluginOptions),
        y: getAxisLabel(chart, 'y', pluginOptions),
      },
      data: heatmapData,
    },
  ];
}
