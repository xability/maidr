/**
 * Chart.js plugin that adds MAIDR accessibility to canvas-based charts.
 *
 * This plugin automatically extracts data from Chart.js chart instances,
 * converts it to the MAIDR JSON schema, and renders the MAIDR accessible
 * interface around the chart canvas. Navigation events are bridged back
 * to Chart.js for visual highlighting via `setActiveElements`, and DOM
 * overlays are drawn on top of the canvas so users see MAIDR-style
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
import type { Maidr as MaidrData, MaidrLayer, NavigateCallback } from '../../type/grammar';
import type { LayerDatasetIndices, TargetMaps } from './highlightTargets';
import type { ChartJsActiveElement, ChartJsChart, ChartJsPlugin, MaidrPluginOptions } from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { extractChartData } from './extractor';
import { computeTargetMaps, resolveActiveTargets } from './highlightTargets';
import { elementToOverlayShape, HighlightOverlay } from './overlay';

// ---------------------------------------------------------------------------
// Internal state per chart
// ---------------------------------------------------------------------------

/** Raw MAIDR navigation event captured so resize can re-resolve targets. */
interface NavEvent {
  layerId: string;
  row: number;
  col: number;
  /**
   * A point cloud's selection, as `layer.data` indices. Carried through the
   * resize replay as well, so a re-resolve after a resize outlines the same
   * points rather than falling back to the `-1` position that accompanies it.
   */
  pointIndices?: readonly number[];
}

interface MaidrChartBinding {
  maidrData: MaidrData;
  root: Root;
  container: HTMLElement;
  /** All layers across all subplots; needed to resolve targets on resize replay. */
  layers: MaidrLayer[];
  /** Layer id → original Chart.js dataset indices, from `extractChartData`. */
  layerDatasetIndices: LayerDatasetIndices;
  /** Per-layer lookups mapping MAIDR positions back to Chart.js element indices. */
  targetMaps: TargetMaps;
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

  const shapes = [];
  for (const t of targets) {
    const meta = chart.getDatasetMeta(t.datasetIndex);
    const element = meta?.data?.[t.index];
    if (!element)
      continue;
    const shape = elementToOverlayShape(element);
    if (shape)
      shapes.push(shape);
  }
  if (shapes.length > 0)
    overlay.show(shapes);
  else
    overlay.clear();
}

function createHighlightCallback(
  chart: ChartJsChart,
  layers: MaidrLayer[],
  maps: TargetMaps,
  layerDatasetIndices: LayerDatasetIndices,
  getOverlay: () => HighlightOverlay | null,
  recordActive: (event: NavEvent | null) => void,
): NavigateCallback {
  return (event) => {
    try {
      recordActive(event);
      // `null` is the cursor leaving a subplot for the figure lobby: nothing
      // is selected, so no target is active. `applyHighlight` clears on an
      // empty list, and recording the `null` keeps the resize hook from
      // replaying the stale point.
      const targets = event === null
        ? []
        : resolveActiveTargets(
            layers,
            maps,
            layerDatasetIndices,
            event.layerId,
            event.row,
            event.col,
            event.pointIndices,
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

/**
 * Charts whose extraction has already been declined, so it is not retried.
 *
 * The binding runs on `afterUpdate`, which fires on every update rather than
 * once -- a hover, a resize or a `chart.update()` each reach it. A chart that
 * bound successfully is held in {@link chartBindings} and skipped by the guard
 * below; a chart whose type has no reading is not, so it would be re-extracted
 * and re-warned on every update without this.
 */
const declinedCharts = new WeakSet<ChartJsChart>();

function initMaidrForChart(chart: ChartJsChart): void {
  // Guard against duplicate initialization
  if (chartBindings.has(chart) || declinedCharts.has(chart))
    return;

  const pluginOptions = getPluginOptions(chart);

  if (pluginOptions.enabled === false)
    return;

  // Extract data first, then create a layer-aware highlight callback. When the
  // plugin is registered globally, unsupported chart types (radar, polarArea,
  // ...) reach this hook too; extraction throws for them, so catch it and leave
  // the chart untouched rather than breaking construction.
  let extracted: MaidrData;
  let layerDatasetIndices: LayerDatasetIndices;
  try {
    ({ maidr: extracted, layerDatasetIndices } = extractChartData(chart, pluginOptions));
  } catch (error) {
    declinedCharts.add(chart);
    console.warn(
      `MAIDR Chart.js plugin: skipping chart. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  // Axis-stacked panels produce a multi-subplot grid; flatten every panel's
  // layers (layer ids are figure-unique) for target resolution.
  const layers = extracted.subplots.flat().flatMap(subplot => subplot.layers);

  // Precompute per-layer position→index lookups so navigation can be mapped to
  // one or more Chart.js indices in O(1) at highlight time.
  const targetMaps = computeTargetMaps(chart, layers, layerDatasetIndices);

  // The overlay is created asynchronously once the React tree mounts.
  // The highlight callback closes over a getter so it always reads the
  // latest reference (null until mount, then the live HighlightOverlay).
  let overlay: HighlightOverlay | null = null;

  // Record the latest MAIDR navigation event on the per-chart binding so
  // the resize hook can replay it after Chart.js re-lays out the canvas.
  const recordActive = (event: NavEvent | null): void => {
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
      layerDatasetIndices,
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
    layerDatasetIndices,
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
        binding.layerDatasetIndices,
        active.layerId,
        active.row,
        active.col,
        active.pointIndices,
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

  // `afterUpdate`, not `afterInit`: Chart.js parses its datasets during the
  // first update, and several readings are taken from that parse rather than
  // from the author's rows -- a box plot's and a violin's five-number
  // summaries among them, which the plugin computes and `dataset.data` never
  // holds, and an error bar's bounds with them.
  //
  // Measured on chart.js 4 with `@sgratzl/chartjs-chart-boxplot`, a
  // three-box chart reports `getDatasetMeta(0)._parsed.length` as 0 at
  // `afterInit` and 3 at `afterUpdate`. Binding at init therefore read an
  // empty summary, and every Chart.js box plot, violin and error-bar chart --
  // the repository's own `examples/chartjs/boxplot.html` included -- announced
  // "No trace info available" and navigated nothing.
  //
  // Both hooks run inside `new Chart(...)`, so nothing arrives later than it
  // did; what changes is that the parse has happened by the time the data is
  // read. Repeat updates are cheap: a bound chart is held in `chartBindings`
  // and a declined one in `declinedCharts`, and both are skipped above.
  afterUpdate(chart: ChartJsChart) {
    initMaidrForChart(chart);
  },

  resize(chart: ChartJsChart) {
    handleResize(chart);
  },

  beforeDestroy(chart: ChartJsChart) {
    destroyMaidrForChart(chart);
  },
};
