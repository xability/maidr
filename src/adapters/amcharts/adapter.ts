/**
 * Main adapter that converts an amCharts 5 chart into a MAIDR data object.
 *
 * Supports single charts and multi-panel roots: every `XYChart` found in the
 * root's container tree (including am5stock `StockPanel`s, which extend
 * `XYChart`) becomes one MAIDR subplot, arranged in a grid mirroring the
 * on-screen layout with rows emitted bottom-first (see
 * {@link computeChartGrid}) so the core's UPWARD = row+1 mapping moves
 * visually up.
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
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
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
  extractHeatmapData,
  extractHistogramPoints,
  extractLinePoints,
  extractSegmentedPoints,
  readAxisLabel,
} from './extractor';
import { computeChartGrid } from './geometry';
import {
  buildColumnSelector,
  buildLineSelector,
} from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A converted panel: the source chart paired with the MAIDR layers built from
 * it. One entry per emitted subplot, in row-major grid order.
 */
export interface AmChartPanel {
  chart: AmXYChart;
  layers: MaidrLayer[];
}

/**
 * Result of {@link convertCharts}: the MAIDR data object plus the
 * chart-to-subplot mapping the binder needs to route highlights back to the
 * owning panel.
 */
export interface AmChartsConversion {
  maidr: Maidr;
  panels: AmChartPanel[];
}

/**
 * Convert an amCharts 5 {@link AmRoot} into a MAIDR data object.
 *
 * The function walks the root's container tree, collects every XY chart
 * (including am5stock `StockPanel`s), and converts each one into a MAIDR
 * subplot. A single chart produces a 1x1 grid; multiple charts are arranged
 * in a grid mirroring their on-screen layout, rows ordered bottom-first so
 * that pressing Up moves to the visually upper panel.
 *
 * @param root    The amCharts 5 `Root` instance.
 * @param options Optional overrides for title, subtitle, and axis labels.
 * @returns       A {@link Maidr} object ready for `<Maidr data={...}>`.
 *
 * @throws If no supported chart is found inside the root, or if no chart
 *         contains a supported series with data.
 */
export function fromAmCharts(root: AmRoot, options?: AmChartsBinderOptions): Maidr {
  const charts = findXYCharts(root);
  if (charts.length === 0) {
    throw new Error(
      'maidr amCharts binder: no XYChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling fromAmCharts().',
    );
  }

  return convertCharts(charts, root.dom, options).maidr;
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
  return convertCharts([chart], containerEl, options).maidr;
}

/**
 * Convert several amCharts 5 {@link AmXYChart}s (all sharing one root/DOM
 * element) into a single multi-panel MAIDR data object — one subplot per
 * chart, arranged in a grid mirroring the rendered layout.
 *
 * @param charts       The amCharts 5 XY chart instances (same `Root`).
 * @param containerEl  The DOM element that contains the charts' rendered output.
 * @param options      Optional overrides (applied figure-wide).
 */
export function fromXYCharts(
  charts: AmXYChart[],
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): Maidr {
  return convertCharts(charts, containerEl, options).maidr;
}

/**
 * Core conversion shared by the JSON entry points and the binder.
 *
 * Single chart: identical output to the original single-panel adapter.
 * Multiple charts: one subplot per chart, positioned via {@link computeChartGrid}
 * (falls back to one row in insertion order when geometry is unavailable).
 * Charts yielding no supported layers are dropped — the core model crashes on
 * empty subplots or empty grid rows. When NO chart yields a layer, a
 * descriptive error is thrown instead of emitting the `[[{ layers: [] }]]`
 * shape, which would crash the core model at Controller construction.
 *
 * @throws If no chart contains a supported series with data.
 */
export function convertCharts(
  charts: AmXYChart[],
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): AmChartsConversion {
  if (charts.length === 0) {
    throw new Error('maidr amCharts binder: convertCharts requires at least one chart.');
  }

  const id = `amcharts-${containerEl.id || uid()}`;
  const subtitle = options?.subtitle;

  if (charts.length === 1) {
    const chart = charts[0];
    const title = options?.title ?? readChartTitle(chart);
    const layers = buildChartLayers(chart, containerEl, options);
    if (layers.length === 0) {
      throw noSupportedDataError();
    }
    const subplot: MaidrSubplot = { layers };

    return {
      maidr: { id, title, subtitle, subplots: [[subplot]] },
      panels: [{ chart, layers }],
    };
  }

  const grid = computeChartGrid(charts);
  const subplotRows: MaidrSubplot[][] = [];
  const panels: AmChartPanel[] = [];

  for (const chartRow of grid) {
    const subplotRow: MaidrSubplot[] = [];
    for (const chart of chartRow) {
      const layers = buildChartLayers(chart, containerEl, options);
      if (layers.length === 0) {
        // Never emit `layers: []` inside a grid — it crashes the core model.
        continue;
      }
      // MaidrSubplot has no title field; the FIRST layer's title is the
      // panel's display name in subplot summaries.
      const panelTitle = readChartTitle(chart);
      if (panelTitle) {
        layers[0] = { ...layers[0], title: panelTitle };
      }
      subplotRow.push({ layers });
      panels.push({ chart, layers });
    }
    // Never emit empty rows — they crash the core model.
    if (subplotRow.length > 0) {
      subplotRows.push(subplotRow);
    }
  }

  if (panels.length === 0) {
    // Never emit `[[{ layers: [] }]]` — it crashes the core model the moment
    // the Controller is constructed. Fail with an actionable adapter error.
    throw noSupportedDataError();
  }

  return {
    maidr: { id, title: options?.title, subtitle, subplots: subplotRows },
    panels,
  };
}

/**
 * Build the MAIDR layers for one chart. Axis labels come from THAT chart's
 * first x/y axis; `options.axisLabels` acts as a figure-wide override.
 */
function buildChartLayers(
  chart: AmXYChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): MaidrLayer[] {
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
    const layer = buildSegmentedLayer(barSeriesList, xLabel, yLabel, containerEl);
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

  return layers;
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
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

function buildSegmentedLayer(
  barSeriesList: AmXYSeries[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer | null {
  const stackMode = detectStackMode(barSeriesList);

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
    axes: { x: { label: xLabel }, y: { label: yLabel } },
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
    axes: { x: { label: xLabel }, y: { label: yLabel } },
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
    axes: { x: { label: xLabel }, y: { label: yLabel } },
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
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Error thrown when no chart yields a supported series with data. */
function noSupportedDataError(): Error {
  return new Error(
    'maidr amCharts binder: no supported series with data found in any chart. '
    + 'Ensure series data is set before calling fromAmCharts()/bindAmCharts().',
  );
}

/**
 * Collect every XY chart in the root's container tree, in depth-first
 * (insertion) order.
 *
 * Recursion reaches charts nested inside intermediate containers — notably
 * am5stock `StockPanel`s (which extend `XYChart`) inside a `StockChart`'s
 * panels container. `XYChartScrollbar` subtrees are pruned before recursion:
 * a real scrollbar is a plain `Scrollbar` container (NOT chart-like itself)
 * whose child is a preview `XYChart` — descending into it would surface that
 * preview as a phantom panel (e.g. a scrollbar mounted in a StockChart's
 * toolsContainer, the standard am5stock pattern). Found charts are also not
 * descended into, so an in-chart scrollbar preview is never visited either.
 */
export function findXYCharts(root: AmRoot): AmXYChart[] {
  const found: AmXYChart[] = [];
  collectXYCharts(root.container, found);
  return found;
}

function collectXYCharts(node: unknown, found: AmXYChart[]): void {
  for (const child of childValues(node)) {
    const cls = (child as { className?: string } | null)?.className;
    if (cls === 'XYChartScrollbar') {
      // Never a panel; its child preview XYChart must not be found either.
      continue;
    }
    if (isXYChartLike(child)) {
      found.push(child);
      continue;
    }
    collectXYCharts(child, found);
  }
}

/** Read a container-like entity's `children.values`, or `[]` if absent. */
function childValues(node: unknown): unknown[] {
  if (node == null || typeof node !== 'object')
    return [];
  const children = (node as { children?: { values?: unknown[] } }).children;
  const values = children?.values;
  return Array.isArray(values) ? values : [];
}

/** Duck-type check: an XYChart has series, xAxes, and yAxes. */
function isXYChartLike(candidate: unknown): candidate is AmXYChart {
  if (candidate == null || typeof candidate !== 'object')
    return false;
  const c = candidate as Partial<AmXYChart>;
  return Boolean(c.series && c.xAxes && c.yAxes);
}

/**
 * Detect the stacking mode from a list of column series.
 *
 * In amCharts 5, stacking is a per-series setting, not an axis setting:
 * `series.get('stacked')` is `true` for stacked columns, and a 100%
 * (normalized) stack additionally sets `valueYShow` (or `valueXShow` for
 * horizontal columns) to `'valueYTotalPercent'` / `'valueXTotalPercent'`.
 * Series with no `stacked` flag render side-by-side (dodged).
 */
function detectStackMode(barSeriesList: AmXYSeries[]): 'none' | 'normal' | '100%' {
  let anyStacked = false;
  for (const series of barSeriesList) {
    if (series.get('stacked') !== true)
      continue;
    anyStacked = true;
    const show = series.get('valueYShow') ?? series.get('valueXShow');
    if (show === 'valueYTotalPercent' || show === 'valueXTotalPercent')
      return '100%';
  }
  return anyStacked ? 'normal' : 'none';
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
