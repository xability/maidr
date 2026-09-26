/**
 * Binds MAIDR to a live TradingView Lightweight Charts instance.
 *
 * `bindLightweightChart` reads the chart, mounts MAIDR's React component
 * around the chart's container and draws the highlight over its canvases, as
 * the amCharts binder does. It then stays subscribed to every series, so a
 * `series.update(...)` or `series.setData(...)` reaches MAIDR too:
 *
 * - a new bar at the end of a series is handed to MAIDR's `appendData`, which
 *   is what monitor mode (`M`) announces and sonifies;
 * - anything else -- the forming bar revised in place, a history reload -- is
 *   handed to `setData`, which updates the figure silently and keeps the
 *   reader where they were.
 *
 * Changes arriving together (a candle and its volume bar from one socket
 * message) are read once, at the end of the task that made them.
 */

import type { Maidr as MaidrData, NavigateCallback } from '@type/grammar';
import type { JSX } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import type { LightweightChartsOptions, LightweightChartsReading, SeriesReading } from './converters';
import type { LwcChart, LwcDataItem, LwcSeries } from './types';
import { getHighlightColor } from '@adapters/shared/highlightColor';
import { appendMaidrData, setMaidrData } from '@service/liveData';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { readLightweightChart } from './converters';
import { HighlightOverlay, highlightRect, panePlotArea } from './overlay';
import { labelOf, planAppends } from './sync';

/**
 * Options for {@link bindLightweightChart}.
 */
export interface LightweightChartsBindOptions extends LightweightChartsOptions {
  /** Set `false` to mount MAIDR without the highlight overlay. Default `true`. */
  highlight?: boolean;
  /** Outline color for the highlight. Defaults to MAIDR's highlight setting. */
  highlightColor?: string;
}

/**
 * Handle returned by {@link bindLightweightChart}.
 */
export interface LightweightChartsBinding {
  /** The MAIDR figure as it stands, after the latest data change. */
  readonly maidr: MaidrData;
  /**
   * Reads the chart again from scratch. Call it after adding or removing a
   * series or a pane: data changes are followed on their own, but the chart
   * reports no event when its set of series changes.
   */
  refresh: () => void;
  /** Unsubscribes, unmounts MAIDR and puts the chart's container back. */
  dispose: () => void;
}

/** Where the reader is: a layer and the bar under the cursor. */
interface ActivePoint {
  layerId: string;
  col: number;
  /** The bar's label, so the highlight can follow it as the data moves. */
  label: string;
}

// ---------------------------------------------------------------------------
// React mount (mirrors the amCharts binder)
// ---------------------------------------------------------------------------

interface ChartHostProps {
  node: HTMLElement;
  width: number;
  height: number;
  onHost: (host: HTMLDivElement | null) => void;
}

/**
 * Adopts the chart's container into a sized, positioned wrapper inside
 * MAIDR's tree; the wrapper is also the overlay's parent.
 */
function ChartHost({ node, width, height, onHost }: ChartHostProps): JSX.Element {
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

interface RenderResult {
  root: ReactRoot;
  container: HTMLElement;
  hostPromise: Promise<HTMLDivElement | null>;
}

function renderMaidr(maidrData: MaidrData, node: HTMLElement): RenderResult | null {
  const parent = node.parentElement;
  if (!parent) {
    console.error('MAIDR Lightweight Charts binder: the chart container must be in the DOM');
    return null;
  }

  const { width, height } = node.getBoundingClientRect();
  const hostWidth = width > 0 ? width : (node.clientWidth || 600);
  const hostHeight = height > 0 ? height : (node.clientHeight || 400);

  const container = document.createElement('div');
  container.style.display = 'contents';
  container.setAttribute('data-maidr-lightweight-charts', maidrData.id);
  parent.insertBefore(container, node);

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

  const root = createRoot(reactContainer, { identifierPrefix: maidrData.id });
  root.render(
    <MaidrComponent data={maidrData}>
      <ChartHost node={node} width={hostWidth} height={hostHeight} onHost={handleHost} />
    </MaidrComponent>,
  );

  return { root, container, hostPromise };
}

/**
 * Unmounts MAIDR and puts the chart's container back where it was.
 *
 * Unmount first: `ChartHost`'s ref cleanup detaches the node from the wrapper,
 * and would take it off the page again if it had already been restored.
 */
function teardownMount(rendered: RenderResult, node: HTMLElement): void {
  rendered.root.unmount();
  rendered.container.parentElement?.insertBefore(node, rendered.container);
  rendered.container.remove();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Binds MAIDR to a Lightweight Charts chart: reads its panes and series,
 * mounts the accessible interface, highlights the reader's bar over the
 * canvas, and follows the chart's data as it changes.
 *
 * Call it once the series have data. The chart's container -- the element
 * passed to `createChart` -- must be in the document.
 *
 * @param chart - The chart `createChart` returned
 * @param options - Titles, labels, live and highlight settings
 * @returns A handle to refresh or dispose the binding
 * @throws If no pane has a series MAIDR can read with data in it
 *
 * @example
 * ```ts
 * import { CandlestickSeries, createChart, HistogramSeries } from 'lightweight-charts';
 * import { bindLightweightChart } from 'maidr/lightweight-charts';
 *
 * const chart = createChart(document.getElementById('chart'), { height: 400 });
 * const candles = chart.addSeries(CandlestickSeries, { title: 'BTC-USD' });
 * const volume = chart.addSeries(HistogramSeries, { title: 'Volume' }, 1);
 * candles.setData(ohlc);
 * volume.setData(volumes);
 *
 * const binding = bindLightweightChart(chart, { title: 'BTC-USD, 1 minute' });
 * // Streaming: every series.update(...) now reaches MAIDR on its own.
 * // Later: binding.dispose();
 * ```
 */
export function bindLightweightChart(
  chart: LwcChart,
  options: LightweightChartsBindOptions = {},
): LightweightChartsBinding {
  const chartElement = chart.chartElement();
  const node = chartElement.parentElement;
  if (!node) {
    throw new Error('MAIDR Lightweight Charts binder: the chart is not attached to a container element');
  }

  let reading = readLightweightChart(chart, { ...options, live: options.live ?? true });
  const id = reading.maidr.id;
  const highlightEnabled = options.highlight !== false;

  let overlay: HighlightOverlay | null = null;
  let active: ActivePoint | null = null;

  /** The bar the reader is on, found again in the current reading. */
  const locate = (point: ActivePoint): { series: SeriesReading; item: LwcDataItem } | null => {
    const series = reading.series.find(candidate => candidate.layerId === point.layerId);
    if (!series) {
      return null;
    }
    let index = point.col;
    const at = series.points[index];
    if (at === undefined || labelOf(at) !== point.label) {
      index = series.points.findIndex(candidate => labelOf(candidate) === point.label);
    }
    const item = series.items[index];
    return item ? { series, item } : null;
  };

  const draw = (): void => {
    if (!overlay) {
      return;
    }
    const found = active ? locate(active) : null;
    if (!found) {
      overlay.clear();
      overlay.setPlotArea(null);
      return;
    }
    overlay.setPlotArea(panePlotArea(chart, found.series.paneIndex));
    const rect = highlightRect(chart, found.series, found.item);
    if (rect) {
      overlay.show([rect]);
    } else {
      overlay.clear();
    }
  };

  const onNavigate: NavigateCallback = (event) => {
    try {
      if (event === null) {
        active = null;
      } else {
        const series = reading.series.find(candidate => candidate.layerId === event.layerId);
        const point = series?.points[event.col];
        active = point === undefined ? null : { layerId: event.layerId, col: event.col, label: labelOf(point) };
      }
      draw();
    } catch (error) {
      console.warn('[MAIDR Lightweight Charts] highlight failed', error);
    }
  };

  const withCallback = (data: MaidrData): MaidrData =>
    highlightEnabled ? { ...data, onNavigate } : data;

  const rendered = renderMaidr(withCallback(reading.maidr), node);
  if (!rendered) {
    throw new Error('MAIDR Lightweight Charts binder: the chart container must be in the DOM');
  }

  let disposed = false;
  let frame: number | null = null;
  /** Redraws on the chart's next frame, once it has laid out the change. */
  const redraw = (): void => {
    if (disposed || frame !== null) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!disposed) {
        draw();
      }
    });
  };

  const overlayPromise = highlightEnabled
    ? rendered.hostPromise.then((host) => {
        if (!host || disposed) {
          return null;
        }
        overlay = new HighlightOverlay(host, chartElement, () => options.highlightColor ?? getHighlightColor());
        draw();
        return overlay;
      })
    : Promise.resolve(null);

  /** Reads the chart and hands MAIDR what changed. */
  const sync = (): void => {
    let next: LightweightChartsReading;
    try {
      next = readLightweightChart(chart, { ...options, live: options.live ?? true }, id);
    } catch (error) {
      // Every series emptied: keep the figure MAIDR has rather than none.
      console.warn('[MAIDR Lightweight Charts] data change not applied', error);
      return;
    }
    const appends = planAppends(reading, next);
    reading = next;
    // An append MAIDR refuses -- the figure not mounted yet -- falls back to
    // replacing the figure, so MAIDR never lags the chart.
    const appended = appends !== null && appends.every(({ reading: series, point }) =>
      appendMaidrData(point, { id, subplotRow: series.subplotRow, subplotCol: 0, layerId: series.layerId }));
    if (!appended) {
      setMaidrData(withCallback(next.maidr));
    }
    redraw();
  };

  let pending = false;
  const onDataChanged = (): void => {
    if (pending || disposed) {
      return;
    }
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!disposed) {
        sync();
      }
    });
  };

  let subscribed: LwcSeries[] = [];
  const subscribe = (): void => {
    for (const series of subscribed) {
      series.unsubscribeDataChanged(onDataChanged);
    }
    // Every series, not only those read: one with no data yet joins the
    // figure when its first bars arrive.
    subscribed = chart.panes().flatMap(pane => pane.getSeries());
    for (const series of subscribed) {
      series.subscribeDataChanged(onDataChanged);
    }
  };
  subscribe();

  const timeScale = chart.timeScale();
  timeScale.subscribeVisibleLogicalRangeChange(redraw);
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(redraw);
  resizeObserver?.observe(chartElement);

  // Clear the highlight when focus leaves the chart, as the SVG adapters'
  // highlight does when MAIDR's controller is disposed.
  const handleFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && rendered.container.contains(next)) {
      return;
    }
    void overlayPromise.then(ov => ov?.clear());
  };
  rendered.container.addEventListener('focusout', handleFocusOut);

  return {
    get maidr() {
      return reading.maidr;
    },
    refresh: () => {
      if (disposed) {
        return;
      }
      subscribe();
      sync();
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const series of subscribed) {
        series.unsubscribeDataChanged(onDataChanged);
      }
      subscribed = [];
      timeScale.unsubscribeVisibleLogicalRangeChange(redraw);
      resizeObserver?.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      rendered.container.removeEventListener('focusout', handleFocusOut);
      void overlayPromise.then(ov => ov?.dispose());
      teardownMount(rendered, node);
    },
  };
}
