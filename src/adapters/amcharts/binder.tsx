/**
 * Programmatic binder for the amCharts 5 adapter.
 *
 * Unlike `fromAmCharts` (which returns serializable JSON for the `maidr`
 * attribute), `bindAmCharts` mounts MAIDR's React component directly over the
 * chart so it can pass an `onNavigate` callback — a function that cannot
 * survive JSON serialization. That callback drives a DOM highlight overlay on
 * top of the canvas, since amCharts renders to canvas and has no per-element
 * SVG nodes to highlight.
 *
 * This mirrors the Chart.js plugin (`src/adapters/chartjs/plugin.tsx`).
 *
 * @example
 * ```ts
 * import { bindAmCharts } from 'maidr/amcharts';
 *
 * const root = am5.Root.new('chartdiv');
 * // ... build chart, axes, series, data ...
 * const binding = bindAmCharts(root, { title: 'Sales by Day' });
 * // later: binding.dispose();
 * ```
 */

import type { Maidr as MaidrData, NavigateCallback } from '@type/grammar';
import type { JSX } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import type { NavMap } from './navmap';
import type {
  AmChartsBinderOptions,
  AmRoot,
  AmXYChart,
  AmXYSeries,
} from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { convertCharts, findXYCharts } from './adapter';
import { classifySeriesKind } from './extractor';
import { readPlotBounds } from './geometry';
import { getHighlightColor } from './highlightColor';
import { buildNavigationMap } from './navmap';
import { dataItemToOverlayRect, HighlightOverlay } from './overlay';

/**
 * Options for {@link bindAmCharts} / {@link bindXYChart}.
 */
export interface AmChartsBindOptions extends AmChartsBinderOptions {
  /** Set `false` to mount MAIDR without the canvas highlight overlay. Default `true`. */
  highlight?: boolean;
  /** Outline color for the highlight overlay. */
  highlightColor?: string;
}

/**
 * Handle returned by {@link bindAmCharts} / {@link bindXYChart}.
 */
export interface AmChartsBinding {
  /** The MAIDR data that was mounted (for inspection; excludes the callback). */
  maidr: MaidrData;
  /** Unmount MAIDR, dispose the overlay, and restore the chart DOM. */
  dispose: () => void;
}

interface NavEvent {
  layerId: string;
  row: number;
  col: number;
}

// ---------------------------------------------------------------------------
// React helper: adopt root.dom into a sized, positioned host (overlay parent).
// Mirrors CanvasHost in the Chart.js plugin.
// ---------------------------------------------------------------------------

interface AmHostProps {
  node: HTMLElement;
  width: number;
  height: number;
  onHost: (host: HTMLDivElement | null) => void;
}

function AmHost({ node, width, height, onHost }: AmHostProps): JSX.Element {
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
// Highlight bridge
// ---------------------------------------------------------------------------

function applyHighlight(
  overlay: HighlightOverlay,
  navMap: NavMap,
  event: NavEvent,
): void {
  const targets = navMap.resolve(event.layerId, event.row, event.col);
  if (targets.length === 0) {
    overlay.clear();
    return;
  }

  // Clip the highlight to the OWNING panel's visible plot area; a column's
  // geometry can extend to the value=0 baseline beyond a clipped (min > 0)
  // axis, and in multi-panel roots it must not bleed into sibling panels.
  const chart = navMap.chartFor(event.layerId);
  const plotBounds = chart ? readPlotBounds(chart) : null;

  const rects = [];
  for (const target of targets) {
    const rect = dataItemToOverlayRect(target, plotBounds);
    if (rect)
      rects.push(rect);
  }

  if (rects.length > 0)
    overlay.show(rects);
  else
    overlay.clear();
}

function createHighlightCallback(
  navMap: NavMap,
  getOverlay: () => HighlightOverlay | null,
  recordActive: (event: NavEvent) => void,
): NavigateCallback {
  return (event) => {
    try {
      recordActive(event);
      const overlay = getOverlay();
      if (!overlay)
        return;
      applyHighlight(overlay, navMap, event);
    } catch {
      // Ignore highlight errors (e.g., during teardown or before layout).
    }
  };
}

// ---------------------------------------------------------------------------
// Series grouping (mirrors fromXYChart in adapter.ts)
// ---------------------------------------------------------------------------

function groupSeries(chart: AmXYChart): {
  barSeriesList: AmXYSeries[];
  lineSeriesList: AmXYSeries[];
  histogramSeries: AmXYSeries[];
  heatmapSeries: AmXYSeries[];
} {
  const barSeriesList: AmXYSeries[] = [];
  const lineSeriesList: AmXYSeries[] = [];
  const histogramSeries: AmXYSeries[] = [];
  const heatmapSeries: AmXYSeries[] = [];

  for (const series of chart.series.values) {
    switch (classifySeriesKind(series)) {
      case 'bar':
        barSeriesList.push(series);
        break;
      case 'line':
        lineSeriesList.push(series);
        break;
      case 'histogram':
        histogramSeries.push(series);
        break;
      case 'heatmap':
        heatmapSeries.push(series);
        break;
      default:
        break;
    }
  }

  return { barSeriesList, lineSeriesList, histogramSeries, heatmapSeries };
}

// ---------------------------------------------------------------------------
// React mount (mirrors renderMaidr in the Chart.js plugin)
// ---------------------------------------------------------------------------

interface RenderResult {
  root: ReactRoot;
  container: HTMLElement;
  hostPromise: Promise<HTMLDivElement | null>;
}

function renderMaidr(maidrData: MaidrData, rootDom: HTMLElement): RenderResult | null {
  const parent = rootDom.parentElement;
  if (!parent) {
    console.error('MAIDR amCharts binder: chart root must be in the DOM');
    return null;
  }

  const { width, height } = rootDom.getBoundingClientRect();
  const hostWidth = width > 0 ? width : (rootDom.clientWidth || 600);
  const hostHeight = height > 0 ? height : (rootDom.clientHeight || 400);

  const container = document.createElement('div');
  container.style.display = 'contents';
  container.setAttribute('data-maidr-amcharts', maidrData.id);
  parent.insertBefore(container, rootDom);

  const reactContainer = document.createElement('div');
  reactContainer.style.display = 'contents';
  container.appendChild(reactContainer);

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

  const reactRoot = createRoot(reactContainer, { identifierPrefix: maidrData.id });
  reactRoot.render(
    <MaidrComponent data={maidrData}>
      <AmHost node={rootDom} width={hostWidth} height={hostHeight} onHost={handleHost} />
    </MaidrComponent>,
  );

  return { root: reactRoot, container, hostPromise };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bind MAIDR to an amCharts 5 {@link AmRoot}, mounting the accessible UI and
 * (by default) a canvas highlight overlay. Finds every XYChart in the root's
 * container tree (including am5stock StockPanels); each chart becomes one
 * MAIDR subplot, navigable with the arrow keys.
 *
 * @throws If no supported XYChart is found in `root.container`.
 */
export function bindAmCharts(root: AmRoot, options?: AmChartsBindOptions): AmChartsBinding {
  const charts = findXYCharts(root);
  if (charts.length === 0) {
    throw new Error(
      'maidr amCharts binder: no XYChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling bindAmCharts().',
    );
  }
  return bindCharts(charts, root, options);
}

/**
 * Bind MAIDR to a known amCharts 5 {@link AmXYChart}. Use when you already hold
 * the chart reference. `root` is required for its DOM element and render events.
 */
export function bindXYChart(
  chart: AmXYChart,
  root: AmRoot,
  options?: AmChartsBindOptions,
): AmChartsBinding {
  return bindCharts([chart], root, options);
}

/**
 * Shared binding path: converts the charts (one subplot each), mounts MAIDR
 * over `root.dom`, and wires one highlight overlay for the whole root — all
 * panels of one root render into the same canvases, and highlight geometry is
 * already root-relative. Each highlight clips against its own panel's plot
 * bounds via the navigation map's owning-chart record.
 */
function bindCharts(
  charts: AmXYChart[],
  root: AmRoot,
  options?: AmChartsBindOptions,
): AmChartsBinding {
  const { maidr: data, panels } = convertCharts(charts, root.dom, options);
  const highlightEnabled = options?.highlight !== false;

  let overlay: HighlightOverlay | null = null;
  let lastActive: NavEvent | null = null;

  let maidrData: MaidrData = data;
  if (highlightEnabled) {
    const navMap = buildNavigationMap(panels.map(panel => ({
      layers: panel.layers,
      groups: groupSeries(panel.chart),
      chart: panel.chart,
    })));
    maidrData = {
      ...data,
      onNavigate: createHighlightCallback(
        navMap,
        () => overlay,
        (event) => {
          lastActive = event;
        },
      ),
    };

    const rendered = renderMaidr(maidrData, root.dom);
    if (!rendered) {
      return { maidr: data, dispose: () => {} };
    }

    const getColor = (): string => options?.highlightColor ?? getHighlightColor();
    const overlayPromise = rendered.hostPromise.then((host) => {
      if (!host)
        return null;
      overlay = new HighlightOverlay(host, root.dom, getColor);
      // Paint the initial position if navigation already happened.
      if (lastActive)
        applyHighlight(overlay, navMap, lastActive);
      return overlay;
    });

    const replay = (): void => {
      void overlayPromise.then((ov) => {
        if (!ov || !lastActive)
          return;
        try {
          applyHighlight(ov, navMap, lastActive);
        } catch {
          // Ignore; chart may be mid-teardown.
        }
      });
    };

    const resizeObserver = new ResizeObserver(replay);
    resizeObserver.observe(root.dom);

    // Clear the highlight when focus leaves the chart, matching the SVG
    // adapters (whose HighlightService clears when the Controller disposes).
    // focusout bubbles up from the focusable plot element through `container`.
    const handleFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget as Node | null;
      if (next && rendered.container.contains(next)) {
        return;
      }
      void overlayPromise.then(ov => ov?.clear());
    };
    rendered.container.addEventListener('focusout', handleFocusOut);

    return {
      maidr: maidrData,
      dispose: () => {
        resizeObserver.disconnect();
        rendered.container.removeEventListener('focusout', handleFocusOut);
        void overlayPromise.then(ov => ov?.dispose());
        teardownMount(rendered, root.dom);
      },
    };
  }

  // Highlight disabled: mount the accessible UI without overlay/callback.
  const rendered = renderMaidr(maidrData, root.dom);
  if (!rendered) {
    return { maidr: data, dispose: () => {} };
  }
  return {
    maidr: maidrData,
    dispose: () => teardownMount(rendered, root.dom),
  };
}

/**
 * Restore `root.dom` to its original parent and unmount the React tree.
 *
 * Unmount FIRST: `AmHost`'s ref cleanup detaches `rootDom` from the
 * React-owned host. THEN restore `rootDom` to its original parent, and finally
 * remove the now-empty container. Doing this in the other order lets the ref
 * cleanup remove the just-restored chart DOM from the page.
 */
function teardownMount(rendered: RenderResult, rootDom: HTMLElement): void {
  rendered.root.unmount();
  rendered.container.parentElement?.insertBefore(rootDom, rendered.container);
  rendered.container.remove();
}
