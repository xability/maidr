/**
 * Extracts data from Chart.js chart instances and converts it to the MAIDR
 * JSON schema format.
 *
 * Supported chart types (those with a genuine MAIDR trace-type equivalent):
 * - Native: bar (plain/stacked/dodged), line (plain or stepped), scatter,
 *   bubble, pie, doughnut
 * - Plugin: boxplot, candlestick/ohlc, matrix (heatmap)
 *
 * Unsupported types (radar, polarArea, treemap, sankey, etc.) are rejected with
 * an explicit error rather than silently mapped to a bar chart, because MAIDR
 * has no semantically equivalent trace for them.
 */

import type { BarPoint, BoxPoint, CandlestickPoint, HeatmapData, LinePoint, Maidr, MaidrLayer, MaidrSubplot, NavigateCallback, PiePoint, ScatterPoint, SegmentedPoint, StepDirection } from '../../type/grammar';
import type { ChartJsChart, ChartJsDataset, ChartJsDataValue, MaidrPluginOptions } from './types';
import { Orientation, TraceType } from '../../type/grammar';

// ---------------------------------------------------------------------------
// Monotonic ID counter for guaranteed unique IDs
// ---------------------------------------------------------------------------

let nextId = 0;

/**
 * Result of extracting a Chart.js chart, pairing the MAIDR schema with the
 * bookkeeping the plugin needs to route navigation back into the chart.
 */
export interface ChartJsExtraction {
  /** The MAIDR data object, ready to be passed to `<Maidr data={...}>`. */
  maidr: Maidr;
  /**
   * Figure-unique layer id → original Chart.js dataset indices backing that
   * layer, in MAIDR row order. For axis-stacked panels each subplot only sees
   * a partition of `chart.data.datasets`, so MAIDR row indices no longer equal
   * Chart.js dataset indices — this map restores that correspondence.
   */
  layerDatasetIndices: Map<string, number[]>;
}

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
  return extractChartData(chart, pluginOptions, onNavigate).maidr;
}

/**
 * Extracts MAIDR data plus the layer→dataset routing map from a Chart.js
 * chart instance.
 *
 * Charts using Chart.js axis stacking (2+ scales of the same axis kind laid
 * out in separate bands via the scale `stack` option) become multi-subplot
 * figures: one MAIDR subplot per stacked panel, arranged as N rows × 1 column
 * for y-stacks (rows bottom-first, matching the grammar's matplotlib row
 * convention so Up/Down arrows track the on-canvas direction) and 1 row × N
 * columns for x-stacks (left-to-right). All other charts — including classic
 * dual-axis overlays — remain a single subplot.
 */
export function extractChartData(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  onNavigate?: NavigateCallback,
): ChartJsExtraction {
  const chartType = chart.config.type;

  const layout = detectStackedPanels(chart);
  const paneled = layout === null
    ? null
    : extractPanelSubplots(chart, chartType, layout, pluginOptions);

  if (paneled !== null) {
    return {
      maidr: {
        id: `maidr-chartjs-${chart.canvas.id || 'chart'}-${nextId++}`,
        title: pluginOptions?.title ?? getChartTitle(chart),
        subplots: paneled.subplots,
        ...(onNavigate ? { onNavigate } : {}),
      },
      layerDatasetIndices: paneled.layerDatasetIndices,
    };
  }

  const localDatasets: LocalDatasetIndices = new Map();
  const layers = extractLayers(chart, chartType, pluginOptions, localDatasets);

  return {
    maidr: {
      id: `maidr-chartjs-${chart.canvas.id || 'chart'}-${nextId++}`,
      title: pluginOptions?.title ?? getChartTitle(chart),
      subplots: [[{ layers }]],
      ...(onNavigate ? { onNavigate } : {}),
    },
    layerDatasetIndices: singleSubplotDatasetIndices(chart, layers, localDatasets),
  };
}

// ---------------------------------------------------------------------------
// Axis-stacked panel detection & extraction
// ---------------------------------------------------------------------------

type AxisKind = 'x' | 'y';

/** One stacked panel: the scale it hangs off plus its dataset partition. */
interface PanelPartition {
  scaleId: string;
  datasets: ChartJsDataset[];
  /** Original indices of `datasets` within `chart.data.datasets`. */
  datasetIndices: number[];
}

interface StackedPanelLayout {
  axisKind: AxisKind;
  panels: PanelPartition[];
}

/** Which axis a scale belongs to: explicit option, runtime, or id prefix. */
function scaleAxisKind(chart: ChartJsChart, scaleId: string): AxisKind | null {
  const declared = chart.options.scales?.[scaleId]?.axis;
  if (declared === 'x' || declared === 'y')
    return declared;
  const runtime = chart.scales?.[scaleId]?.axis;
  if (runtime === 'x' || runtime === 'y')
    return runtime;
  const prefix = scaleId.charAt(0);
  return prefix === 'x' || prefix === 'y' ? prefix : null;
}

/** The static edge positions Chart.js lays scales out against. */
const STATIC_SCALE_POSITIONS = ['left', 'right', 'top', 'bottom'] as const;
type StaticScalePosition = (typeof STATIC_SCALE_POSITIONS)[number];

function isStaticScalePosition(value: unknown): value is StaticScalePosition {
  return STATIC_SCALE_POSITIONS.includes(value as StaticScalePosition);
}

/**
 * Where a scale is placed: the declared static position, the laid-out runtime
 * position, or the Chart.js default for the axis kind.
 */
function scalePosition(
  chart: ChartJsChart,
  scaleId: string,
  axisKind: AxisKind,
): StaticScalePosition {
  const declared = chart.options.scales?.[scaleId]?.position;
  if (isStaticScalePosition(declared))
    return declared;
  const runtime = chart.scales?.[scaleId]?.position;
  if (isStaticScalePosition(runtime))
    return runtime;
  return axisKind === 'y' ? 'left' : 'bottom';
}

/**
 * Whether the given same-kind scales are laid out as stacked (non-overlapping)
 * bands: either 2+ of them share the same axis-stacking group, or the runtime
 * geometry shows disjoint bands along the axis direction.
 *
 * Chart.js only bands scales that share BOTH the same `stack` name AND the
 * same position (core layouts key stacks by `position + stack`); scales with
 * different stack names, or the same name on opposite edges, each occupy the
 * full chart area as a classic dual-axis overlay.
 */
function isStackedScaleLayout(
  chart: ChartJsChart,
  scaleIds: string[],
  axisKind: AxisKind,
): boolean {
  const scales = chart.options.scales ?? {};
  const stackGroupSizes = new Map<string, number>();
  for (const id of scaleIds) {
    const stack = scales[id]?.stack;
    if (typeof stack !== 'string' || stack === '')
      continue;
    const key = `${scalePosition(chart, id, axisKind)}|${stack}`;
    const size = (stackGroupSizes.get(key) ?? 0) + 1;
    if (size >= 2)
      return true;
    stackGroupSizes.set(key, size);
  }
  return hasDisjointBands(chart, scaleIds, axisKind);
}

/** True when every scale occupies its own band (no pixel-range overlap). */
function hasDisjointBands(
  chart: ChartJsChart,
  scaleIds: string[],
  axisKind: AxisKind,
): boolean {
  const runtime = chart.scales;
  if (!runtime)
    return false;

  const bands: [number, number][] = [];
  for (const id of scaleIds) {
    const scale = runtime[id];
    if (!scale)
      return false;
    bands.push(axisKind === 'y' ? [scale.top, scale.bottom] : [scale.left, scale.right]);
  }

  bands.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < bands.length; i++) {
    // 1px tolerance for adjacent bands sharing a boundary pixel.
    if (bands[i][0] < bands[i - 1][1] - 1)
      return false;
  }
  return true;
}

/**
 * Detect Chart.js axis-stacked panels: 2+ scales of the same axis kind laid
 * out in separate bands, with datasets partitioned among them. Returns `null`
 * for everything else (single-scale charts, dual-axis overlays, stacks that
 * all datasets ignore), which keeps those charts a single subplot.
 */
function detectStackedPanels(chart: ChartJsChart): StackedPanelLayout | null {
  const scales = chart.options.scales;
  if (!scales)
    return null;

  const scaleIdsInDeclarationOrder = Object.keys(scales);

  for (const axisKind of ['y', 'x'] as const) {
    const kindIds = scaleIdsInDeclarationOrder
      .filter(id => scaleAxisKind(chart, id) === axisKind);
    if (kindIds.length < 2)
      continue;
    if (!isStackedScaleLayout(chart, kindIds, axisKind))
      continue;

    const panels = partitionDatasets(chart, kindIds, axisKind);
    if (panels.length < 2)
      continue;

    return { axisKind, panels: orderPanelsByGeometry(chart, panels, axisKind) };
  }

  return null;
}

/** Group datasets by the scale id they are plotted against. */
function partitionDatasets(
  chart: ChartJsChart,
  kindIds: string[],
  axisKind: AxisKind,
): PanelPartition[] {
  const byScale = new Map<string, PanelPartition>();

  chart.data.datasets.forEach((dataset, index) => {
    const explicitId = axisKind === 'y' ? dataset.yAxisID : dataset.xAxisID;
    // Chart.js resolves a missing/unknown axis id to the FIRST declared
    // same-kind scale (mergeScaleConfig `firstIDs` / `getFirstScaleId`), not
    // to the literal 'y'/'x' — mirror that so no phantom panel is invented.
    const scaleId = explicitId !== undefined && kindIds.includes(explicitId)
      ? explicitId
      : kindIds[0];
    let panel = byScale.get(scaleId);
    if (!panel) {
      panel = { scaleId, datasets: [], datasetIndices: [] };
      byScale.set(scaleId, panel);
    }
    panel.datasets.push(dataset);
    panel.datasetIndices.push(index);
  });

  return [...byScale.values()];
}

/**
 * Order panels to match MAIDR grid-row semantics. Chart.js draws to a
 * `<canvas>`, so the core layout pass has no DOM geometry to measure and uses
 * raw data order with the grammar's native matplotlib convention: grid row 0
 * is the BOTTOM row and Up Arrow moves to row+1. y-stack panels are therefore
 * ordered bottom-first (descending runtime `top`) so vertical arrow keys move
 * the way the panels look on canvas; x-stack panels read left-to-right
 * (ascending runtime `left`). Without runtime layout, scale declaration order
 * stands in for top-to-bottom / left-to-right on-canvas order.
 */
function orderPanelsByGeometry(
  chart: ChartJsChart,
  panels: PanelPartition[],
  axisKind: AxisKind,
): PanelPartition[] {
  const declarationOrder = Object.keys(chart.options.scales ?? {});
  return [...panels].sort((a, b) => {
    const runtimeA = chart.scales?.[a.scaleId];
    const runtimeB = chart.scales?.[b.scaleId];
    if (runtimeA && runtimeB) {
      return axisKind === 'y'
        ? runtimeB.top - runtimeA.top
        : runtimeA.left - runtimeB.left;
    }
    const declared = declarationOrder.indexOf(a.scaleId) - declarationOrder.indexOf(b.scaleId);
    return axisKind === 'y' ? -declared : declared;
  });
}

/**
 * A read-only view of the chart restricted to one panel: only the panel's
 * datasets, and with the panel's own scale substituted as the default value
 * scale so the existing per-type extractors (which read `scales.x`/`scales.y`)
 * pick up the panel's axis label and stacked flag unchanged.
 */
function createPanelView(
  chart: ChartJsChart,
  panel: PanelPartition,
  axisKind: AxisKind,
): ChartJsChart {
  const scales = chart.options.scales ?? {};
  const panelScale = scales[panel.scaleId];

  return {
    canvas: chart.canvas,
    config: chart.config,
    data: { labels: chart.data.labels, datasets: panel.datasets },
    options: {
      ...chart.options,
      scales: panelScale ? { ...scales, [axisKind]: panelScale } : scales,
    },
    scales: chart.scales,
    getDatasetMeta: datasetIndex => chart.getDatasetMeta(datasetIndex),
    setActiveElements: elements => chart.setActiveElements(elements),
    tooltip: chart.tooltip,
    update: mode => chart.update(mode),
  };
}

/**
 * Build one MAIDR subplot per stacked panel by running the existing per-type
 * layer extraction on each dataset partition. Layer ids are rewritten to
 * `{panelIndex}_{localId}` so they stay unique across the whole figure, and
 * the first layer's title carries the panel display name. Returns `null`
 * when fewer than two panels yield layers, so callers fall back to the
 * single-subplot path.
 */
function extractPanelSubplots(
  chart: ChartJsChart,
  chartType: string,
  layout: StackedPanelLayout,
  pluginOptions?: MaidrPluginOptions,
): { subplots: MaidrSubplot[][]; layerDatasetIndices: Map<string, number[]> } | null {
  const panelSubplots: MaidrSubplot[] = [];
  const layerDatasetIndices = new Map<string, number[]>();

  for (const panel of layout.panels) {
    const view = createPanelView(chart, panel, layout.axisKind);
    const localDatasets: LocalDatasetIndices = new Map();
    const layers = extractLayers(view, chartType, pluginOptions, localDatasets);
    // Never emit a subplot with no layers — it crashes the core Figure model.
    if (layers.length === 0)
      continue;

    const panelIndex = panelSubplots.length;
    for (const layer of layers) {
      const localId = layer.id;
      layer.id = `${panelIndex}_${localId}`;
      layerDatasetIndices.set(layer.id, layerDatasets(layer, localId, panel, localDatasets));
    }

    // The first layer's title is the panel's display name in subplot
    // summaries: prefer the panel scale's own title, then whatever the
    // extractor set, then the first dataset label.
    const scaleTitle = chart.options.scales?.[panel.scaleId]?.title?.text;
    const panelTitle = scaleTitle ?? layers[0].title ?? panel.datasets[0]?.label;
    if (panelTitle !== undefined)
      layers[0].title = panelTitle;

    panelSubplots.push({ layers });
  }

  if (panelSubplots.length < 2)
    return null;

  // y-stacks become N rows × 1 col with rows BOTTOM-FIRST (see
  // orderPanelsByGeometry): row 0 is the bottom panel, so the core's
  // Up Arrow (row+1) moves visually up. Panel numbering consequently
  // announces bottom-up ("Subplot 1" = bottom panel). x-stacks become
  // 1 row × N cols in left-to-right reading order.
  const subplots = layout.axisKind === 'y'
    ? panelSubplots.map(subplot => [subplot])
    : [panelSubplots];

  return { subplots, layerDatasetIndices };
}

/** Original chart dataset indices backing one panel layer, in MAIDR row order. */
function layerDatasets(
  layer: MaidrLayer,
  localId: string,
  panel: PanelPartition,
  localDatasets: LocalDatasetIndices,
): number[] {
  // A layer backed by only some of the panel's datasets says which, in panel
  // positions; translate those into indices within the whole chart.
  //
  // The `?? 0` is unreachable while the invariant holds: an extractor fills
  // `localDatasets` by walking the very datasets it was handed — this panel's
  // partition — so every position it declares indexes `datasetIndices`. It is
  // a fallback rather than a throw because a stray index would misroute one
  // highlight, and taking the chart's whole accessibility layer down over that
  // is the worse failure.
  const declared = localDatasets.get(localId);
  if (declared) {
    return declared.map(local => panel.datasetIndices[local] ?? 0);
  }

  if (layer.type === TraceType.SCATTER) {
    // Scatter emits one layer per dataset with local id = partition position.
    const localIndex = Number.parseInt(localId, 10) || 0;
    return [panel.datasetIndices[localIndex] ?? panel.datasetIndices[0] ?? 0];
  }
  return panel.datasetIndices;
}

/**
 * Layer→dataset map for the single-subplot path, mirroring the historical
 * conventions: scatter layer ids are the dataset index, every other layer is
 * backed by all datasets in order (MAIDR row = Chart.js dataset index).
 */
function singleSubplotDatasetIndices(
  chart: ChartJsChart,
  layers: MaidrLayer[],
  localDatasets: LocalDatasetIndices,
): Map<string, number[]> {
  const allIndices = chart.data.datasets.map((_, index) => index);
  const map = new Map<string, number[]>();
  for (const layer of layers) {
    const declared = localDatasets.get(layer.id);
    map.set(
      layer.id,
      declared ?? (layer.type === TraceType.SCATTER
        ? [Number.parseInt(layer.id, 10) || 0]
        : allIndices),
    );
  }
  return map;
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

/**
 * Extract a finite numeric value from a heterogeneous Chart.js dataset entry.
 *
 * Chart.js uses `null` (and `NaN`, via the `spanGaps` feature) as the
 * documented missing-data marker. Rather than fabricate a `0` (which would be
 * announced and sonified as real data) or pass `NaN` through (which poisons the
 * model's min/max and silences audio for the whole trace), gaps are reported as
 * `null` so callers can skip them and keep the accessible channels truthful.
 *
 * @param value - A raw Chart.js dataset value.
 * @returns The finite number, or `null` when the entry is a gap/non-numeric.
 */
export function toFiniteNumber(value: ChartJsDataValue): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  if (value != null && typeof value === 'object') {
    if ('y' in value && typeof value.y === 'number')
      return Number.isFinite(value.y) ? value.y : null;
    if ('v' in value && typeof value.v === 'number')
      return Number.isFinite(value.v) ? value.v : null;
  }
  return null;
}

export function isPointValue(v: ChartJsDataValue): v is { x: number; y: number; r?: number } {
  return v != null && typeof v === 'object' && 'x' in v && 'y' in v && !('o' in v) && !('v' in v) && !('median' in v);
}

function isBoxplotValue(v: ChartJsDataValue): v is { min: number; q1: number; median: number; q3: number; max: number; outliers?: number[] } {
  return v != null && typeof v === 'object' && 'median' in v;
}

function isCandlestickValue(v: ChartJsDataValue): v is { x: number | string; o: number; h: number; l: number; c: number } {
  return v != null && typeof v === 'object' && 'o' in v && 'h' in v && 'l' in v && 'c' in v;
}

/**
 * Format a candlestick x-axis value for human/screen-reader consumption.
 * The Chart.js financial plugin requires a time scale, so `x` is typically
 * epoch milliseconds (e.g. from Luxon). A bare `String(...)` would surface
 * "1704088800000" rather than a readable date. Detect epoch-ms values and
 * format as ISO date; otherwise pass through.
 */
function formatCandlestickValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1e11)
    return new Date(value).toISOString().slice(0, 10);
  return String(value);
}

export function isMatrixValue(v: ChartJsDataValue): v is { x: string | number; y: string | number; v: number } {
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

/**
 * Positions within the datasets an extractor was given — the whole chart, or
 * one panel's partition of it — backing each layer id it emitted, in MAIDR row
 * order. Only filled in where a layer is backed by some of those datasets
 * rather than all of them; callers fall back to the per-type default.
 */
type LocalDatasetIndices = Map<string, number[]>;

function extractLayers(
  chart: ChartJsChart,
  chartType: string,
  pluginOptions?: MaidrPluginOptions,
  datasetIndices?: LocalDatasetIndices,
): MaidrLayer[] {
  switch (chartType) {
    case 'bar':
      return extractBarLayers(chart, pluginOptions);
    case 'line':
      return extractLineLayers(chart, pluginOptions, datasetIndices);
    case 'scatter':
    case 'bubble':
      return extractScatterLayers(chart, pluginOptions);
    case 'pie':
    case 'doughnut':
      return extractPieLayers(chart, pluginOptions, datasetIndices);
    case 'boxplot':
      return extractBoxplotLayers(chart, pluginOptions);
    case 'candlestick':
    case 'ohlc':
      return extractCandlestickLayers(chart, pluginOptions);
    case 'matrix':
      return extractHeatmapLayers(chart, pluginOptions);
    default:
      throw new Error(
        `MAIDR Chart.js adapter: unsupported chart type "${chartType}". `
        + 'Supported types: bar, line, scatter, bubble, pie, doughnut, boxplot, '
        + 'candlestick, ohlc, matrix.',
      );
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
  // Horizontal bars (`indexAxis: 'y'`) carry the value on X and the category on
  // Y, matching how `AbstractBarPlot` reads `barValues` for HORIZONTAL. Gap
  // markers (`null` / `NaN`) are skipped so they are never announced or
  // sonified as fabricated zeros.
  const isHorizontal = chart.options.indexAxis === 'y';
  const points: BarPoint[] = [];
  dataset.data.forEach((value, i) => {
    const num = toFiniteNumber(value);
    if (num === null)
      return;
    points.push(isHorizontal
      ? { x: num, y: labels[i] ?? i }
      : { x: labels[i] ?? i, y: num });
  });

  return {
    id: String(id),
    type: TraceType.BAR,
    title: dataset.label,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: {
      x: { label: getAxisLabel(chart, 'x', pluginOptions) },
      y: { label: getAxisLabel(chart, 'y', pluginOptions) },
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
  const numCategories = Math.max(0, labels.length, ...data.datasets.map(ds => ds.data.length));

  // MAIDR's `SegmentedTrace` indexes its 2-D data as `points[row][col]` where
  // `row` is the group (z) and `col` is the category (x). Iterate by dataset
  // (group) first, then categories within each group, to match that shape.
  // Horizontal bars (`indexAxis: 'y'`) swap value/category between X and Y.
  const isHorizontal = chart.options.indexAxis === 'y';
  const points: SegmentedPoint[][] = [];
  for (const dataset of data.datasets) {
    const groupPoints: SegmentedPoint[] = [];
    for (let j = 0; j < numCategories; j++) {
      // The grid must stay rectangular (the model's stacked-summary row sums
      // across equal-length groups), so gaps collapse to 0 — a missing segment
      // contributes nothing — while still guarding against NaN poisoning.
      const num = toFiniteNumber(dataset.data[j]) ?? 0;
      groupPoints.push(isHorizontal
        ? { x: num, y: labels[j] ?? j, z: dataset.label ?? '' }
        : { x: labels[j] ?? j, y: num, z: dataset.label ?? '' });
    }
    points.push(groupPoints);
  }

  return [
    {
      id: '0',
      type: traceType,
      ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
      axes: {
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
        z: { label: 'Group' },
      },
      data: points,
    },
  ];
}

// ---------------------------------------------------------------------------
// Line chart extraction
// ---------------------------------------------------------------------------

/**
 * Where each Chart.js `stepped` value puts the riser, in {@link StepDirection}
 * terms, read off `_steppedLineTo`: `'after'` draws the riser at the previous
 * x and then runs flat at the new level (`vh`), while `'before'` runs flat at
 * the old level up to the next x and rises there (`hv`).
 */
const STEP_DIRECTION_BY_OPTION: Partial<Record<string, StepDirection>> = {
  before: 'hv',
  after: 'vh',
  middle: 'mid',
};

/**
 * The step convention a line dataset draws, or `undefined` when it draws an
 * ordinary interpolated line. A dataset's own `stepped` wins over the chart's
 * `elements.line` default, which is how Chart.js resolves it.
 */
function stepDirectionOf(
  dataset: ChartJsDataset,
  chart: ChartJsChart,
): StepDirection | undefined {
  const stepped = dataset.stepped ?? chart.options.elements?.line?.stepped;
  if (stepped === undefined || stepped === false) {
    return undefined;
  }
  // Chart.js documents the bare `true` as its 'before' default.
  return stepped === true ? 'hv' : STEP_DIRECTION_BY_OPTION[stepped];
}

function extractLineLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  datasetIndices?: LocalDatasetIndices,
): MaidrLayer[] {
  const data = chart.data;
  const labels = data.labels ?? [];

  // A chart with no datasets still emits its (empty) line layer, as callers
  // downstream expect one layer per line chart.
  if (data.datasets.length === 0) {
    return [{
      id: '0',
      type: TraceType.LINE,
      axes: {
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
      },
      data: [],
    }];
  }

  // Skip gap markers (`null` / `NaN`) so they are never sonified as a 0 tone;
  // the plugin re-derives the original Chart.js indices for highlight alignment.
  const linePoints = (dataset: ChartJsDataset, dsIdx: number): LinePoint[] => {
    const points: LinePoint[] = [];
    dataset.data.forEach((value, i) => {
      const num = toFiniteNumber(value);
      if (num === null)
        return;
      points.push({
        x: labels[i] ?? i,
        y: num,
        z: dataset.label ?? `Line ${dsIdx + 1}`,
      });
    });
    return points;
  };

  // A stepped dataset is piecewise constant rather than interpolated, so it
  // belongs to a step layer instead — one per convention, since a layer
  // announces a single `stepDirection` for all of its series. Datasets keep
  // their chart order within whichever layer they land in.
  const groups = new Map<StepDirection | '', number[]>();
  for (let dsIdx = 0; dsIdx < data.datasets.length; dsIdx++) {
    const key = stepDirectionOf(data.datasets[dsIdx], chart) ?? '';
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(dsIdx);
    } else {
      groups.set(key, [dsIdx]);
    }
  }

  const axes = {
    x: { label: getAxisLabel(chart, 'x', pluginOptions) },
    y: { label: getAxisLabel(chart, 'y', pluginOptions) },
  };

  const layers: MaidrLayer[] = [];
  // Plain lines first, so a mixed chart keeps the line layer where it was.
  const ordered = [...groups].sort(([a], [b]) => Number(a !== '') - Number(b !== ''));
  for (const [direction, indices] of ordered) {
    const id = String(layers.length);
    datasetIndices?.set(id, indices);
    layers.push({
      id,
      type: direction === '' ? TraceType.LINE : TraceType.STEP,
      axes,
      ...(direction === '' ? {} : { stepDirection: direction }),
      data: indices.map(dsIdx => linePoints(data.datasets[dsIdx], dsIdx)),
    });
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Scatter / Bubble chart extraction
// ---------------------------------------------------------------------------

function extractScatterLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  // Preserve per-dataset layers so multi-series scatter plots keep
  // their dataset distinction (needed for correct highlighting).
  return chart.data.datasets.map((dataset, idx) => {
    const scatterData: ScatterPoint[] = datasetToScatterPoints(dataset);

    return {
      id: String(idx),
      type: TraceType.SCATTER,
      title: dataset.label,
      axes: {
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
      },
      data: scatterData,
    };
  });
}

function datasetToScatterPoints(dataset: ChartJsDataset): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const point of dataset.data) {
    if (isPointValue(point)) {
      points.push({ x: point.x, y: point.y });
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// Pie / doughnut chart extraction
// ---------------------------------------------------------------------------

/**
 * Axis labels for a pie layer.
 *
 * A pie has no Chart.js scales, so {@link getAxisLabel} would fall through to
 * its `'X'`/`'Y'` default and announce "X is Apples, Y is 30" — naming neither
 * position. Name what the two mean on a pie instead: `x` is what the slice
 * labels are, `y` is what their magnitudes measure. An explicit plugin `axes`
 * override still wins.
 */
function getPieAxes(pluginOptions?: MaidrPluginOptions): MaidrLayer['axes'] {
  return {
    x: { label: pluginOptions?.axes?.x ?? 'Category' },
    y: { label: pluginOptions?.axes?.y ?? 'Value' },
  };
}

/**
 * Extracts one pie layer per dataset.
 *
 * Chart.js draws a second dataset as a concentric ring rather than as more
 * slices of the same circle, so each dataset is its own pie with its own total
 * and its own percentages. One layer each keeps those totals honest and lets
 * Page Up / Page Down move between the rings. A doughnut differs from a pie
 * only by its cutout, so both arrive here.
 */
function extractPieLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  datasetIndices?: LocalDatasetIndices,
): MaidrLayer[] {
  const labels = chart.data.labels ?? [];
  const axes = getPieAxes(pluginOptions);

  return chart.data.datasets.map((dataset, dsIdx) => {
    // Gap markers (`null` / `NaN`) are skipped rather than collapsed to 0: a
    // fabricated zero would be announced and sonified as a measured slice, and
    // would pin the bottom of the range every other slice is pitched against.
    const points: PiePoint[] = [];
    dataset.data.forEach((value, i) => {
      const num = toFiniteNumber(value);
      if (num === null)
        return;
      points.push({ x: labels[i] ?? i, y: num });
    });

    // Each layer is backed by exactly one dataset, so say which: the caller's
    // per-type default (all datasets, in order) would route every ring's
    // highlight to the first one.
    const id = String(dsIdx);
    datasetIndices?.set(id, [dsIdx]);

    return {
      id,
      type: TraceType.PIE,
      title: dataset.label,
      axes,
      data: points,
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
          z: String(labels[i] ?? dataset.label ?? `Box ${i + 1}`),
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
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
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
          value: formatCandlestickValue(point.x),
          open: point.o,
          high: point.h,
          low: point.l,
          close: point.c,
          // Chart.js financial plugin does not include volume data; default to 0
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
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
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
        valueMap.set(`${x}\0${y}`, point.v);
      }
    }
  }

  const points: number[][] = yLabels.map(y =>
    xLabels.map(x => valueMap.get(`${x}\0${y}`) ?? 0),
  );

  const heatmapData: HeatmapData = { x: xLabels, y: yLabels, points };

  return [
    {
      id: '0',
      type: TraceType.HEATMAP,
      axes: {
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
      },
      data: heatmapData,
    },
  ];
}
