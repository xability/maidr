/**
 * Extracts data from Chart.js chart instances and converts it to the MAIDR
 * JSON schema format.
 *
 * Supported chart types: bar, line, scatter, pie, doughnut.
 * Unsupported types fall back to a bar-chart extraction.
 */

import type { BarPoint, LinePoint, Maidr, MaidrLayer, ScatterPoint } from '../type/grammar';
import type { ChartJsChart, ChartJsData, MaidrPluginOptions } from './types';
import { TraceType } from '../type/grammar';

/**
 * Extracts a complete {@link Maidr} data object from a Chart.js chart instance.
 *
 * @param chart - The Chart.js chart instance to extract data from
 * @param pluginOptions - Optional per-chart plugin options
 * @returns A MAIDR data object ready to be passed to `<Maidr data={...}>`
 */
export function extractMaidrData(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): Maidr {
  const chartType = chart.config.type;
  const layers = extractLayers(chart, chartType, pluginOptions);

  return {
    id: `maidr-chartjs-${chart.canvas.id || String(Date.now())}`,
    title: pluginOptions?.title ?? getChartTitle(chart),
    subplots: [[{ layers }]],
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
      return extractScatterLayers(chart, pluginOptions);
    case 'pie':
    case 'doughnut':
      return extractPieLayers(chart, pluginOptions);
    default:
      // Fallback: attempt bar-style extraction
      return extractBarLayers(chart, pluginOptions);
  }
}

// ---------------------------------------------------------------------------
// Bar chart extraction
// ---------------------------------------------------------------------------

function extractBarLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const data = chart.data;
  const labels = data.labels ?? [];

  if (data.datasets.length === 1) {
    return [singleDatasetToBarLayer(data.datasets[0], labels, chart, pluginOptions)];
  }

  // Multi-dataset: one layer per dataset
  return data.datasets.map((dataset, idx) =>
    singleDatasetToBarLayer(dataset, labels, chart, pluginOptions, idx),
  );
}

function singleDatasetToBarLayer(
  dataset: ChartJsData['datasets'][number],
  labels: (string | number)[],
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  id: number = 0,
): MaidrLayer {
  const points: BarPoint[] = dataset.data.map((value, i) => ({
    x: labels[i] ?? i,
    y: typeof value === 'number' ? value : (value as null) === null ? 0 : 0,
  }));

  return {
    id: String(id),
    type: TraceType.BAR,
    title: dataset.label,
    axes: {
      x: getAxisLabel(chart, 'x', pluginOptions),
      y: getAxisLabel(chart, 'y', pluginOptions),
    },
    data: points,
  };
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
      y: typeof value === 'number' ? value : 0,
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
// Scatter chart extraction
// ---------------------------------------------------------------------------

function extractScatterLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const scatterData: ScatterPoint[] = [];

  for (const dataset of chart.data.datasets) {
    for (const point of dataset.data) {
      if (point && typeof point === 'object' && 'x' in point && 'y' in point) {
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
    y: typeof value === 'number' ? value : 0,
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
