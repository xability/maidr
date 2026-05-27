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
import type { ChartJsActiveElement, ChartJsChart, ChartJsPlugin, MaidrPluginOptions } from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { TraceType } from '../../type/grammar';
import { extractMaidrData } from './extractor';
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
  /**
   * Per-layer X-bucket lookup that mirrors `ScatterTrace`'s X-grouping.
   * For each scatter layer, `xBuckets[colIndex]` lists the Chart.js
   * dataset indices that share that X coordinate.
   */
  xBucketsByLayer: Map<string, number[][]>;
  /** Resolved once the React tree mounts and provides the host wrapper. */
  overlayPromise: Promise<HighlightOverlay | null>;
  /** Latest MAIDR navigation event, replayed on resize. */
  lastActive: NavEvent | null;
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
 * Mirror `ScatterTrace`'s X-bucket construction (`src/model/scatter.ts:86-100`)
 * to map MAIDR's `col` (an X-bucket index) back to one or more original
 * Chart.js dataset indices. Points are sorted by X, then Y; consecutive
 * points sharing an X form a bucket.
 *
 * Returns, for each scatter layer, an array where `result[col]` is the list
 * of Chart.js dataset-relative indices that should be highlighted together.
 */
function computeScatterBuckets(layers: MaidrLayer[]): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  for (const layer of layers) {
    if (layer.type !== TraceType.SCATTER)
      continue;
    const data = layer.data as ReadonlyArray<{ x: number; y: number }>;
    if (!Array.isArray(data))
      continue;
    // Track original indices through the sort so we can hand them to Chart.js.
    const indexed = data.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y);
    const buckets: number[][] = [];
    let currentX: number | null = null;
    for (const { p, i } of indexed) {
      if (currentX === null || currentX !== p.x) {
        currentX = p.x;
        buckets.push([]);
      }
      buckets[buckets.length - 1].push(i);
    }
    out.set(layer.id, buckets);
  }
  return out;
}

/**
 * Resolve a MAIDR navigation event into the Chart.js active elements that
 * should be highlighted. Returns an array because scatter X-buckets can
 * contain multiple points that share an X coordinate.
 */
function resolveActiveTargets(
  layers: MaidrLayer[],
  xBucketsByLayer: Map<string, number[][]>,
  layerId: string,
  row: number,
  col: number,
): ChartJsActiveElement[] {
  const layer = layers.find(l => l.id === layerId);
  if (!layer)
    return [];

  // Segmented bars: MAIDR row = group (dataset), col = category (index).
  // This matches Chart.js's native (datasetIndex, index) addressing.
  if (isSegmentedType(layer.type))
    return [{ datasetIndex: row, index: col }];

  // Scatter: col is an X-bucket; expand to all points sharing that X.
  if (layer.type === TraceType.SCATTER) {
    const buckets = xBucketsByLayer.get(layer.id);
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

  // Heatmap / Matrix: a single dataset with flat indexing. MAIDR's Heatmap
  // model reverses the Y axis (row 0 = bottom), so un-reverse to recover the
  // original yLabel index before computing the flat element index.
  if (layer.type === TraceType.HEATMAP) {
    const hd = layer.data as HeatmapData;
    const numY = hd.y.length;
    const numX = hd.x.length;
    const originalYi = (numY - 1) - row;
    return [{ datasetIndex: 0, index: originalYi * numX + col }];
  }

  // Bar / line / others: MAIDR row = dataset, col = point.
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
  xBucketsByLayer: Map<string, number[][]>,
  getOverlay: () => HighlightOverlay | null,
  recordActive: (event: NavEvent) => void,
): NavigateCallback {
  return (event) => {
    try {
      recordActive(event);
      const targets = resolveActiveTargets(
        layers,
        xBucketsByLayer,
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

  // Extract data first, then create a layer-aware highlight callback
  const extracted = extractMaidrData(chart, pluginOptions);
  const layers = extracted.subplots[0][0].layers;

  // Precompute scatter X-buckets so navigation can be mapped to one or
  // more Chart.js indices in O(1) at highlight time.
  const xBucketsByLayer = computeScatterBuckets(layers);

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
      xBucketsByLayer,
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
    xBucketsByLayer,
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
        binding.xBucketsByLayer,
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

  // Restore canvas to its original parent position before removing container
  const canvas = chart.canvas;
  const parent = binding.container.parentElement;
  if (parent) {
    parent.insertBefore(canvas, binding.container);
  }

  binding.root.unmount();
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
