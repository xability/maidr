/**
 * Extracts data from Chart.js chart instances and converts it to the MAIDR
 * JSON schema format.
 *
 * Supported chart types (those with a genuine MAIDR trace-type equivalent):
 * - Native: bar (plain/stacked/dodged/diverging), floating bar (gantt,
 *   waterfall, dumbbell), line (plain, stepped, area, stacked and normalized
 *   area, bump, dot, survival), scatter, bubble, pie, doughnut, gauge, radar,
 *   polarArea
 * - Plugin: boxplot, candlestick/ohlc, matrix (heatmap)
 *
 * Unsupported types (treemap, sankey, etc.) are rejected with an explicit
 * error rather than silently mapped to a bar chart, because MAIDR has no
 * semantically equivalent trace for them.
 */

import type { FieldRef, MaidrTraceDeclaration, ManhattanDeclaration, ScatterDeclaration, VolcanoDeclaration } from '../../type/declaration';
import type { BarPoint, BoxPoint, CandlestickPoint, DumbbellData, DumbbellPoint, GanttData, GanttPoint, GaugePoint, HeatmapData, LinePoint, Maidr, MaidrLayer, MaidrSubplot, NavigateCallback, PiePoint, ScatterPoint, SegmentedPoint, StepDirection, SurvivalPoint, ThresholdOptions, VolcanoPoint, WaterfallKind, WaterfallPoint } from '../../type/grammar';
import type { DeclarationContext } from '../shared/traceDeclaration';
import type { ChartJsChart, ChartJsDataset, ChartJsDataValue, ChartJsPointValue, ChartJsRangeBound, MaidrPluginOptions } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import { resolveFieldRef, validateDeclaration, warnUnresolvedRef } from '../shared/traceDeclaration';

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

/**
 * The numeric position of one end of a floating bar.
 *
 * A `Date` is how Chart.js's own range-bar recipes write a bound on a time
 * scale, and its epoch value is exactly what the scale plots it at, so the two
 * forms are the same number to everything downstream.
 *
 * @param bound - One entry of a `[start, end]` tuple
 * @returns The position, or `null` when the entry carries no usable one
 */
function toRangeBound(bound: ChartJsRangeBound): number | null {
  const value = bound instanceof Date ? bound.valueOf() : bound;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Whether a dataset entry is a floating bar — a `[start, end]` pair rather
 * than a magnitude measured from the baseline.
 *
 * This is the shape Chart.js gantt lanes, range bars and waterfall steps are
 * all written in, and the one {@link toFiniteNumber} cannot read: an array is
 * an object with neither a `y` nor a `v`, so before this guard existed such a
 * chart extracted as a bar layer holding no points at all.
 *
 * @param v - A raw Chart.js dataset value
 * @returns True when the entry is a usable `[start, end]` pair
 */
export function isRangeValue(v: ChartJsDataValue): v is [ChartJsRangeBound, ChartJsRangeBound] {
  return Array.isArray(v)
    && v.length === 2
    && toRangeBound(v[0]) !== null
    && toRangeBound(v[1]) !== null;
}

/**
 * The two ends of a floating bar, as positions on the value axis.
 *
 * @param value - An entry {@link isRangeValue} has accepted
 * @returns Its start and end
 */
function rangeBounds(value: [ChartJsRangeBound, ChartJsRangeBound]): [number, number] {
  // Both bounds are known good: nothing reaches here without `isRangeValue`.
  return [toRangeBound(value[0]) ?? 0, toRangeBound(value[1]) ?? 0];
}

export function isPointValue(v: ChartJsDataValue): v is ChartJsPointValue {
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

// ---------------------------------------------------------------------------
// The co-located `maidr` declaration
// ---------------------------------------------------------------------------

/** How this adapter names itself in a declaration warning. */
const ADAPTER = 'Chart.js';

/**
 * Every dataset's validated `maidr` block, in chart order, `null` where the
 * dataset carries none this adapter can read.
 *
 * Read once per extraction, before any layer is built, so a block with a typo
 * in it is reported once rather than once per reader that consults it.
 */
type DatasetDeclarations = readonly (MaidrTraceDeclaration | null)[];

/**
 * Which Chart.js constructs can back each declared trace type.
 *
 * A declaration says what a drawing means; it cannot make a pie chart into a
 * survival curve. A type absent from this table is one the Chart.js adapter
 * has no reading for at all — the union covers every library, and a hexbin or
 * a choropleth has no Chart.js construct behind it here.
 */
const DECLARED_TYPE_CONSTRUCTS: Partial<Record<TraceType, readonly string[]>> = {
  [TraceType.SURVIVAL]: ['line'],
  [TraceType.SCATTER]: ['scatter', 'bubble'],
  [TraceType.VOLCANO]: ['scatter', 'bubble'],
  [TraceType.MANHATTAN]: ['scatter', 'bubble'],
};

/**
 * Emits one adapter-prefixed warning.
 *
 * @param message - The sentence following the prefix
 */
function warn(message: string): void {
  console.warn(`[MAIDR ${ADAPTER}] ${message}`);
}

/**
 * How a warning names a dataset, so its author can find it.
 *
 * @param dataset - The dataset being read
 * @param index - Its position in `chart.data.datasets`
 * @returns A locating phrase — a label where the dataset has one
 */
function datasetRef(dataset: ChartJsDataset, index: number): string {
  return dataset.label ? `dataset "${dataset.label}"` : `dataset ${index}`;
}

/** Who is reading a dataset's declaration, and what they are reading it off. */
function declarationContext(dataset: ChartJsDataset, index: number): DeclarationContext {
  return { adapter: ADAPTER, seriesRef: datasetRef(dataset, index) };
}

/**
 * Whether the dataset carries a `maidr` block at all, readable or not.
 *
 * Distinct from having a usable declaration: a block this adapter rejected is
 * still the author saying something about this dataset, which is what keeps it
 * out of a neighbour's merged layer.
 *
 * @param dataset - The dataset being read
 * @returns True when a block was written on it
 */
function carriesDeclaration(dataset: ChartJsDataset): boolean {
  return dataset.maidr !== undefined && dataset.maidr !== null;
}

/**
 * Reads every dataset's co-located `maidr` block.
 *
 * Two failures are settled here so no layer builder has to: a block the shared
 * validator rejects, and a block declaring a type this adapter cannot back
 * with the construct it was written on. Both degrade to `null` — the chart is
 * read exactly as it would have been with no block at all — and both say so.
 *
 * @param chart - The chart being read
 * @param chartType - What Chart.js is drawing the chart as
 * @returns One entry per dataset, in chart order
 */
function readDeclarations(chart: ChartJsChart, chartType: string): DatasetDeclarations {
  return chart.data.datasets.map((dataset, index) => {
    const declaration = validateDeclaration(
      dataset.maidr,
      declarationContext(dataset, index),
    );
    if (declaration === null)
      return null;

    const constructs = DECLARED_TYPE_CONSTRUCTS[declaration.type];
    const drawn = drawnKind(dataset, chartType);
    if (constructs === undefined) {
      warn(
        `maidr declaration for "${declaration.type}" on ${datasetRef(dataset, index)} `
        + `names a trace the Chart.js adapter has no reading for; `
        + `reading it as the undeclared chart.`,
      );
      return null;
    }
    if (!constructs.includes(drawn)) {
      warn(
        `maidr declaration for "${declaration.type}" on ${datasetRef(dataset, index)} `
        + `needs a ${constructs.join(' or ')} dataset and this one is drawn as "${drawn}"; `
        + `reading it as the undeclared chart.`,
      );
      return null;
    }
    return declaration;
  });
}

/**
 * What Chart.js draws a dataset with: its own `type`, or the chart's.
 *
 * @param dataset - The dataset being read
 * @param chartType - What Chart.js is drawing the chart as
 * @returns The resolved Chart.js type string
 */
function drawnKind(dataset: ChartJsDataset, chartType: string): string {
  return dataset.type ?? chartType;
}

/**
 * What the page's author declared the chart to be, if anything.
 *
 * The escape hatch for the figures Chart.js draws as a recipe: it wins over
 * every heuristic below, and for the three readings no heuristic can reach —
 * a survival curve, a dumbbell, a gauge — it is the only way in.
 *
 * A co-located block on a dataset outranks the chart-wide
 * {@link MaidrPluginOptions.traceType}, which stays the shorthand for a figure
 * drawn as a single dataset. Where the two disagree the block wins and both
 * are named, because a chart carrying two answers is an edit half-finished.
 *
 * Only one whole-chart reading can win, so where several datasets declare
 * differing types the first in chart order wins and every type found is
 * named. Several datasets declaring the same type is the ordinary case —
 * a survival curve's arms each say what they are — and passes silently.
 *
 * @param declarations - Every dataset's validated block, in chart order
 * @param pluginOptions - Optional per-chart plugin options
 * @returns The declared trace type, or `undefined` when the page does not say
 */
function declaredType(
  declarations: DatasetDeclarations,
  pluginOptions?: MaidrPluginOptions,
): TraceType | undefined {
  const declaredTypes = [...new Set(
    declarations
      .filter((one): one is MaidrTraceDeclaration => one !== null)
      .map(one => one.type),
  )];
  const declared = declaredTypes[0];
  const chartWide = pluginOptions?.traceType;
  if (declared === undefined)
    return chartWide;
  // Several datasets may carry a block — a survival curve's arms each declare
  // themselves — but only one whole-chart reading can win, so blocks that
  // disagree are an edit half-finished in the same way a block disagreeing
  // with the chart-wide option is, and are named the same way.
  if (declaredTypes.length > 1) {
    warn(
      `maidr declarations on this chart read it as `
      + `${declaredTypes.map(one => `"${one}"`).join(' and ')}; a chart has one `
      + `whole-chart reading, so the first ("${declared}") wins.`,
    );
  }
  if (chartWide !== undefined && chartWide !== declared) {
    warn(
      `a maidr declaration reads this chart as "${declared}" and `
      + `plugins.maidr.traceType reads it as "${chartWide}"; the declaration wins.`,
    );
  }
  return declared;
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
  const declarations = readDeclarations(chart, chartType);

  switch (chartType) {
    case 'bar':
      return extractBarLayers(chart, declarations, pluginOptions);
    case 'line':
      return extractLineLayers(chart, declarations, pluginOptions, datasetIndices);
    case 'scatter':
    case 'bubble':
      return extractScatterLayers(chart, declarations, pluginOptions, datasetIndices);
    case 'pie':
    case 'doughnut':
      return extractPieLayers(chart, declarations, pluginOptions, datasetIndices);
    // A radar joins its values into a closed outline and a polar area draws
    // them as wedges; a reader navigates the same spokes either way, which is
    // why `RadarTrace` serves both and the payload is identical.
    case 'radar':
      return extractRadarLayers(chart, TraceType.RADAR, pluginOptions);
    case 'polarArea':
      return extractRadarLayers(chart, TraceType.POLAR_AREA, pluginOptions);
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
        + 'Supported types: bar, line, scatter, bubble, pie, doughnut, radar, '
        + 'polarArea, boxplot, candlestick, ohlc, matrix.',
      );
  }
}

// ---------------------------------------------------------------------------
// Bar chart extraction (plain, stacked, dodged)
// ---------------------------------------------------------------------------

function extractBarLayers(
  chart: ChartJsChart,
  declarations: DatasetDeclarations,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const data = chart.data;

  if (data.datasets.length === 0)
    return [];

  // Floating bars carry two positions rather than a magnitude, so they are
  // neither a bar nor a segmented bar — checked before either.
  if (data.datasets.some(dataset => dataset.data.some(isRangeValue)))
    return [extractFloatingBarLayer(chart, declarations, pluginOptions)];

  if (data.datasets.length > 1) {
    const traceType = isStacked(chart)
      ? (isDivergingSplit(data.datasets) ? TraceType.DIVERGING : TraceType.STACKED)
      : TraceType.DODGED;
    return extractSegmentedBarLayers(chart, pluginOptions, traceType);
  }

  return [singleDatasetToBarLayer(data.datasets[0], data.labels ?? [], chart, pluginOptions)];
}

/**
 * Whether stacked datasets are drawn back to back around a shared baseline —
 * a population pyramid, or a Likert scale split around its neutral point.
 *
 * Chart.js states nothing about this: the recipe is an ordinary stacked bar
 * chart with one side's values negated, so the sign split *is* the signal.
 * The test is deliberately strict — every dataset must sit wholly on one side,
 * and both sides must be occupied — because a stacked chart that merely
 * happens to contain a negative series is not two sides of anything, and
 * announcing it as one would name a left and a right that the chart does not
 * have.
 *
 * @param datasets - The chart's datasets
 * @returns True when the datasets partition into a negative and a positive side
 */
function isDivergingSplit(datasets: ChartJsDataset[]): boolean {
  let negativeSides = 0;
  let positiveSides = 0;

  for (const dataset of datasets) {
    let hasNegative = false;
    let hasPositive = false;
    for (const value of dataset.data) {
      const num = toFiniteNumber(value);
      // Zero belongs to neither side: a category a series does not reach is
      // written as 0 on both wings of a pyramid.
      if (num === null || num === 0)
        continue;
      if (num < 0)
        hasNegative = true;
      else
        hasPositive = true;
    }
    // A series that crosses the baseline is a series of signed values, not a
    // side of a diverging chart.
    if (hasNegative && hasPositive)
      return false;
    if (hasNegative)
      negativeSides++;
    if (hasPositive)
      positiveSides++;
  }

  return negativeSides > 0 && positiveSides > 0;
}

/**
 * The positions in a chart's data, in the order its categories are drawn.
 *
 * A category axis with `reverse: true` is drawn from the far end -- the
 * last-listed category leftmost on a vertical chart, topmost on a horizontal
 * one -- while `chart.data.labels` and every dataset stay in the order they
 * were written. Nothing in the bar family re-sorts what it is handed:
 * `BarTrace` and `SegmentedTrace` announce `layer.data` as it arrives, unlike
 * `ScatterTrace`, which sorts by ascending x and so cannot be steered from an
 * adapter at all (#1007). Emitting the written order therefore reads a
 * reversed chart backwards (#1015).
 *
 * Exported because the highlight half has to walk the categories the same way.
 * Chart.js paints to canvas and none of these layers carry `selectors`, which
 * looked at first like an absence of the both-halves-must-move hazard of #988
 * or #1000 -- but the plugin outlines by *index*, through the table
 * `computeTargetMaps` builds, and a table built in the written order names a
 * different bar from the one a reversed payload announces (#1024). Sharing
 * this walk is what keeps the two from drifting apart again.
 *
 * @param chart - The chart being read
 * @param count - How many category positions it has
 * @returns `0..count-1`, turned round when the category axis is reversed
 */
export function drawnCategoryPositions(chart: ChartJsChart, count: number): number[] {
  const positions = Array.from({ length: count }, (_, i) => i);
  return chart.options.scales?.[categoryAxis(chart)]?.reverse === true
    ? positions.reverse()
    : positions;
}

/**
 * Builds a one-value-per-category layer from a single dataset.
 *
 * Serves the mark variants that differ only in what is drawn at the category:
 * a bar, and the point a dot plot draws instead. `BarTrace` reads both, so the
 * type is a parameter rather than a second copy of this.
 */
function singleDatasetToBarLayer(
  dataset: { label?: string; data: ChartJsDataValue[] },
  labels: (string | number)[],
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  id: number = 0,
  traceType: TraceType = TraceType.BAR,
): MaidrLayer {
  // Horizontal bars (`indexAxis: 'y'`) carry the value on X and the category on
  // Y, matching how `AbstractBarPlot` reads `barValues` for HORIZONTAL. Gap
  // markers (`null` / `NaN`) are skipped so they are never announced or
  // sonified as fabricated zeros.
  const isHorizontal = chart.options.indexAxis === 'y';
  const points: BarPoint[] = [];
  for (const i of drawnCategoryPositions(chart, dataset.data.length)) {
    const num = toFiniteNumber(dataset.data[i]);
    if (num === null)
      continue;
    points.push(isHorizontal
      ? { x: num, y: labels[i] ?? i }
      : { x: labels[i] ?? i, y: num });
  }

  return {
    id: String(id),
    type: traceType,
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
  const drawn = drawnCategoryPositions(chart, numCategories);
  const points: SegmentedPoint[][] = [];
  for (const dataset of data.datasets) {
    const groupPoints: SegmentedPoint[] = [];
    for (const j of drawn) {
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
// Floating bar extraction (gantt / waterfall)
// ---------------------------------------------------------------------------

/**
 * Which of a floating bar chart's two readings it is.
 *
 * Chart.js draws a gantt chart, a range bar chart and a waterfall with the
 * same `[start, end]` datum and says nothing to tell them apart, so the shape
 * of the numbers has to. A waterfall is a chain: each step begins where the
 * previous one ended, which is the whole point of the figure and something no
 * schedule does by construction. Everything else is a set of intervals, which
 * is a gantt.
 *
 * Only tested on the default vertical index axis, and only for a single
 * series. A horizontal chart is a schedule drawn the ordinary way round, and a
 * waterfall has one running total rather than several.
 *
 * @param chart - The chart the datasets belong to
 * @returns True when the steps chain into a running total
 */
function isWaterfallSequence(chart: ChartJsChart): boolean {
  if (chart.options.indexAxis === 'y' || chart.data.datasets.length !== 1)
    return false;

  const steps = chart.data.datasets[0].data.filter(isRangeValue).map(rangeBounds);
  if (steps.length < 2)
    return false;

  // The opening, closing and subtotal bars sit on the baseline instead of
  // floating, so they restate the total rather than continuing the chain and
  // are skipped rather than counted as a break in it.
  let links = 0;
  for (let i = 1; i < steps.length; i++) {
    const [start] = steps[i];
    if (start === 0)
      continue;
    if (start !== steps[i - 1][1])
      return false;
    links++;
  }
  return links > 0;
}

function extractFloatingBarLayer(
  chart: ChartJsChart,
  declarations: DatasetDeclarations,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer {
  // A dumbbell has no heuristic of its own on purpose. One interval per
  // category on a horizontal axis is the same figure a one-lane-per-task gantt
  // draws, down to the datum, so any test that read one as a dumbbell would
  // read every schedule as one too. The author says which, or it stays a gantt.
  switch (declaredType(declarations, pluginOptions)) {
    case TraceType.DUMBBELL:
      return extractDumbbellLayer(chart, pluginOptions);
    case TraceType.WATERFALL:
      return extractWaterfallLayer(chart, pluginOptions);
    case TraceType.GANTT:
      return extractGanttLayer(chart, pluginOptions);
    default:
      return isWaterfallSequence(chart)
        ? extractWaterfallLayer(chart, pluginOptions)
        : extractGanttLayer(chart, pluginOptions);
  }
}

/**
 * Extracts a declared dumbbell chart: one paired comparison per category.
 *
 * Chart.js draws it as a floating bar — the connector between the two dots is
 * the bar itself — so the two ends arrive as the `[start, end]` pair every
 * other floating bar uses. What it does not carry is what the ends *are*: the
 * datum has no room for them and the chart has no legend for a single dataset,
 * which is why they come from the plugin options and default to nothing rather
 * than being guessed from the axis.
 *
 * @param chart - The chart to read
 * @param pluginOptions - Optional per-chart plugin options
 * @returns A single dumbbell layer
 */
function extractDumbbellLayer(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer {
  const labels = chart.data.labels ?? [];
  const dataset = chart.data.datasets[0];
  // Rows with nothing to compare are skipped rather than kept as a gap: unlike
  // a gantt lane, an empty dumbbell row has no pair and so no comparison to
  // announce, and the trace's grid is a plain rows x ends rectangle.
  const points: DumbbellPoint[] = [];
  for (const i of drawnCategoryPositions(chart, dataset.data.length)) {
    const value = dataset.data[i];
    if (!isRangeValue(value))
      continue;
    const [start, end] = rangeBounds(value);
    points.push({ x: labels[i] ?? i, start, end });
  }

  const data: DumbbellData = {
    points,
    ...(pluginOptions?.startLabel ? { startLabel: pluginOptions.startLabel } : {}),
    ...(pluginOptions?.endLabel ? { endLabel: pluginOptions.endLabel } : {}),
  };

  // A dumbbell is normally drawn with its categories running down the page,
  // which is Chart.js's `indexAxis: 'y'` — the same reading a gantt gives it.
  const isHorizontal = chart.options.indexAxis === 'y';

  return {
    id: '0',
    type: TraceType.DUMBBELL,
    title: dataset.label,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: {
      x: { label: getAxisLabel(chart, 'x', pluginOptions) },
      y: { label: getAxisLabel(chart, 'y', pluginOptions) },
    },
    data,
  };
}

/**
 * What a step does to the running total.
 *
 * A bar drawn from the baseline is the opening, the closing or a subtotal: it
 * restates the total rather than contributing to it, and a reader told a
 * subtotal "rose by 950" would be hearing a contribution the chart never made.
 *
 * @param start - The step's running total before
 * @param end - Its running total after
 * @returns Which kind of step it is
 */
function waterfallKind(start: number, end: number): WaterfallKind {
  if (start === 0)
    return 'total';
  return end < start ? 'decrease' : 'increase';
}

function extractWaterfallLayer(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer {
  const labels = chart.data.labels ?? [];
  const points: WaterfallPoint[] = [];

  // The steps are read in the order they are drawn, so a reversed axis is
  // announced the way it is laid out. `isWaterfallSequence` has already run on
  // the written order, where the chaining that identifies a waterfall lives,
  // and each step's own start, end and kind are properties of the step rather
  // than of its neighbours -- so nothing here depends on the order it is
  // walked in.
  for (const i of drawnCategoryPositions(chart, chart.data.datasets[0].data.length)) {
    const value = chart.data.datasets[0].data[i];
    if (!isRangeValue(value))
      continue;
    const [start, end] = rangeBounds(value);
    points.push({
      x: labels[i] ?? i,
      start,
      end,
      delta: end - start,
      kind: waterfallKind(start, end),
    });
  }

  return {
    id: '0',
    type: TraceType.WATERFALL,
    title: chart.data.datasets[0].label,
    axes: {
      x: { label: getAxisLabel(chart, 'x', pluginOptions) },
      y: { label: getAxisLabel(chart, 'y', pluginOptions) },
    },
    data: points,
  };
}

/**
 * What a unit of the interval axis measures.
 *
 * Only the page's author knows: a linear axis is bare numbers, and a time axis
 * is parsed to epoch milliseconds however `time.unit` chooses to *display* it,
 * so reading `time.unit` here would announce "5 days" for an interval of five
 * milliseconds. A time scale therefore names the unit its numbers are actually
 * in, and everything else names nothing rather than guessing.
 *
 * @param chart - The chart being read
 * @param valueAxis - Which scale the intervals are plotted along
 * @param pluginOptions - Optional per-chart plugin options
 * @returns The unit, or `undefined` when the chart does not say
 */
function ganttUnit(
  chart: ChartJsChart,
  valueAxis: AxisKind,
  pluginOptions?: MaidrPluginOptions,
): string | undefined {
  if (pluginOptions?.unit)
    return pluginOptions.unit;
  return isTimeScale(chart, valueAxis) ? 'milliseconds' : undefined;
}

/** Whether a scale plots instants rather than plain numbers. */
function isTimeScale(chart: ChartJsChart, axisId: string): boolean {
  const type = chart.options.scales?.[axisId]?.type;
  return type === 'time' || type === 'timeseries';
}

function extractGanttLayer(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer {
  const datasets = chart.data.datasets;
  const labels = chart.data.labels ?? [];
  // A gantt drawn the ordinary way runs its bars left to right, which is
  // Chart.js's `indexAxis: 'y'`: the lanes are the category axis and the
  // intervals run along x.
  const isHorizontal = chart.options.indexAxis === 'y';
  const valueAxis: AxisKind = isHorizontal ? 'x' : 'y';

  const laneCount = Math.max(0, labels.length, ...datasets.map(ds => ds.data.length));
  // One lane per category, holding whatever every dataset booked there. A
  // second dataset is a second interval in the same lane — a resource booked
  // twice, a phase that pauses and resumes — so it is named rather than left
  // to be told apart by position.
  const namesIntervals = datasets.length > 1;
  // One order for both: `lanes` names the lanes `points` holds, position for
  // position, so a reversed axis has to turn the two of them over together or
  // every lane would be announced under its neighbour's name.
  const drawn = drawnCategoryPositions(chart, laneCount);
  const points: GanttPoint[][] = [];
  for (const lane of drawn) {
    const intervals: GanttPoint[] = [];
    for (const dataset of datasets) {
      const value = dataset.data[lane];
      if (!isRangeValue(value))
        continue;
      const [start, end] = rangeBounds(value);
      intervals.push({
        x: labels[lane] ?? lane,
        start,
        end,
        ...(namesIntervals && dataset.label ? { label: dataset.label } : {}),
      });
    }
    points.push(intervals);
  }

  const unit = ganttUnit(chart, valueAxis, pluginOptions);
  const data: GanttData = {
    points,
    // Carried for the lanes that hold nothing: an empty lane is a real
    // statement about a schedule and has no interval to name itself with.
    lanes: drawn.map(lane => labels[lane] ?? lane),
    ...(unit ? { unit } : {}),
  };

  // Epoch milliseconds are what a time scale parses its bounds to, and
  // announcing one raw says nothing a reader can place, so the interval axis
  // carries a date format that renders both ends of the span.
  const intervalAxis = {
    label: getAxisLabel(chart, valueAxis, pluginOptions),
    ...(isTimeScale(chart, valueAxis) ? { format: { type: 'date' as const } } : {}),
  };
  const laneAxis = { label: getAxisLabel(chart, isHorizontal ? 'y' : 'x', pluginOptions) };

  return {
    id: '0',
    type: TraceType.GANTT,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: isHorizontal
      ? { x: intervalAxis, y: laneAxis }
      : { x: laneAxis, y: intervalAxis },
    data,
  };
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

/**
 * Whether a line dataset is filled, making it an area band rather than a line.
 *
 * A dataset's own `fill` wins over the chart's `elements.line` default, which
 * is how Chart.js resolves it — the same precedence `stepDirectionOf` uses.
 *
 * Only `false` and an absent setting mean "no fill". Everything else names a
 * boundary and draws a band, and the awkward case is `fill: 0` — a legitimate
 * instruction to fill to dataset 0, and falsy. Testing for truthiness here
 * would read that chart as a plain line.
 *
 * @param dataset - The dataset to classify
 * @param chart - The chart it belongs to, for its element defaults
 * @returns True when the dataset draws a filled band
 */
function isFilledLine(dataset: ChartJsDataset, chart: ChartJsChart): boolean {
  const fill = dataset.fill ?? chart.options.elements?.line?.fill;
  if (fill === undefined || fill === false) {
    return false;
  }
  // The object form comes two ways: `{ target }` names a boundary, and
  // `{ value }` fills to a constant on the value axis with no target at all.
  // Reading only `target` would take the second for a plain line.
  if (typeof fill === 'object') {
    return (fill.target !== undefined && fill.target !== false)
      || fill.value !== undefined;
  }
  return true;
}

/** One layer's worth of line datasets, keyed by what makes them one layer. */
interface LineGroup {
  /** The step convention, or '' for an interpolated line. */
  direction: StepDirection | '';
  /** Whether the datasets are filled to a boundary. */
  filled: boolean;
  /** Indices of the datasets, in chart order. */
  indices: number[];
}

/**
 * The trace type a group of line datasets reads as.
 *
 * A filled band that also stacks is announced as a stacked area even when it
 * is stepped: losing the staircase costs a nuance, while losing the stacking
 * makes the announced number ambiguous — the band's height and the stack's top
 * edge are different magnitudes and nothing would say which was heard. An
 * unstacked stepped band keeps STEP, because nothing accumulates and the
 * staircase is then the more specific reading.
 *
 * The two readings that live below this one — a normalized band and a bump
 * chart — are settled by the values rather than by the options, because
 * Chart.js has no way to declare either.
 *
 * @param group - The group to classify
 * @param chart - The chart it belongs to, for its scales and datasets
 * @param stacked - Whether the chart's scales stack
 * @returns The trace type for the group's layer
 */
function lineGroupType(
  group: LineGroup,
  chart: ChartJsChart,
  stacked: boolean,
): TraceType {
  if (group.filled) {
    if (stacked) {
      return isNormalizedGroup(group, chart.data.datasets)
        ? TraceType.NORMALIZED_AREA
        : TraceType.STACKED_AREA;
    }
    return group.direction === '' ? TraceType.AREA : TraceType.STEP;
  }
  if (group.direction !== '') {
    return TraceType.STEP;
  }
  return isBumpGroup(group, chart) ? TraceType.BUMP : TraceType.LINE;
}

/** The totals a normalized chart's bands are shares of: percent, or unity. */
const NORMALIZED_TOTALS = [100, 1] as const;

/**
 * How far a column's total may sit from the whole and still read as one.
 *
 * Relative, and loose enough to admit shares rounded for display: percentages
 * rounded to whole numbers routinely sum to 99.8 or 100.2, and a chart is not
 * less normalized for having been rounded.
 */
const NORMALIZED_TOLERANCE = 0.005;

/**
 * Whether a stacked band group is normalized — every category a share of one
 * common total.
 *
 * Chart.js has no `stack: 'normalize'` mode of its own: the recipe is an
 * ordinary stacked area whose values were turned into percentages before they
 * were handed over, so the values are the only evidence there is. Two or more
 * bands whose columns all sum to the same whole is that evidence.
 *
 * The honest limit: a normalized chart whose totals were rounded unevenly
 * enough to drift past the tolerance reads as a plain stacked area, which
 * announces the same numbers and only misses the "share of" framing.
 *
 * @param group - The band group to classify
 * @param datasets - The chart's datasets, indexed by the group
 * @returns True when every category totals the same whole
 */
function isNormalizedGroup(group: LineGroup, datasets: ChartJsDataset[]): boolean {
  const bands = group.indices.map(dsIdx => datasets[dsIdx]?.data ?? []);
  // One band is not a share of anything, and a single category totals its own
  // value whatever that is — neither says the chart is normalized.
  if (bands.length < 2)
    return false;
  const categories = Math.max(...bands.map(band => band.length));
  if (categories < 2)
    return false;

  const columnTotals: number[] = [];
  for (let i = 0; i < categories; i++) {
    let total = 0;
    for (const band of bands)
      total += toFiniteNumber(band[i]) ?? 0;
    columnTotals.push(total);
  }

  return NORMALIZED_TOTALS.some(whole =>
    columnTotals.every(total => Math.abs(total - whole) <= whole * NORMALIZED_TOLERANCE),
  );
}

/**
 * Whether a plain line group is a bump chart — rank over time, one line per
 * competitor.
 *
 * Chart.js's bump recipe is a line chart with `scales.y.reverse` so rank 1
 * sits at the top, and a reversed axis alone is nowhere near enough to go on:
 * plenty of charts reverse an axis without their values being ranks. What
 * makes the reading safe is that at every period the values across the series
 * are a permutation of 1..N — the defining property of a ranking, and one no
 * ordinary value series satisfies by accident.
 *
 * @param group - The line group to classify
 * @param chart - The chart it belongs to, for its scales and datasets
 * @returns True when the group's values rank its series at every period
 */
function isBumpGroup(group: LineGroup, chart: ChartJsChart): boolean {
  if (chart.options.scales?.y?.reverse !== true)
    return false;

  const series = group.indices.map(dsIdx => chart.data.datasets[dsIdx]?.data ?? []);
  // A single competitor has no table to climb, and one period has no movement.
  if (series.length < 2)
    return false;
  const periods = Math.max(...series.map(one => one.length));
  if (periods < 2)
    return false;

  for (let i = 0; i < periods; i++) {
    const held = new Set<number>();
    for (const one of series) {
      const rank = toFiniteNumber(one[i]);
      if (rank === null || !Number.isInteger(rank) || rank < 1 || rank > series.length)
        return false;
      if (held.has(rank))
        return false;
      held.add(rank);
    }
  }
  return true;
}

/** Which scale a chart's categories run along, rather than its values. */
function categoryAxis(chart: ChartJsChart): AxisKind {
  return chart.options.indexAxis === 'y' ? 'y' : 'x';
}

/** Whether a scale plots named categories rather than a continuum. */
function isCategoryScale(chart: ChartJsChart, axisId: string): boolean {
  const type = chart.options.scales?.[axisId]?.type;
  // A line chart's category axis is what Chart.js gives it when the config
  // names no type, which is how nearly every one of them is written.
  return type === undefined || type === 'category';
}

/**
 * Whether a line chart is a dot plot — the markers drawn without the line
 * that would join them.
 *
 * Chart.js says this outright, which makes it one of the few recipes that
 * needs no value heuristic: `showLine: false` is its own way of drawing a
 * Cleveland dot plot, and a dataset's setting wins over the chart's default
 * exactly as {@link stepDirectionOf} resolves `stepped`.
 *
 * The category axis has to be a category axis. Points with the line switched
 * off along a continuum is a scatter plot drawn by the line controller, and it
 * has two measured coordinates rather than a value per named category.
 *
 * @param chart - The chart to classify
 * @param declared - What the page declared the chart to be, if anything
 * @returns True when the chart draws one value per category as a point
 */
function isDotPlot(chart: ChartJsChart, declared: TraceType | undefined): boolean {
  if (declared === TraceType.DOT)
    return true;
  if (!isCategoryScale(chart, categoryAxis(chart)))
    return false;
  return chart.data.datasets.every(
    dataset => (dataset.showLine ?? chart.options.showLine) === false,
  );
}

/**
 * Extracts a dot plot as one layer per dataset.
 *
 * The payload is a bar layer's — a value per category, read by `BarTrace` —
 * because that is what the chart holds; the dot is the mark it is drawn with.
 * One layer per series rather than one layer of rows, so a two-series dot plot
 * keeps each series' own range and its own highlight routing, the way
 * {@link extractPieLayers} keeps a doughnut's rings apart.
 *
 * @param chart - The chart to read
 * @param pluginOptions - Optional per-chart plugin options
 * @param datasetIndices - Collects which dataset backs each emitted layer
 * @returns One layer per dataset
 */
function extractDotLayers(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
  datasetIndices?: LocalDatasetIndices,
): MaidrLayer[] {
  const labels = chart.data.labels ?? [];
  return chart.data.datasets.map((dataset, dsIdx) => {
    // Each layer is backed by exactly one dataset, so say which: the caller's
    // per-type default (all datasets, in order) would route every series'
    // highlight to the first one.
    datasetIndices?.set(String(dsIdx), [dsIdx]);
    return singleDatasetToBarLayer(
      dataset,
      labels,
      chart,
      pluginOptions,
      dsIdx,
      TraceType.DOT,
    );
  });
}

/**
 * The time a survival point sits at.
 *
 * A Kaplan-Meier curve is plotted against elapsed time rather than against a
 * row of named categories, so its points are normally written as `{x, y}`
 * objects with no `labels` array to index — the one place in this adapter a
 * line point's own `x` has to be preferred over the category label.
 *
 * @param value - The raw dataset entry
 * @param labels - The chart's category labels, when it has any
 * @param i - The entry's position in the dataset
 * @returns The point's position along the time axis
 */
function survivalTime(
  value: ChartJsDataValue,
  labels: (string | number)[],
  i: number,
): number | string {
  return isPointValue(value) ? value.x : labels[i] ?? i;
}

/** A bound of a confidence band, when the point carries a usable one. */
function bandBound(bound: number | undefined): number | undefined {
  return typeof bound === 'number' && Number.isFinite(bound) ? bound : undefined;
}

/**
 * Extracts a declared Kaplan-Meier curve as one layer, an arm per row.
 *
 * Nothing in a Chart.js config distinguishes a survival curve from any other
 * staircase — it is a `stepped: 'after'` line — so this is only reached by
 * declaration. What makes the declaration worth honouring is the rest of the
 * figure: censoring marks and confidence bands are the two things a survival
 * plot carries that a step chart does not, and Chart.js ignores unknown
 * properties on a datum, so a page rides them on the points themselves as
 * `{x, y, censored, yMin, yMax}` and they arrive here intact.
 *
 * @param chart - The chart to read
 * @param pluginOptions - Optional per-chart plugin options
 * @returns A single survival layer holding every arm
 */
function extractSurvivalLayer(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer {
  const labels = chart.data.labels ?? [];

  const arms: SurvivalPoint[][] = chart.data.datasets.map((dataset, dsIdx) => {
    const curve: SurvivalPoint[] = [];
    dataset.data.forEach((value, i) => {
      const y = toFiniteNumber(value);
      if (y === null)
        return;
      // The censoring mark and the band ride on the point itself, which is the
      // only place a Chart.js datum leaves for a fact the config cannot state.
      const marks = isPointValue(value) ? value : undefined;
      const yMin = bandBound(marks?.yMin);
      const yMax = bandBound(marks?.yMax);
      curve.push({
        x: survivalTime(value, labels, i),
        y,
        z: dataset.label ?? `Arm ${dsIdx + 1}`,
        ...(marks?.censored === true ? { censored: true } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
      });
    });
    return curve;
  });

  // Every arm of one figure shares a convention, so the first dataset that
  // states one states it for the layer; a curve drawn without `stepped` at all
  // is still a step function and defaults to the 'after' KM curves are drawn as.
  const direction = chart.data.datasets
    .map(dataset => stepDirectionOf(dataset, chart))
    .find(one => one !== undefined) ?? 'vh';

  return {
    id: '0',
    type: TraceType.SURVIVAL,
    stepDirection: direction,
    axes: {
      x: { label: getAxisLabel(chart, 'x', pluginOptions) },
      y: { label: getAxisLabel(chart, 'y', pluginOptions) },
    },
    data: arms,
  };
}

function extractLineLayers(
  chart: ChartJsChart,
  declarations: DatasetDeclarations,
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

  // Both readings replace the layer rather than refine one, so they are
  // settled before the datasets are bucketed by mark: a dot plot has no line
  // to be stepped or filled, and a survival curve is one figure whose arms
  // belong together whatever each dataset declares.
  const declared = declaredType(declarations, pluginOptions);
  if (declared === TraceType.SURVIVAL)
    return [extractSurvivalLayer(chart, pluginOptions)];

  if (isDotPlot(chart, declared))
    return extractDotLayers(chart, pluginOptions, datasetIndices);

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
  //
  // A filled dataset splits the same way and for the same reason: a band and a
  // line are different trace types, so they cannot share a layer.
  const groups = new Map<string, LineGroup>();
  for (let dsIdx = 0; dsIdx < data.datasets.length; dsIdx++) {
    const direction = stepDirectionOf(data.datasets[dsIdx], chart) ?? '';
    const filled = isFilledLine(data.datasets[dsIdx], chart);
    const key = `${direction}|${filled}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.indices.push(dsIdx);
    } else {
      groups.set(key, { direction, filled, indices: [dsIdx] });
    }
  }

  const axes = {
    x: { label: getAxisLabel(chart, 'x', pluginOptions) },
    y: { label: getAxisLabel(chart, 'y', pluginOptions) },
  };

  const layers: MaidrLayer[] = [];
  const stacked = isStacked(chart);
  // Plain lines first, so a mixed chart keeps the line layer where it was;
  // then bands, then the stepped variants of each. Ranking rather than sorting
  // on the composite key keeps that order readable and stable.
  const rank = (group: LineGroup): number =>
    Number(group.direction !== '') * 2 + Number(group.filled);
  const ordered = [...groups.values()].sort((a, b) => rank(a) - rank(b));
  for (const group of ordered) {
    const id = String(layers.length);
    datasetIndices?.set(id, group.indices);
    const type = lineGroupType(group, chart, stacked);
    layers.push({
      id,
      type,
      axes,
      // Only a layer actually read as a staircase announces a convention. A
      // stacked band that happens to be stepped is read as an area, and
      // declaring a direction on it would describe navigation it does not have.
      ...(type === TraceType.STEP ? { stepDirection: group.direction as StepDirection } : {}),
      data: group.indices.map(dsIdx => linePoints(data.datasets[dsIdx], dsIdx)),
    });
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Radar / polar area chart extraction
// ---------------------------------------------------------------------------

/**
 * Axis labels for a radar or polar area layer.
 *
 * Neither has an x or a y scale — they are drawn against a single radial `r`
 * scale — so {@link getAxisLabel} would fall through to its `'X'`/`'Y'`
 * default and announce an axis the chart does not have. Name what the two
 * positions mean instead, the way {@link getPieAxes} does: `x` is what the
 * spokes are, `y` is what their magnitudes measure, which is the one of the
 * two Chart.js can actually title.
 *
 * @param chart - The chart being read
 * @param pluginOptions - Optional per-chart plugin options
 * @returns The layer's axes
 */
function getRadarAxes(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer['axes'] {
  const radialTitle = chart.options.scales?.r?.title?.text;
  return {
    x: { label: pluginOptions?.axes?.x ?? 'Category' },
    y: { label: pluginOptions?.axes?.y ?? radialTitle ?? 'Value' },
  };
}

/**
 * Extracts a radar or polar area chart as one multi-series layer.
 *
 * The payload is a line layer's — a row per dataset, a column per spoke —
 * because that is what a reader navigates either way; what the circle adds is
 * carried by `RadarTrace` in the panning rather than in the data. The line
 * extractor is deliberately not reused for it: a radar dataset is very
 * commonly `fill: true`, which would bucket it as an area band, and a radar
 * has no stacking or step convention for those buckets to mean anything.
 *
 * @param chart - The chart to read
 * @param traceType - Which of the two marks the chart draws
 * @param pluginOptions - Optional per-chart plugin options
 * @returns A single layer holding every series
 */
function extractRadarLayers(
  chart: ChartJsChart,
  traceType: TraceType,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer[] {
  const labels = chart.data.labels ?? [];

  // Gap markers (`null` / `NaN`) are skipped, as they are on a line, so a
  // missing spoke is never sonified as a fabricated zero.
  const points: LinePoint[][] = chart.data.datasets.map((dataset, dsIdx) => {
    const spokes: LinePoint[] = [];
    dataset.data.forEach((value, i) => {
      const num = toFiniteNumber(value);
      if (num === null)
        return;
      spokes.push({
        x: labels[i] ?? i,
        y: num,
        z: dataset.label ?? `Series ${dsIdx + 1}`,
      });
    });
    return spokes;
  });

  return [
    {
      id: '0',
      type: traceType,
      axes: getRadarAxes(chart, pluginOptions),
      data: points,
    },
  ];
}

// ---------------------------------------------------------------------------
// Scatter / Bubble chart extraction
// ---------------------------------------------------------------------------

/**
 * What a bubble's radius is called when the page does not say.
 *
 * Chart.js has no scale for `r`, so unlike x and y there is no axis title to
 * read it off. "Size" describes what the reader is being told rather than
 * naming the variable, which only the page's author knows -- they can supply
 * it through the plugin's `axes.z`.
 */
const DEFAULT_BUBBLE_SIZE_LABEL = 'Size';

/**
 * A declaration this adapter reads a cloud of points from.
 *
 * All three are drawn as a Chart.js scatter and navigated identically; what a
 * volcano and a Manhattan add is an identity per point and the threshold the
 * figure is read through.
 */
type PointDeclaration = ScatterDeclaration | VolcanoDeclaration | ManhattanDeclaration;

/** A declaration whose points carry an identity the grammar has room for. */
type NamedPointDeclaration = VolcanoDeclaration | ManhattanDeclaration;

/**
 * Whether a validated block declares one of the point-cloud readings.
 *
 * @param declaration - A dataset's validated block, or `null`
 * @returns True when the block is a point-cloud declaration
 */
function isPointDeclaration(
  declaration: MaidrTraceDeclaration | null,
): declaration is PointDeclaration {
  return declaration !== null
    && (declaration.type === TraceType.SCATTER
      || declaration.type === TraceType.VOLCANO
      || declaration.type === TraceType.MANHATTAN);
}

/**
 * The declaration whose points carry a label and a group, when this one does.
 *
 * `ScatterPoint` has no identity field, so a declared `point` layer reads
 * exactly as an undeclared one and nothing is read off its data rows.
 *
 * @param declaration - The layer's declaration, when it has one
 * @returns The declaration, or `undefined` when it names no identity
 */
function namedPoints(
  declaration: PointDeclaration | null,
): NamedPointDeclaration | undefined {
  return declaration !== null && declaration.type !== TraceType.SCATTER
    ? declaration
    : undefined;
}

/**
 * Whether a declaration absorbs the sibling datasets drawn after it.
 *
 * A Manhattan is one cloud split across a dataset per chromosome — 22 layers
 * a reader must switch between is not a reading of that figure — so it
 * absorbs by default. A volcano's siblings are usually up-regulated,
 * down-regulated and unchanged, which are three things a reader wants told
 * apart, so it does not.
 *
 * @param declaration - The declaration starting the layer
 * @returns True when following undeclared siblings join this layer
 */
function mergesSiblings(declaration: PointDeclaration): boolean {
  return declaration.merge ?? declaration.type === TraceType.MANHATTAN;
}

/**
 * The chart-wide reading, in the form a layer is built from.
 *
 * `plugins.maidr.traceType` predates the co-located block and stays the
 * shorthand for a figure drawn as a single dataset; it is the third step of
 * the precedence order, below a block on the dataset itself. It carries no
 * field names and no cutoffs, so what it buys is the trace type and whatever
 * identity the default name chain finds on the data — a real reading, and a
 * smaller one than a block gives.
 *
 * @param pluginOptions - Optional per-chart plugin options
 * @returns The chart-wide declaration, or `null` when the page names no point cloud
 */
function chartWidePointDeclaration(
  pluginOptions?: MaidrPluginOptions,
): PointDeclaration | null {
  switch (pluginOptions?.traceType) {
    case TraceType.VOLCANO:
      return { type: TraceType.VOLCANO };
    case TraceType.MANHATTAN:
      return { type: TraceType.MANHATTAN };
    default:
      return null;
  }
}

/** One emitted point layer: which datasets back it, and what they declare. */
interface PointGroup {
  /** The dataset the layer is identified and titled by. */
  index: number;
  /** Every dataset backing the layer, in chart order. */
  indices: number[];
  declaration: PointDeclaration | null;
}

/**
 * Which datasets become one layer.
 *
 * The shipped convention is one layer per dataset, which is what keeps a
 * two-series scatter's series apart and its highlights routed. A declaration
 * that merges overrides it for its own run: every *following* dataset drawn
 * the same way that carries no declaration of its own joins the declaring
 * layer, up to the next dataset that declares something.
 *
 * @param chart - The chart being read
 * @param declarations - Every dataset's validated block, in chart order
 * @param chartWide - The chart-wide reading, for datasets carrying no block
 * @returns One group per emitted layer, in chart order
 */
function groupPointDatasets(
  chart: ChartJsChart,
  declarations: DatasetDeclarations,
  chartWide: PointDeclaration | null,
): PointGroup[] {
  const chartType = chart.config.type;
  const groups: PointGroup[] = [];
  let absorbing: PointGroup | null = null;

  for (let index = 0; index < chart.data.datasets.length; index++) {
    const dataset = chart.data.datasets[index];
    const declaration = declarations[index] ?? null;

    // A dataset carrying a block of its own is never absorbed, even where the
    // block turned out to be one this adapter cannot read: the author was
    // saying this dataset is not simply more of the cloud before it, and they
    // have already been told why the block did not take.
    if (
      !carriesDeclaration(dataset)
      && absorbing !== null
      && drawnKind(dataset, chartType)
      === drawnKind(chart.data.datasets[absorbing.index], chartType)
    ) {
      absorbing.indices.push(index);
      continue;
    }

    const group: PointGroup = {
      index,
      indices: [index],
      declaration: isPointDeclaration(declaration) ? declaration : chartWide,
    };
    groups.push(group);
    absorbing = group.declaration !== null && mergesSiblings(group.declaration)
      ? group
      : null;
  }

  return groups;
}

/**
 * The cutoffs a volcano or Manhattan layer is read through.
 *
 * Nothing here is inferred. A Chart.js scatter states no line, and a guessed
 * one would sort every point in the figure onto the wrong side of it,
 * silently; a Manhattan's x-axis dividers are chromosome boundaries rather
 * than an effect-size cutoff. A layer that declares neither is emitted with no
 * option block at all and reports no findings, which is the reading its data
 * supports.
 *
 * @param declaration - The layer's declaration
 * @returns The declared cutoffs, or `undefined` when none were declared
 */
function thresholdOptionsOf(declaration: NamedPointDeclaration): ThresholdOptions | undefined {
  const options: ThresholdOptions = {
    ...(declaration.significance !== undefined
      ? { significance: declaration.significance }
      : {}),
    ...(declaration.significanceDirection !== undefined
      ? { significanceDirection: declaration.significanceDirection }
      : {}),
    ...(declaration.effect !== undefined ? { effect: declaration.effect } : {}),
  };
  return Object.keys(options).length > 0 ? options : undefined;
}

/**
 * One point's identity or region, in the form the grammar carries it.
 *
 * `VolcanoPoint.label` and `.group` are strings, and a chromosome is very
 * often authored as the number 7. Anything else — an object, a boolean, an
 * empty string — is left out rather than stringified into an announcement.
 *
 * @param row - The datum the chart bound to the mark
 * @param ref - The field the author named, or `undefined` to default
 * @param canonical - The grammar field being filled
 * @returns The text, or `undefined` when nothing usable resolved
 */
function pointText(
  row: unknown,
  ref: FieldRef | undefined,
  canonical: string,
): string | undefined {
  const value = resolveFieldRef<unknown>(row, ref, canonical);
  if (typeof value === 'string' && value !== '')
    return value;
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value);
  return undefined;
}

function extractScatterLayers(
  chart: ChartJsChart,
  declarations: DatasetDeclarations,
  pluginOptions?: MaidrPluginOptions,
  datasetIndices?: LocalDatasetIndices,
): MaidrLayer[] {
  const chartWide = chartWidePointDeclaration(pluginOptions);
  return groupPointDatasets(chart, declarations, chartWide).map((group) => {
    const declaration = group.declaration;
    const named = namedPoints(declaration);
    const points = group.indices.flatMap(index =>
      datasetToScatterPoints(chart.data.datasets[index], named));
    reportPointGaps(chart, group, points);

    const id = String(group.index);
    // Each layer says which datasets back it. The caller's per-type default
    // reads a scatter layer's id as its lone dataset index, which a merged
    // Manhattan — one layer over 22 datasets — is not.
    datasetIndices?.set(id, group.indices);

    const thresholds = named !== undefined ? thresholdOptionsOf(named) : undefined;
    // A merged layer's declaring dataset names one chromosome of a cloud, not
    // the cloud, so only a layer that really is one series takes its label.
    const title = declaration?.title
      ?? (group.indices.length === 1 ? chart.data.datasets[group.index].label : undefined);

    return {
      id,
      type: declaration?.type ?? TraceType.SCATTER,
      title,
      ...(declaration?.name !== undefined ? { name: declaration.name } : {}),
      axes: {
        x: { label: getAxisLabel(chart, 'x', pluginOptions) },
        y: { label: getAxisLabel(chart, 'y', pluginOptions) },
        // Only when a radius was actually carried. This serves plain scatter
        // too, and a `z` axis on a chart with no third variable would announce
        // a label for something that is not there.
        ...(points.some(point => point.z !== undefined) && {
          z: { label: pluginOptions?.axes?.z ?? DEFAULT_BUBBLE_SIZE_LABEL },
        }),
      },
      ...(thresholds !== undefined ? { thresholdOptions: thresholds } : {}),
      data: points,
    };
  });
}

/**
 * Reports what a declared point layer asked for and did not get.
 *
 * Two silences are worth breaking. A field name the author wrote that no row
 * carries is a typo, and the layer would otherwise arrive quietly missing the
 * identity the chart is read for. A volcano or Manhattan with no significance
 * cutoff is a real chart and is emitted, but it reports no findings — which is
 * the one thing an author declaring the type was after.
 *
 * @param chart - The chart being read
 * @param group - The datasets backing the layer, and what they declare
 * @param points - The points the layer emitted
 */
function reportPointGaps(
  chart: ChartJsChart,
  group: PointGroup,
  points: ScatterPoint[],
): void {
  const declaration = namedPoints(group.declaration);
  if (declaration === undefined)
    return;

  const context = declarationContext(chart.data.datasets[group.index], group.index);
  const carried = points as VolcanoPoint[];
  if (points.length > 0) {
    if (declaration.label !== undefined && !carried.some(point => point.label !== undefined))
      warnUnresolvedRef(context, declaration.label, 'label');
    if (declaration.group !== undefined && !carried.some(point => point.group !== undefined))
      warnUnresolvedRef(context, declaration.group, 'group');
  }
  if (declaration.significance === undefined) {
    warn(
      `maidr declaration for "${declaration.type}" on ${context.seriesRef} `
      + `declares no significance; the layer is emitted without a threshold and `
      + `reports no findings.`,
    );
  }
}

/**
 * Turn a dataset's points into scatter points, keeping a bubble's radius and
 * whatever identity a declaration names.
 *
 * A Chart.js bubble datum is `{x, y, r}`, and `r` is a whole encoded variable
 * -- population, market cap, sample size -- which is usually the reason the
 * chart is a bubble chart at all. It rides as `z`, which `ScatterTrace`
 * already understands: it drives the point-mode announcement and the z range,
 * so carrying it here is all that was missing (#813).
 *
 * A plain scatter has no `r` and gets no `z`, which is what keeps `hasZ`
 * false and leaves its announcements unchanged.
 *
 * On a volcano or a Manhattan the coordinates are the *least* of the payload:
 * a reader told "x is 2.3, y is 14.1" has been given the two numbers the axes
 * already describe and withheld which gene that is. Chart.js passes properties
 * it does not know through untouched, so the gene name rides on the datum the
 * same way a survival curve's censoring mark does, and the declaration says
 * which property it is. Neither field is fabricated when nothing resolves.
 *
 * @param dataset - The dataset to read
 * @param declaration - The layer's declaration, when its points carry an identity
 * @returns The dataset's points, gaps and non-point entries dropped
 */
function datasetToScatterPoints(
  dataset: ChartJsDataset,
  declaration?: NamedPointDeclaration,
): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const point of dataset.data) {
    if (!isPointValue(point))
      continue;

    const position: ScatterPoint = typeof point.r === 'number'
      ? { x: point.x, y: point.y, z: point.r }
      : { x: point.x, y: point.y };
    if (declaration === undefined) {
      points.push(position);
      continue;
    }

    const label = pointText(point, declaration.label, 'label');
    const group = pointText(point, declaration.group, 'group');
    points.push({
      ...position,
      ...(label !== undefined ? { label } : {}),
      ...(group !== undefined ? { group } : {}),
    } satisfies VolcanoPoint);
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
 * Whether a part-circle doughnut is a gauge rather than a part-circle pie.
 *
 * Chart.js has no gauge controller: the recipe is a doughnut swept through
 * less than the full circle, with the measure as its first value and the rest
 * of the dial as its second — the remainder is drawn only to leave the arc
 * unfilled. Two values in one part-circle ring is that recipe, and it is the
 * most a config can say.
 *
 * The honest limit: a half-pie of exactly two slices is drawn identically and
 * would be read as a dial. That is what {@link MaidrPluginOptions.traceType}
 * is for in both directions — declaring `gauge` reads a dial the heuristic
 * misses, declaring `pie` keeps two slices two slices.
 *
 * @param chart - The chart to classify
 * @param declared - What the page declared the chart to be, if anything
 * @returns True when the chart draws one measure against a dial
 */
function isGaugeDial(chart: ChartJsChart, declared: TraceType | undefined): boolean {
  if (declared === TraceType.GAUGE)
    return true;
  if (declared !== undefined)
    return false;

  const circumference = chart.options.circumference;
  if (typeof circumference !== 'number' || circumference >= 360)
    return false;

  const datasets = chart.data.datasets;
  if (datasets.length !== 1 || datasets[0].data.length !== 2)
    return false;
  return datasets[0].data.every(value => toFiniteNumber(value) !== null);
}

/**
 * Axis labels for a gauge layer.
 *
 * `GaugeTrace` announces the measure's name against `axes.x` and its value
 * against `axes.y`, and a dial has no Chart.js scales to read either off, so
 * name what the two positions mean the way {@link getPieAxes} does.
 */
function getGaugeAxes(pluginOptions?: MaidrPluginOptions): MaidrLayer['axes'] {
  return {
    x: { label: pluginOptions?.axes?.x ?? 'Measure' },
    y: { label: pluginOptions?.axes?.y ?? 'Value' },
  };
}

/**
 * Extracts a doughnut gauge as its single measure.
 *
 * The payload is one object rather than an array, because the chart draws one
 * measure: the second value is the unfilled remainder of the dial, not a
 * second reading, so it is spent on `max` instead of being announced as a
 * slice of its own.
 *
 * @param chart - The chart to read
 * @param pluginOptions - Optional per-chart plugin options
 * @returns A single gauge layer
 */
function extractGaugeLayer(
  chart: ChartJsChart,
  pluginOptions?: MaidrPluginOptions,
): MaidrLayer {
  const dataset = chart.data.datasets[0];
  const label = chart.data.labels?.[0] ?? dataset.label;
  const value = toFiniteNumber(dataset.data[0]) ?? 0;
  // The dial is however far round the ring goes: the measure plus everything
  // drawn empty after it. Summing rather than reading the second value keeps a
  // ring that splits its remainder across several arcs on one honest total.
  const max = dataset.data.reduce<number>(
    (total, entry) => total + (toFiniteNumber(entry) ?? 0),
    0,
  );

  const point: GaugePoint = {
    value,
    // A doughnut sweeps from nothing, so the dial starts at zero: an arc's
    // length is its share of the ring and there is no other origin to read.
    min: 0,
    max,
    ...(label !== undefined ? { label: String(label) } : {}),
    ...(pluginOptions?.target !== undefined ? { target: pluginOptions.target } : {}),
    ...(pluginOptions?.bands ? { bands: pluginOptions.bands } : {}),
  };

  return {
    id: '0',
    type: TraceType.GAUGE,
    title: dataset.label,
    axes: getGaugeAxes(pluginOptions),
    data: point,
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
  declarations: DatasetDeclarations,
  pluginOptions?: MaidrPluginOptions,
  datasetIndices?: LocalDatasetIndices,
): MaidrLayer[] {
  // A dial is the same ring drawn part way round, so it is settled here rather
  // than in the dispatcher — the chart type is `doughnut` either way.
  const declared = declaredType(declarations, pluginOptions);
  if (chart.data.datasets.length > 0 && isGaugeDial(chart, declared))
    return [extractGaugeLayer(chart, pluginOptions)];

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

/**
 * The order an axis actually draws its categories in.
 *
 * `HeatmapData` lists both axes the way they are drawn — top-first for rows,
 * left-first for columns — so neither can be taken from the order the points
 * happened to be listed in. The matrix controller defaults its y scale to
 * `reverse`, so the rows usually need turning over (#974); a declared domain
 * reorders either axis outright, and `reverse` flips it (#1010).
 *
 * `reverse` means the same thing on both axes here, so one transformation
 * serves both — unlike Highcharts, where the two need opposite polarity
 * because its index numbering starts at a different end on each (#1008).
 *
 * Read off `chart.options` rather than the laid-out `chart.scales`, which
 * looks like the more authoritative source and is not: a matrix chart that
 * lets Chart.js infer its category domain gets a scale whose runtime
 * `getLabels()` is contaminated with the other axis' values — measured as
 * `['c1', 'first', 'c2', 'second', 'third']`. The options copy stays clean,
 * being either what the author declared or absent, and the fallback to the
 * listed order is right precisely when it is absent, since an inferred domain
 * is* the order the points were listed in.
 *
 * @param scale   - The resolved scale for this axis, if the chart has one
 * @param listed  - The categories in the order the points named them
 * @param present - Which of them the data actually filled
 * @returns The categories in drawn order
 */
function drawnCategoryOrder(
  scale: { labels?: unknown[]; reverse?: boolean } | undefined,
  listed: string[],
  present: Set<string>,
): string[] {
  const declared = (scale?.labels ?? listed).map(String);
  const drawn = scale?.reverse === true ? [...declared].reverse() : declared;

  // Only categories the data filled, so a scale naming more than the chart
  // draws cannot introduce an empty band. If that leaves a different count
  // the scale and the data disagree about what exists, and the listed order
  // is the safer answer.
  const filled = drawn.filter(label => present.has(label));
  return filled.length === listed.length ? filled : listed;
}

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

  // Both axes get the same question, because the answer matters for both:
  // which order the chart actually draws its categories in is the scale's
  // business, not the data's. The loop above collected them as they were
  // listed, which need not be the axis order at all — measured, a matrix
  // chart whose points are listed `c2, c0, c1` draws them `c0, c1, c2` once
  // the scale declares that domain, and `c2, c1, c0` under `reverse` (#1010).
  //
  // The columns were left out when the rows were fixed (#974), which is the
  // argument for asking once here rather than at each axis.
  const finalX = drawnCategoryOrder(chart.options.scales?.x, xLabels, xSet);
  const finalY = drawnCategoryOrder(chart.options.scales?.y, yLabels, ySet);

  const points: number[][] = finalY.map(y =>
    finalX.map(x => valueMap.get(`${x}\0${y}`) ?? 0),
  );

  const heatmapData: HeatmapData = { x: finalX, y: finalY, points };

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
