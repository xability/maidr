/**
 * Main adapter that converts an amCharts 5 chart into a MAIDR data object.
 *
 * @example
 * ```ts
 * import { fromAmCharts } from 'maidr/amcharts';
 *
 * const root = am5.Root.new("chartdiv");
 * const chart = root.container.children.push(
 *   am5xy.XYChart.new(root, {})
 * );
 * // ... configure chart, axes, series, data ...
 *
 * const maidrData = fromAmCharts(root);
 * ```
 */

import type {
  BarPoint,
  CandlestickPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type {
  AmChartsBinderOptions,
  AmRoot,
  AmXYChart,
  AmXYSeries,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import {
  classifySeriesKind,
  extractBarPoints,
  extractCandlestickPoints,
  extractHeatmapData,
  extractHistogramPoints,
  extractLinePoints,
  extractScatterPoints,
  extractSegmentedPoints,
  readAxisLabel,
} from './extractors';
import {
  buildColumnSelector,
  buildLineSelector,
  buildScatterSelector,
} from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an amCharts 5 {@link AmRoot} into a MAIDR data object.
 *
 * The function inspects the root's container children, finds the first
 * XY chart, and converts each of its series into a MAIDR layer.
 *
 * @param root    The amCharts 5 `Root` instance.
 * @param options Optional overrides for title, subtitle, and axis labels.
 * @returns       A {@link Maidr} object ready for `<Maidr data={...}>`.
 *
 * @throws If no supported chart is found inside the root.
 */
export function fromAmCharts(root: AmRoot, options?: AmChartsBinderOptions): Maidr {
  const chart = findXYChart(root);
  if (!chart) {
    throw new Error(
      'maidr amCharts binder: no XYChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling fromAmCharts().',
    );
  }

  return fromXYChart(chart, root.dom, options);
}

/**
 * Convert an amCharts 5 {@link AmXYChart} directly into a MAIDR data object.
 *
 * Use this when you already hold a reference to the chart object.
 *
 * @param chart        The amCharts 5 XY chart instance.
 * @param containerEl  The DOM element that contains the chart's rendered output.
 * @param options      Optional overrides.
 */
export function fromXYChart(
  chart: AmXYChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): Maidr {
  const title = options?.title ?? readChartTitle(chart);
  const subtitle = options?.subtitle;
  const xLabel = options?.axisLabels?.x ?? readAxisLabel(chart.xAxes.values[0], 'x');
  const yLabel = options?.axisLabels?.y ?? readAxisLabel(chart.yAxes.values[0], 'y');

  const layers: MaidrLayer[] = [];
  const lineLayers: LinePoint[][] = [];
  let lineLayerSelectors: string[] | undefined;
  const lineSeriesNames: string[] = [];

  // Collect bar series for grouped handling (stacked/dodged/normalized).
  const barSeriesList: AmXYSeries[] = [];

  for (const series of chart.series.values) {
    const kind = classifySeriesKind(series);

    switch (kind) {
      case 'bar': {
        barSeriesList.push(series);
        break;
      }
      case 'histogram': {
        const data = extractHistogramPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildHistogramLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'heatmap': {
        const data = extractHeatmapData(series);
        if (!data)
          break;
        layers.push(buildHeatmapLayer(data, xLabel, yLabel));
        break;
      }
      case 'line': {
        const points = extractLinePoints(series);
        if (points.length === 0)
          break;
        lineLayers.push(points);

        const name = seriesName(series);
        if (name)
          lineSeriesNames.push(name);

        const sel = buildLineSelector(series, containerEl);
        if (sel) {
          lineLayerSelectors ??= [];
          lineLayerSelectors.push(sel);
        }
        break;
      }
      case 'scatter': {
        const data = extractScatterPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildScatterLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'candlestick': {
        const data = extractCandlestickPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildCandlestickLayer(series, data, xLabel, yLabel));
        break;
      }
      default:
        // Skip unsupported series types.
        break;
    }
  }

  // Process bar series: single → BAR, multiple → STACKED/DODGED/NORMALIZED.
  if (barSeriesList.length === 1) {
    const series = barSeriesList[0];
    const data = extractBarPoints(series);
    if (data.length > 0) {
      layers.push(buildBarLayer(series, data, xLabel, yLabel, containerEl));
    }
  } else if (barSeriesList.length > 1) {
    const layer = buildSegmentedLayer(barSeriesList, chart, xLabel, yLabel, containerEl);
    if (layer) {
      layers.push(layer);
    }
  }

  // Merge all line series into a single multi-line layer.
  if (lineLayers.length > 0) {
    const lineTitle = lineSeriesNames.length > 0
      ? lineSeriesNames.join(', ')
      : undefined;
    layers.push(buildLineLayer(lineLayers, lineLayerSelectors, xLabel, yLabel, lineTitle));
  }

  const id = `amcharts-${containerEl.id || uid()}`;

  const subplot: MaidrSubplot = { layers };

  return {
    id,
    title,
    subtitle,
    subplots: [[subplot]],
  };
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

function buildBarLayer(
  series: AmXYSeries,
  data: BarPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const isHorizontal = typeof series.get('categoryYField') === 'string';
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.BAR,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildSegmentedLayer(
  barSeriesList: AmXYSeries[],
  chart: AmXYChart,
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer | null {
  const stackMode = detectStackMode(chart);

  let traceType: TraceType;
  switch (stackMode) {
    case 'normal':
      traceType = TraceType.STACKED;
      break;
    case '100%':
      traceType = TraceType.NORMALIZED;
      break;
    default:
      traceType = TraceType.DODGED;
  }

  // Each series becomes one group (row) in the SegmentedPoint[][] grid.
  const data: SegmentedPoint[][] = [];
  const selectorParts: string[] = [];

  for (const series of barSeriesList) {
    const points = extractSegmentedPoints(series);
    if (points.length > 0) {
      data.push(points);
      const sel = buildColumnSelector(series, containerEl);
      if (sel)
        selectorParts.push(sel);
    }
  }

  if (data.length === 0)
    return null;

  const isHorizontal = typeof barSeriesList[0].get('categoryYField') === 'string';
  const combinedSelector = selectorParts.length > 0
    ? selectorParts.join(', ')
    : undefined;

  return {
    id: `segmented-${uid()}`,
    type: traceType,
    ...(combinedSelector ? { selectors: combinedSelector } : {}),
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildHistogramLayer(
  series: AmXYSeries,
  data: HistogramPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.HISTOGRAM,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildHeatmapLayer(
  data: HeatmapData,
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  return {
    id: `heatmap-${uid()}`,
    type: TraceType.HEATMAP,
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildLineLayer(
  data: LinePoint[][],
  selectors: string[] | undefined,
  xLabel: string,
  yLabel: string,
  title?: string,
): MaidrLayer {
  return {
    id: `line-${uid()}`,
    type: TraceType.LINE,
    ...(title ? { title } : {}),
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildScatterLayer(
  series: AmXYSeries,
  data: ScatterPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const selector = buildScatterSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.SCATTER,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildCandlestickLayer(
  series: AmXYSeries,
  data: CandlestickPoint[],
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.CANDLESTICK,
    title: seriesName(series),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findXYChart(root: AmRoot): AmXYChart | undefined {
  for (const child of root.container.children.values) {
    // Duck-type check: XYChart has series, xAxes, yAxes.
    const c = child as Partial<AmXYChart>;
    if (c.series && c.xAxes && c.yAxes) {
      return c as AmXYChart;
    }
  }
  return undefined;
}

/**
 * Detect the stacking mode from the chart's value axes.
 *
 * In amCharts 5, stacking is controlled by setting `stackMode` on a
 * `ValueAxis`: `"normal"` for stacked, `"100%"` for normalized.
 */
function detectStackMode(chart: AmXYChart): 'none' | 'normal' | '100%' {
  for (const axis of chart.yAxes.values) {
    const mode = axis.get('stackMode');
    if (mode === 'normal' || mode === '100%')
      return mode;
  }
  for (const axis of chart.xAxes.values) {
    const mode = axis.get('stackMode');
    if (mode === 'normal' || mode === '100%')
      return mode;
  }
  return 'none';
}

function readChartTitle(chart: AmXYChart): string | undefined {
  // amCharts 5 titles are typically children of the chart.
  // A title entity has className "Label" or "Title" and a text property.
  if (!('children' in chart))
    return undefined;

  const children = (chart as unknown as Record<string, unknown>).children;
  if (children == null || typeof children !== 'object')
    return undefined;

  const values = (children as Record<string, unknown>).values;
  if (!Array.isArray(values))
    return undefined;

  for (const child of values) {
    if (child == null || typeof child !== 'object')
      continue;
    const c = child as Record<string, unknown>;
    if (c.className === 'Label' || c.className === 'Title') {
      if (typeof c.get === 'function') {
        const text = (c as { get: (k: string) => unknown }).get('text');
        if (typeof text === 'string' && text.length > 0)
          return text;
      }
    }
  }
  return undefined;
}

function seriesName(series: AmXYSeries): string | undefined {
  const name = series.get('name');
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function layerId(series: AmXYSeries): string {
  return `amcharts-series-${series.uid ?? counter()}`;
}

/**
 * Monotonically increasing counter used as a fallback when no deterministic
 * ID (e.g. container id, series uid) is available.
 *
 * IDs produced by this counter are ephemeral — they are not stable across
 * page loads or hot reloads and must not be persisted.
 */
let _counter = 0;
function counter(): string {
  return String(++_counter);
}

/**
 * Produce a short identifier for a generated layer.
 * Prefers the container's DOM `id`; falls back to the monotonic counter.
 */
function uid(): string {
  return counter();
}
