/**
 * Main adapter that converts an amCharts 5 chart into a MAIDR data object.
 *
 * Supports single charts and multi-panel roots: every `XYChart` found in the
 * root's container tree (including am5stock `StockPanel`s and am5radar
 * `RadarChart`s, which extend `XYChart`) and every am5percent chart — a
 * `PieChart` or a funnel's `SlicedChart` — becomes one MAIDR subplot,
 * arranged in a grid mirroring the on-screen layout with rows emitted
 * bottom-first (see {@link computeChartGrid}) so the core's UPWARD = row+1
 * mapping moves visually up.
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
  PiePoint,
  SegmentedPoint,
} from '@type/grammar';
import type {
  AmChart,
  AmChartsBinderOptions,
  AmRoot,
  AmXYSeries,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import {
  classifySeriesKind,
  extractBarPoints,
  extractHeatmapData,
  extractHistogramPoints,
  extractLinePoints,
  extractPiePoints,
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
  chart: AmChart;
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
 * (including am5stock `StockPanel`s) and every am5percent chart, and converts each
 * one into a MAIDR subplot. A single chart produces a 1x1 grid; multiple charts are arranged
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
  const charts = findCharts(root);
  if (charts.length === 0) {
    throw new Error(
      'maidr amCharts binder: no XYChart or PieChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling fromAmCharts().',
    );
  }

  return convertCharts(charts, root.dom, options).maidr;
}

/**
 * Convert an amCharts 5 {@link AmChart} directly into a MAIDR data object.
 *
 * Use this when you already hold a reference to the chart object.
 *
 * @param chart        The amCharts 5 XY chart instance.
 * @param containerEl  The DOM element that contains the chart's rendered output.
 * @param options      Optional overrides.
 */
export function fromXYChart(
  chart: AmChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): Maidr {
  return convertCharts([chart], containerEl, options).maidr;
}

/**
 * Convert several amCharts 5 {@link AmChart}s (all sharing one root/DOM
 * element) into a single multi-panel MAIDR data object — one subplot per
 * chart, arranged in a grid mirroring the rendered layout.
 *
 * @param charts       The amCharts 5 XY chart instances (same `Root`).
 * @param containerEl  The DOM element that contains the charts' rendered output.
 * @param options      Optional overrides (applied figure-wide).
 */
export function fromXYCharts(
  charts: AmChart[],
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
  charts: AmChart[],
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
  chart: AmChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): MaidrLayer[] {
  // A pie chart is bound to no axis, so both reads find nothing and fall back;
  // the pie layer names its own dimensions rather than using these.
  const xLabel = options?.axisLabels?.x ?? readAxisLabel(chart.xAxes?.values[0], 'x');
  const yLabel = options?.axisLabels?.y ?? readAxisLabel(chart.yAxes?.values[0], 'y');

  const layers: MaidrLayer[] = [];
  // Line, step, area and radar series each merge into one layer of their own
  // type. The points are extracted identically — amCharts varies only how it
  // draws between them — so they differ here only in which bucket they land in.
  const merged: Record<MergedKind, MergedSeries> = {
    line: emptyMergedSeries(),
    step: emptyMergedSeries(),
    area: emptyMergedSeries(),
    radar: emptyMergedSeries(),
    polar: emptyMergedSeries(),
  };

  // Collect bar series for grouped handling (stacked/dodged/normalized), and
  // area series for the stacking their merged layer's type has to report.
  const barSeriesList: AmXYSeries[] = [];
  const areaSeriesList: AmXYSeries[] = [];

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
      case 'line':
      case 'step':
      case 'area':
      case 'radar':
      case 'polar': {
        const points = extractLinePoints(series);
        if (points.length === 0)
          break;
        collectSeries(merged[kind], series, points, containerEl);
        if (kind === 'area')
          areaSeriesList.push(series);
        break;
      }
      case 'pie': {
        const data = extractPiePoints(series);
        if (data.length === 0)
          break;
        layers.push(buildPieLayer(series, data, options));
        break;
      }
      case 'funnel': {
        // A funnel stage carries the same category/value pair a pie slice
        // does, so the same extraction serves both.
        const data = extractPiePoints(series);
        if (data.length === 0)
          break;
        layers.push(buildFunnelLayer(series, data, options));
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

  // Merge each bucket of point series into a single layer of its own type.
  // The area bucket is the one that has to name its stacking, read from the
  // same per-series settings the bar path reads.
  pushMerged(layers, merged.line, TraceType.LINE, xLabel, yLabel);
  pushMerged(layers, merged.step, TraceType.STEP, xLabel, yLabel);
  pushMerged(layers, merged.area, areaTraceType(areaSeriesList), xLabel, yLabel);
  pushMerged(layers, merged.radar, TraceType.RADAR, xLabel, yLabel);
  pushMerged(layers, merged.polar, TraceType.POLAR_AREA, xLabel, yLabel);

  return layers;
}

/** Append the merged layer for one bucket, unless the bucket stayed empty. */
function pushMerged(
  layers: MaidrLayer[],
  merged: MergedSeries,
  type: MergedTraceType,
  xLabel: string,
  yLabel: string,
): void {
  if (merged.data.length > 0) {
    layers.push(buildLineLayer(merged, type, xLabel, yLabel));
  }
}

/**
 * The trace type an area layer reports, from how its bands are stacked.
 *
 * Every area series of one chart merges into a single layer, so the stacking
 * is read across the whole group rather than per series: amCharts commonly
 * sets `stacked` on the bands that sit ON another one and leaves it off the
 * bottom band, and splitting the group by that flag would strand the bottom
 * band in an unstacked layer of its own — announcing the one band a reader
 * would compare the others against as a chart of its own.
 */
function areaTraceType(areaSeriesList: AmXYSeries[]): MergedTraceType {
  switch (detectStackMode(areaSeriesList)) {
    case 'normal':
      return TraceType.STACKED_AREA;
    case '100%':
      return TraceType.NORMALIZED_AREA;
    default:
      return TraceType.AREA;
  }
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

/**
 * What a pie's two dimensions are called. A pie series is bound to no axis, so
 * the chart-level `readAxisLabel` fallback would name them `x` and `y` — after
 * coordinates a pie does not have. These name what each one actually holds.
 */
const PIE_LABEL_AXIS = 'Label';
const PIE_VALUE_AXIS = 'Value';

/**
 * Builds the layer for one pie series. A `PieChart` normally holds exactly
 * one, but amCharts allows several (concentric rings), and each becomes its
 * own layer — navigable with PageUp / PageDown like any other stack of layers.
 *
 * No `selectors` are emitted: amCharts renders to canvas, so there is no SVG
 * wedge to address. The binder's overlay highlights the active slice instead.
 */
function buildPieLayer(
  series: AmXYSeries,
  data: PiePoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.PIE,
    title: seriesName(series),
    axes: {
      x: { label: options?.axisLabels?.x ?? PIE_LABEL_AXIS },
      y: { label: options?.axisLabels?.y ?? PIE_VALUE_AXIS },
    },
    data,
  };
}

/**
 * What a funnel's two dimensions are called. Like a pie, a sliced chart is
 * bound to no axis, so the chart-level fallback would name them `x` and `y`.
 */
const FUNNEL_STAGE_AXIS = 'Stage';
const FUNNEL_VALUE_AXIS = 'Value';

/**
 * Builds the layer for one am5percent funnel (or pyramid, or pictorial stack)
 * series. The stages stay in data order, which is what the funnel's retention
 * reading depends on: MAIDR pitches each stage against the one before it.
 *
 * No `selectors`, for the same reason a pie emits none — amCharts paints the
 * stages into a canvas. The binder's overlay highlights the active stage.
 */
function buildFunnelLayer(
  series: AmXYSeries,
  data: BarPoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.FUNNEL,
    title: seriesName(series),
    axes: {
      x: { label: options?.axisLabels?.x ?? FUNNEL_STAGE_AXIS },
      y: { label: options?.axisLabels?.y ?? FUNNEL_VALUE_AXIS },
    },
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

/**
 * Series kinds whose points are extracted identically and merged into one
 * layer per kind — everything MAIDR reads as a grid of series by samples.
 */
type MergedKind = 'line' | 'step' | 'area' | 'radar' | 'polar';

/** The trace types those merged layers are emitted as. */
type MergedTraceType
  = | TraceType.LINE
    | TraceType.STEP
    | TraceType.AREA
    | TraceType.STACKED_AREA
    | TraceType.NORMALIZED_AREA
    | TraceType.RADAR
    | TraceType.POLAR_AREA;

/** Layer-id prefix per merged type, so an id still names what it holds. */
const MERGED_ID_PREFIX: Record<MergedTraceType, string> = {
  [TraceType.LINE]: 'line',
  [TraceType.STEP]: 'step',
  [TraceType.AREA]: 'area',
  [TraceType.STACKED_AREA]: 'area',
  [TraceType.NORMALIZED_AREA]: 'area',
  [TraceType.RADAR]: 'radar',
  [TraceType.POLAR_AREA]: 'polar',
};

/**
 * Series that merge into one layer, gathered as the chart is walked.
 */
interface MergedSeries {
  /** One entry per series, in chart order. */
  data: LinePoint[][];
  /** Names of the series that have one, joined into the layer title. */
  names: string[];
  /** Highlight selectors, for the series whose path could be resolved. */
  selectors?: string[];
}

function emptyMergedSeries(): MergedSeries {
  return { data: [], names: [] };
}

/**
 * Adds one series' points, name and selector to the layer it will merge into.
 */
function collectSeries(
  merged: MergedSeries,
  series: AmXYSeries,
  points: LinePoint[],
  containerEl: HTMLElement,
): void {
  merged.data.push(points);

  const name = seriesName(series);
  if (name)
    merged.names.push(name);

  const sel = buildLineSelector(series, containerEl);
  if (sel) {
    merged.selectors ??= [];
    merged.selectors.push(sel);
  }
}

/**
 * Builds the merged line or step layer.
 *
 * `stepDirection` is deliberately not emitted for a step layer: amCharts
 * positions the staircase from the axis cell rather than reporting a
 * convention, so naming one here would be a guess. MAIDR then stays silent
 * about it rather than describing a chart amCharts did not draw.
 */
function buildLineLayer(
  merged: MergedSeries,
  type: MergedTraceType,
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  const title = merged.names.length > 0 ? merged.names.join(', ') : undefined;
  const selectors = merged.selectors;

  return {
    id: `${MERGED_ID_PREFIX[type]}-${uid()}`,
    type,
    ...(title ? { title } : {}),
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data: merged.data,
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
 * Collect every convertible chart in the root's container tree, in depth-first
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
export function findCharts(root: AmRoot): AmChart[] {
  const found: AmChart[] = [];
  collectCharts(root.container, found);
  return found;
}

/**
 * Collect only the XY charts in the root's container tree.
 *
 * The narrower counterpart of {@link findCharts}, kept because it is part of
 * the adapter's public API and because "every XY chart" is still a question
 * worth asking of a mixed root.
 */
export function findXYCharts(root: AmRoot): AmChart[] {
  return findCharts(root).filter(isXYChartLike);
}

function collectCharts(node: unknown, found: AmChart[]): void {
  for (const child of childValues(node)) {
    const cls = (child as { className?: string } | null)?.className;
    if (cls === 'XYChartScrollbar') {
      // Never a panel; its child preview XYChart must not be found either.
      continue;
    }
    if (isXYChartLike(child) || isPercentChartLike(child)) {
      found.push(child);
      continue;
    }
    collectCharts(child, found);
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
function isXYChartLike(candidate: unknown): candidate is AmChart {
  if (candidate == null || typeof candidate !== 'object')
    return false;
  const c = candidate as Partial<AmChart>;
  return Boolean(c.series && c.xAxes && c.yAxes);
}

/**
 * Charts of the am5percent module: a `PieChart` and the `SlicedChart` that
 * carries funnels, pyramids and pictorial stacks. Both are `SerialChart`s with
 * a series list and no axes.
 */
const PERCENT_CHART_CLASSES = new Set([
  'PieChart',
  'SlicedChart',
]);

/**
 * Duck-type check for an am5percent chart.
 *
 * These charts have a series list but no axes, which on its own is too weak a
 * signature — plenty of am5 containers carry a `series` property of some kind.
 * The class name is what makes it specific, and am5 sets it on every entity.
 */
function isPercentChartLike(candidate: unknown): candidate is AmChart {
  if (candidate == null || typeof candidate !== 'object')
    return false;
  const c = candidate as Partial<AmChart>;
  return typeof c.className === 'string'
    && PERCENT_CHART_CLASSES.has(c.className)
    && Boolean(c.series);
}

/**
 * Detect the stacking mode from a list of series that share a layer.
 *
 * In amCharts 5, stacking is a per-series setting, not an axis setting:
 * `series.get('stacked')` is `true` for a stacked column or area band, and a
 * 100% (normalized) stack additionally sets `valueYShow` (or `valueXShow` for
 * horizontal columns) to `'valueYTotalPercent'` / `'valueXTotalPercent'`.
 * Columns with no `stacked` flag render side-by-side (dodged); area bands with
 * none are independent overlapping bands.
 */
function detectStackMode(seriesList: AmXYSeries[]): 'none' | 'normal' | '100%' {
  let anyStacked = false;
  for (const series of seriesList) {
    if (series.get('stacked') !== true)
      continue;
    anyStacked = true;
    const show = series.get('valueYShow') ?? series.get('valueXShow');
    if (show === 'valueYTotalPercent' || show === 'valueXTotalPercent')
      return '100%';
  }
  return anyStacked ? 'normal' : 'none';
}

function readChartTitle(chart: AmChart): string | undefined {
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
