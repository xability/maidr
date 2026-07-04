/**
 * Chart.js plugin that adds MAIDR accessibility to canvas-based charts.
 *
 * This plugin automatically extracts data from Chart.js chart instances,
 * converts it to the MAIDR JSON schema, and renders the MAIDR accessible
 * interface around the chart canvas. Navigation events are bridged back
 * to Chart.js for visual highlighting via `setActiveElements`, and DOM
 * rect overlays are drawn on top of the canvas so users see MAIDR-style
 * highlight feedback (since canvas has no per-element DOM nodes).
 *
 * @example
 * ```js
 * import { Chart } from 'chart.js/auto';
 * import { maidrPlugin } from 'maidr/chartjs';
 *
 * Chart.register(maidrPlugin);
 *
 * new Chart(ctx, {
 *   type: 'bar',
 *   data: { labels: ['A', 'B', 'C'], datasets: [{ data: [1, 2, 3] }] },
 * });
 * ```
 */

import type { JSX } from 'react';
import type { Root } from 'react-dom/client';
import type { HeatmapData, Maidr as MaidrData, MaidrLayer, NavigateCallback } from '../../type/grammar';
import type { ChartJsActiveElement, ChartJsChart, ChartJsDataValue, ChartJsPlugin, MaidrPluginOptions } from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { TraceType } from '../../type/grammar';
import { extractMaidrData, isMatrixValue, isPointValue, toFiniteNumber } from './extractor';
import { elementToOverlayRect, HighlightOverlay } from './overlay';

// ---------------------------------------------------------------------------
// Internal state per chart
// ---------------------------------------------------------------------------

/** Raw MAIDR navigation event captured so resize can re-resolve targets. */
interface NavEvent {
  layerId: string;
  row: number;
  col: number;
}

interface MaidrChartBinding {
  maidrData: MaidrData;
  root: Root;
  container: HTMLElement;
  /** Layers as extracted; needed to resolve targets on resize replay. */
  layers: MaidrLayer[];
  /** Per-layer lookups mapping MAIDR positions back to Chart.js element indices. */
  targetMaps: TargetMaps;
  /** Resolved once the React tree mounts and provides the host wrapper. */
  overlayPromise: Promise<HighlightOverlay | null>;
  /** Latest MAIDR navigation event, replayed on resize. */
  lastActive: NavEvent | null;
}

/**
 * Per-layer lookups that translate a MAIDR navigation position into the
 * original Chart.js element index. MAIDR extraction skips gap markers, so these
 * maps re-derive the raw indices from the chart to keep highlights aligned.
 */
interface TargetMaps {
  /** Scatter: `scatterBuckets[layerId][col]` lists the Chart.js dataset indices sharing that X. */
  scatterBuckets: Map<string, number[][]>;
  /** Bar/line: `barLineIndices[layerId][row][col]` is the original Chart.js element index (gaps skipped). */
  barLineIndices: Map<string, number[][]>;
  /** Heatmap: `heatmapIndices[layerId]` maps `"x\0y"` to the flat Chart.js element index. */
  heatmapIndices: Map<string, Map<string, number>>;
}

const chartBindings = new WeakMap<ChartJsChart, MaidrChartBinding>();

// ---------------------------------------------------------------------------
// React helper: adopt an existing canvas into React's tree with a sized host.
//
// Chart.js's responsive sizing reads `canvas.parentNode.clientWidth/Height`.
// If the immediate parent uses `display: contents` it has no client box and
// Chart.js measures 0×0, leaving the canvas blank. To preserve the original
// layout we render an explicitly sized block as the canvas's host.
//
// The host element doubles as the parent for the DOM highlight overlay, so
// it must be `position: relative`. We forward the host element back to the
// plugin via the `onHost` callback so the overlay can be mounted alongside
// the canvas.
// ---------------------------------------------------------------------------

interface CanvasHostProps {
  node: HTMLCanvasElement;
  width: number;
  height: number;
  onHost: (host: HTMLDivElement | null) => void;
}

function CanvasHost({ node, width, height, onHost }: CanvasHostProps): JSX.Element {
  const ref = useCallback(
    (container: HTMLDivElement | null) => {
      if (container) {
        if (!container.contains(node)) {
          container.appendChild(node);
        }
        onHost(container);
      } else {
        node.parentNode?.removeChild(node);
        onHost(null);
      }
    },
    [node, onHost],
  );

  return (
    <div
      ref={ref}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Chart.js highlight bridge
// ---------------------------------------------------------------------------

function isSegmentedType(type: string): boolean {
  return type === TraceType.STACKED || type === TraceType.DODGED || type === TraceType.NORMALIZED;
}

/**
 * Original indices of a dataset's finite (non-gap) entries, in dataset order.
 * Mirrors the extractor's gap-skipping so MAIDR's `col` (an index into the
 * skipped list) maps back to the Chart.js element index.
 */
function finiteIndices(data: ChartJsDataValue[]): number[] {
  const indices: number[] = [];
  data.forEach((value, i) => {
    if (toFiniteNumber(value) !== null)
      indices.push(i);
  });
  return indices;
}

/**
 * Mirror `ScatterTrace`'s X-bucket construction (`src/model/scatter.ts:86-100`)
 * to map MAIDR's `col` (an X-bucket index) back to one or more original
 * Chart.js dataset indices. Points are sorted by X, then Y; consecutive points
 * sharing an X form a bucket. Reads the raw dataset (not the filtered layer
 * data) so bucket entries are original, highlight-aligned indices.
 */
function buildScatterBuckets(data: ChartJsDataValue[]): number[][] {
  // Track original dataset indices through the (x, y) sort so bucket entries are
  // Chart.js element indices, not positions in the gap-filtered point list.
  const indexed: { x: number; y: number; i: number }[] = [];
  data.forEach((value, i) => {
    if (isPointValue(value))
      indexed.push({ x: value.x, y: value.y, i });
  });
  indexed.sort((a, b) => a.x - b.x || a.y - b.y);
  const buckets: number[][] = [];
  let currentX: number | null = null;
  for (const { x, i } of indexed) {
    if (currentX === null || currentX !== x) {
      currentX = x;
      buckets.push([]);
    }
    buckets[buckets.length - 1].push(i);
  }
  return buckets;
}

/**
 * Map each `"x\0y"` cell key to its flat Chart.js element index. The matrix
 * plugin's data order is arbitrary (commonly x-major), so highlighting must
 * look up cells by coordinate rather than assuming a y-major grid.
 */
function buildHeatmapIndex(data: ChartJsDataValue[]): Map<string, number> {
  const index = new Map<string, number>();
  data.forEach((value, i) => {
    if (isMatrixValue(value))
      index.set(`${String(value.x)}\0${String(value.y)}`, i);
  });
  return index;
}

/**
 * Precompute all per-layer position→index lookups from the raw chart, once at
 * init. This keeps highlight resolution O(1) and aligned with the original
 * Chart.js element indices even though MAIDR extraction skips gap markers.
 */
function computeTargetMaps(chart: ChartJsChart, layers: MaidrLayer[]): TargetMaps {
  const scatterBuckets = new Map<string, number[][]>();
  const barLineIndices = new Map<string, number[][]>();
  const heatmapIndices = new Map<string, Map<string, number>>();
  const datasets = chart.data.datasets;

  for (const layer of layers) {
    switch (layer.type) {
      case TraceType.SCATTER: {
        // The extractor assigns `layer.id = String(datasetIndex)` for scatter.
        const dsIdx = Number.parseInt(layer.id, 10) || 0;
        scatterBuckets.set(layer.id, buildScatterBuckets(datasets[dsIdx]?.data ?? []));
        break;
      }
      case TraceType.BAR:
        // Single-dataset bar: one MAIDR row backed by dataset 0.
        barLineIndices.set(layer.id, [finiteIndices(datasets[0]?.data ?? [])]);
        break;
      case TraceType.LINE:
        // One MAIDR row per dataset, in dataset order.
        barLineIndices.set(layer.id, datasets.map(ds => finiteIndices(ds.data)));
        break;
      case TraceType.HEATMAP:
        heatmapIndices.set(layer.id, buildHeatmapIndex(datasets[0]?.data ?? []));
        break;
      default:
        break;
    }
  }

  return { scatterBuckets, barLineIndices, heatmapIndices };
}

/**
 * Resolve a MAIDR navigation event into the Chart.js active elements that
 * should be highlighted. Returns an array because scatter X-buckets can
 * contain multiple points that share an X coordinate.
 */
function resolveActiveTargets(
  layers: MaidrLayer[],
  maps: TargetMaps,
  layerId: string,
  row: number,
  col: number,
): ChartJsActiveElement[] {
  const layer = layers.find(l => l.id === layerId);
  if (!layer)
    return [];

  // Segmented bars: MAIDR row = group (dataset), col = category (index).
  // The category grid is kept rectangular (gaps collapse to 0), so col is the
  // native Chart.js element index and needs no remapping.
  if (isSegmentedType(layer.type))
    return [{ datasetIndex: row, index: col }];

  // Scatter: col is an X-bucket; expand to all points sharing that X.
  if (layer.type === TraceType.SCATTER) {
    const buckets = maps.scatterBuckets.get(layer.id);
    if (!buckets || col < 0 || col >= buckets.length)
      return [];
    // The extractor assigns `layer.id = String(datasetIndex)` for scatter.
    const datasetIndex = Number.parseInt(layer.id, 10) || 0;
    return buckets[col].map(index => ({ datasetIndex, index }));
  }

  // Candlestick / OHLC: a single dataset of candles. MAIDR `col` selects the
  // candle; MAIDR `row` picks the OHLC field (volatility/open/high/low/close)
  // for audio/text and does NOT change which element to highlight.
  if (layer.type === TraceType.CANDLESTICK)
    return [{ datasetIndex: 0, index: col }];

  // Heatmap / Matrix: look the active cell up by coordinate (the matrix data
  // order is arbitrary). MAIDR's Heatmap model reverses the Y axis (row 0 =
  // bottom), so un-reverse to recover the original yLabel before the lookup.
  if (layer.type === TraceType.HEATMAP) {
    const hd = layer.data as HeatmapData;
    const originalYi = (hd.y.length - 1) - row;
    const xLabel = hd.x[col];
    const yLabel = hd.y[originalYi];
    if (xLabel === undefined || yLabel === undefined)
      return [];
    const flatIndex = maps.heatmapIndices.get(layer.id)?.get(`${xLabel}\0${yLabel}`);
    if (flatIndex === undefined)
      return [];
    return [{ datasetIndex: 0, index: flatIndex }];
  }

  // Bar / line: MAIDR row = dataset, col = point (into the gap-skipped list).
  // Map col back to the original Chart.js element index so highlights stay
  // aligned when the dataset contains gap markers.
  const indexMap = maps.barLineIndices.get(layer.id);
  if (indexMap) {
    const index = indexMap[row]?.[col];
    if (index === undefined)
      return [];
    return [{ datasetIndex: row, index }];
  }
  return [{ datasetIndex: row, index: col }];
}

/**
 * Drive both Chart.js's native active state (for canvas redraw + tooltip)
 * and the MAIDR DOM overlay (for accessible visual highlight). Supports
 * multi-element targets so scatter X-buckets show all shared-X points.
 */
function applyHighlight(
  chart: ChartJsChart,
  overlay: HighlightOverlay | null,
  targets: ChartJsActiveElement[],
): void {
  if (targets.length === 0) {
    overlay?.clear();
    return;
  }

  chart.setActiveElements(targets);

  // Tooltip can only anchor at one position; use the first target.
  const primary = targets[0];
  const primaryMeta = chart.getDatasetMeta(primary.datasetIndex);
  const primaryElement = primaryMeta?.data?.[primary.index];
  if (primaryElement && chart.tooltip) {
    chart.tooltip.setActiveElements(
      targets,
      { x: primaryElement.x, y: primaryElement.y },
    );
  }

  // 'none' mode skips animations for snappy navigation
  chart.update('none');

  if (!overlay)
    return;

  const rects = [];
  for (const t of targets) {
    const meta = chart.getDatasetMeta(t.datasetIndex);
    const element = meta?.data?.[t.index];
    if (!element)
      continue;
    const rect = elementToOverlayRect(element);
    if (rect)
      rects.push(rect);
  }
  if (rects.length > 0)
    overlay.show(rects);
  else
    overlay.clear();
}

function createHighlightCallback(
  chart: ChartJsChart,
  layers: MaidrLayer[],
  maps: TargetMaps,
  getOverlay: () => HighlightOverlay | null,
  recordActive: (event: NavEvent) => void,
): NavigateCallback {
  return (event) => {
    try {
      recordActive(event);
      const targets = resolveActiveTargets(
        layers,
        maps,
        event.layerId,
        event.row,
        event.col,
      );
      applyHighlight(chart, getOverlay(), targets);
    } catch {
      // Silently ignore highlight errors (e.g., after chart destruction)
    }
  };
}

// ---------------------------------------------------------------------------
// Plugin options helper
// ---------------------------------------------------------------------------

function getPluginOptions(chart: ChartJsChart): MaidrPluginOptions {
  const raw = chart.options.plugins?.maidr;
  if (!raw || typeof raw !== 'object')
    return {};
  return raw as MaidrPluginOptions;
}

// ---------------------------------------------------------------------------
// MAIDR rendering
// ---------------------------------------------------------------------------

interface RenderResult {
  root: Root;
  container: HTMLElement;
  /** Resolves once the host wrapper is attached to the DOM. */
  hostPromise: Promise<HTMLDivElement | null>;
}

function renderMaidr(
  maidrData: MaidrData,
  canvas: HTMLCanvasElement,
): RenderResult | null {
  const parent = canvas.parentElement;
  if (!parent) {
    console.error('MAIDR Chart.js plugin: canvas must be in the DOM');
    return null;
  }

  // Capture the original parent's dimensions BEFORE moving the canvas.
  // Chart.js needs a sized parent for its responsive layout, so we reuse
  // these dimensions on the CanvasHost wrapper inside the React tree.
  const { width, height } = parent.getBoundingClientRect();
  const hostWidth = width > 0 ? width : (canvas.clientWidth || 600);
  const hostHeight = height > 0 ? height : (canvas.clientHeight || 400);

  // Create a transparent container that wraps the canvas
  const container = document.createElement('div');
  container.style.display = 'contents';
  container.setAttribute('data-maidr-chartjs', maidrData.id);

  // Insert container and move canvas into it
  parent.insertBefore(container, canvas);

  const reactContainer = document.createElement('div');
  reactContainer.style.display = 'contents';
  container.appendChild(reactContainer);

  // The React tree mounts asynchronously; we resolve `hostPromise` from the
  // CanvasHost ref callback once the wrapper div is in the DOM.
  let resolveHost!: (host: HTMLDivElement | null) => void;
  const hostPromise = new Promise<HTMLDivElement | null>((resolve) => {
    resolveHost = resolve;
  });
  let hostResolved = false;
  const handleHost = (host: HTMLDivElement | null): void => {
    if (host && !hostResolved) {
      hostResolved = true;
      resolveHost(host);
    }
  };

  const root = createRoot(reactContainer, { identifierPrefix: maidrData.id });
  root.render(
    <MaidrComponent data={maidrData}>
      <CanvasHost
        node={canvas}
        width={hostWidth}
        height={hostHeight}
        onHost={handleHost}
      />
    </MaidrComponent>,
  );

  return { root, container, hostPromise };
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

function initMaidrForChart(chart: ChartJsChart): void {
  // Guard against duplicate initialization
  if (chartBindings.has(chart))
    return;

  const pluginOptions = getPluginOptions(chart);

  if (pluginOptions.enabled === false)
    return;

  // Extract data first, then create a layer-aware highlight callback. When the
  // plugin is registered globally, unsupported chart types (pie, doughnut,
  // radar, polarArea, ...) reach this hook too; extraction throws for them, so
  // catch it and leave the chart untouched rather than breaking construction.
  let extracted: MaidrData;
  try {
    extracted = extractMaidrData(chart, pluginOptions);
  } catch (error) {
    console.warn(
      `MAIDR Chart.js plugin: skipping chart. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  const layers = extracted.subplots[0][0].layers;

  // Precompute per-layer position→index lookups so navigation can be mapped to
  // one or more Chart.js indices in O(1) at highlight time.
  const targetMaps = computeTargetMaps(chart, layers);

  // The overlay is created asynchronously once the React tree mounts.
  // The highlight callback closes over a getter so it always reads the
  // latest reference (null until mount, then the live HighlightOverlay).
  let overlay: HighlightOverlay | null = null;

  // Record the latest MAIDR navigation event on the per-chart binding so
  // the resize hook can replay it after Chart.js re-lays out the canvas.
  const recordActive = (event: NavEvent): void => {
    const b = chartBindings.get(chart);
    if (b)
      b.lastActive = event;
  };

  const maidrData: MaidrData = {
    ...extracted,
    onNavigate: createHighlightCallback(
      chart,
      layers,
      targetMaps,
      () => overlay,
      recordActive,
    ),
  };

  // Render the MAIDR accessible interface around the canvas
  const result = renderMaidr(maidrData, chart.canvas);
  if (!result)
    return;

  // Build the overlay once the host wrapper is in the DOM.
  const overlayPromise = result.hostPromise.then((host) => {
    if (!host)
      return null;
    overlay = new HighlightOverlay(host, chart.canvas, pluginOptions.highlightColor);
    return overlay;
  });

  chartBindings.set(chart, {
    maidrData,
    root: result.root,
    container: result.container,
    layers,
    targetMaps,
    overlayPromise,
    lastActive: null,
  });
}

function handleResize(chart: ChartJsChart): void {
  const binding = chartBindings.get(chart);
  if (!binding)
    return;
  // After resize, Chart.js relays out canvas elements; replay the last
  // highlight so the overlay rect stays anchored to the active element.
  binding.overlayPromise.then((overlay) => {
    if (!overlay)
      return;
    overlay.clear();
    const active = binding.lastActive;
    if (!active)
      return;
    try {
      // Re-resolve targets from the raw nav event so the new element
      // geometry (post-layout) is used for the overlay rects.
      const targets = resolveActiveTargets(
        binding.layers,
        binding.targetMaps,
        active.layerId,
        active.row,
        active.col,
      );
      applyHighlight(chart, overlay, targets);
    } catch {
      // Ignore; chart may be mid-destruction.
    }
  });
}

function destroyMaidrForChart(chart: ChartJsChart): void {
  const binding = chartBindings.get(chart);
  if (!binding)
    return;

  // Tear down the overlay before unmounting React so its DOM node is
  // removed cleanly. The promise resolves synchronously if mount already
  // completed, otherwise we still attempt cleanup after mount.
  binding.overlayPromise.then((overlay) => {
    overlay?.dispose();
  });

  // Unmount React FIRST: the CanvasHost ref cleanup detaches the canvas from
  // the React-owned host. THEN restore the canvas to its original parent, and
  // finally remove the now-empty container. Doing this in the other order lets
  // the ref cleanup remove the just-restored canvas from the page.
  const canvas = chart.canvas;
  binding.root.unmount();
  binding.container.parentElement?.insertBefore(canvas, binding.container);
  binding.container.remove();
  chartBindings.delete(chart);
}

// ---------------------------------------------------------------------------
// Public plugin object
// ---------------------------------------------------------------------------

/**
 * Chart.js plugin that automatically adds MAIDR accessibility.
 *
 * Register globally with `Chart.register(maidrPlugin)` or per-chart via
 * the `plugins` array in the chart configuration.
 *
 * Disable for a specific chart:
 * ```js
 * new Chart(ctx, {
 *   // ...
 *   options: { plugins: { maidr: { enabled: false } } },
 * });
 * ```
 */
export const maidrPlugin: ChartJsPlugin = {
  id: 'maidr',

  afterInit(chart: ChartJsChart) {
    initMaidrForChart(chart);
  },

  resize(chart: ChartJsChart) {
    handleResize(chart);
  },

  beforeDestroy(chart: ChartJsChart) {
    destroyMaidrForChart(chart);
  },
};
