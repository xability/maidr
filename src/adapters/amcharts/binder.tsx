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
  AmBounds,
  AmChartsBinderOptions,
  AmRoot,
  AmXYChart,
  AmXYSeries,
} from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { fromXYChart } from './adapter';
import { classifySeriesKind } from './extractor';
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

/**
 * Read the plot-area bounds (CSS px, root-relative) used to clip highlights.
 * Tries `globalBounds()`, then `toGlobal()` + `width()/height()`; returns
 * `null` if neither is available (the overlay's `overflow:hidden` still clips
 * to the chart box).
 */
function readPlotBounds(chart: AmXYChart): AmBounds | null {
  const pc = chart.plotContainer;
  if (!pc) {
    return null;
  }
  try {
    const bounds = pc.globalBounds?.();
    if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.bottom)) {
      return bounds;
    }
    if (pc.toGlobal && pc.width && pc.height) {
      const tl = pc.toGlobal({ x: 0, y: 0 });
      return { left: tl.x, top: tl.y, right: tl.x + pc.width(), bottom: tl.y + pc.height() };
    }
  } catch {
    // Fall through; overlay overflow:hidden still clips to the chart box.
  }
  return null;
}

function applyHighlight(
  overlay: HighlightOverlay,
  navMap: NavMap,
  chart: AmXYChart,
  event: NavEvent,
): void {
  const targets = navMap.resolve(event.layerId, event.row, event.col);
  if (targets.length === 0) {
    overlay.clear();
    return;
  }

  // Clip the highlight to the visible plot area; a column's geometry can
  // extend to the value=0 baseline beyond a clipped (min > 0) axis.
  const plotBounds = readPlotBounds(chart);

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
  chart: AmXYChart,
  getOverlay: () => HighlightOverlay | null,
  recordActive: (event: NavEvent) => void,
): NavigateCallback {
  return (event) => {
    try {
      recordActive(event);
      const overlay = getOverlay();
      if (!overlay)
        return;
      applyHighlight(overlay, navMap, chart, event);
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

function findXYChart(root: AmRoot): AmXYChart | undefined {
  for (const child of root.container.children.values) {
    const candidate = child as Partial<AmXYChart>;
    if (candidate.series && candidate.xAxes && candidate.yAxes) {
      return candidate as AmXYChart;
    }
  }
  return undefined;
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
 * (by default) a canvas highlight overlay. Finds the first XYChart in the root.
 *
 * @throws If no supported XYChart is found in `root.container`.
 */
export function bindAmCharts(root: AmRoot, options?: AmChartsBindOptions): AmChartsBinding {
  const chart = findXYChart(root);
  if (!chart) {
    throw new Error(
      'maidr amCharts binder: no XYChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling bindAmCharts().',
    );
  }
  return bindXYChart(chart, root, options);
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
  const data = fromXYChart(chart, root.dom, options);
  const highlightEnabled = options?.highlight !== false;

  let overlay: HighlightOverlay | null = null;
  let lastActive: NavEvent | null = null;

  let maidrData: MaidrData = data;
  if (highlightEnabled) {
    const groups = groupSeries(chart);
    const navMap = buildNavigationMap(data.subplots[0][0].layers, groups);
    maidrData = {
      ...data,
      onNavigate: createHighlightCallback(
        navMap,
        chart,
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
        applyHighlight(overlay, navMap, chart, lastActive);
      return overlay;
    });

    const replay = (): void => {
      void overlayPromise.then((ov) => {
        if (!ov || !lastActive)
          return;
        try {
          applyHighlight(ov, navMap, chart, lastActive);
        } catch {
          // Ignore; chart may be mid-teardown.
        }
      });
    };

    const resizeObserver = new ResizeObserver(replay);
    resizeObserver.observe(root.dom);

    return {
      maidr: maidrData,
      dispose: () => {
        resizeObserver.disconnect();
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
 */
function teardownMount(rendered: RenderResult, rootDom: HTMLElement): void {
  const parent = rendered.container.parentElement;
  if (parent) {
    parent.insertBefore(rootDom, rendered.container);
  }
  rendered.root.unmount();
  rendered.container.remove();
}
