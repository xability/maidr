/**
 * Binds a uPlot chart to MAIDR.
 *
 * The chart is read into the MAIDR schema (see `./extractor`), and MAIDR's
 * accessible interface is mounted around uPlot's `.uplot` root so the reader
 * can focus the chart and navigate it by keyboard with sound, text and
 * braille. Navigation is drawn back onto the chart twice: as a box over the
 * focused mark (see `./overlay`) and by moving uPlot's own cursor there, so
 * its legend -- and a Grafana panel's tooltip, which follows the cursor --
 * shows the same point the reader is on.
 *
 * The binding follows the chart through uPlot's hooks: `u.setData(...)` is
 * read into the figure (see `./live`), a resize redraws the highlight, and
 * `u.destroy()` unmounts MAIDR. A click on the plot moves the reader to the
 * point under the cursor, so a sighted colleague can point at a mark.
 *
 * @example
 * ```js
 * import uPlot from 'uplot';
 * import { maidrPlugin } from 'maidr/uplot';
 *
 * new uPlot({
 *   width: 640,
 *   height: 320,
 *   series: [{}, { label: 'CPU %' }],
 *   plugins: [maidrPlugin()],
 * }, data, document.getElementById('chart'));
 * ```
 */

import type { JSX } from 'react';
import type { Root } from 'react-dom/client';
import type { Maidr as MaidrData, MaidrLayer, NavigateCallback, NavigationTarget } from '../../type/grammar';
import type { UPlotLayerSource } from './extractor';
import type { OverlayBox } from './overlay';
import type { MaidrUPlotHandle, MaidrUPlotOptions, UPlotInstance, UPlotPlugin } from './types';
import { getHighlightColor } from '@adapters/shared/highlightColor';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { liveDataManager } from '../../service/liveData';
import { extractUPlotData } from './extractor';
import { pushUpdate } from './live';
import { UPlotHighlightOverlay } from './overlay';

/** The last position MAIDR reported, replayed after a resize or an update. */
interface NavEvent {
  layerId: string;
  row: number;
  col: number;
  pointIndices?: readonly number[];
}

/** uPlot's default bar width, as a share of the gap between two x values. */
const BAR_WIDTH_SHARE = 0.6;

/** Half the side of the box drawn around a line vertex or a point. */
const POINT_HALF_BOX = 6;

let nextId = 0;

const bindings = new WeakMap<UPlotInstance, MaidrUPlotHandle>();

// ---------------------------------------------------------------------------
// React host: adopt uPlot's root into MAIDR's figure
// ---------------------------------------------------------------------------

interface ChartHostProps {
  node: HTMLElement;
  onMount: () => void;
}

function ChartHost({ node, onMount }: ChartHostProps): JSX.Element {
  const ref = useCallback((host: HTMLDivElement | null) => {
    if (host) {
      if (!host.contains(node)) {
        host.appendChild(node);
      }
      onMount();
    } else {
      node.parentNode?.removeChild(node);
    }
  }, [node, onMount]);
  return <div ref={ref} style={{ display: 'inline-block', position: 'relative' }} />;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The x value uPlot positions data index `k` of an aligned chart at. An
 * ordinal x scale (`distr: 2`) lays the points out by index -- uPlot swaps
 * its internal x column for `0..n-1` and ranges the scale over that -- so
 * there the index is the position, whatever the x values are.
 */
function xPosition(u: UPlotInstance, xScale: string, k: number): number | null {
  if (u.scales[xScale]?.distr === 2) {
    return k;
  }
  const x = (u.data as ReadonlyArray<ArrayLike<number | null | undefined>>)[0]?.[k];
  return finite(x) ? x : null;
}

/**
 * Where data index `k` of series `i` is drawn, as `[x, y]` in the values the
 * chart positions by (not MAIDR's, which convert timestamps).
 */
function rawPoint(u: UPlotInstance, source: UPlotLayerSource, seriesIdx: number, k: number): [number, number] | null {
  if ((u.mode ?? 1) === 2) {
    const columns = (u.data as ReadonlyArray<ReadonlyArray<ArrayLike<number | null | undefined>> | null>)[seriesIdx];
    const x = columns?.[0]?.[k];
    const y = columns?.[1]?.[k];
    return finite(x) && finite(y) ? [x, y] : null;
  }
  const x = xPosition(u, source.xScale, k);
  const y = (u.data as ReadonlyArray<ArrayLike<number | null | undefined>>)[seriesIdx]?.[k];
  return x !== null && finite(y) ? [x, y] : null;
}

/** CSS-pixel position of a data value inside the plotting area. */
function toPlot(u: UPlotInstance, source: UPlotLayerSource, x: number, y: number): { left: number; top: number } {
  const px = u.valToPos(x, source.xScale);
  const py = u.valToPos(y, source.yScale);
  return u.scales[source.xScale]?.ori === 1 ? { left: py, top: px } : { left: px, top: py };
}

/** The gap between data index `k` and its nearest neighbour, in pixels. */
function columnWidth(u: UPlotInstance, source: UPlotLayerSource, k: number): number {
  const here = xPosition(u, source.xScale, k);
  if (here === null) {
    return POINT_HALF_BOX * 2;
  }
  const at = u.valToPos(here, source.xScale);
  let gap = Number.POSITIVE_INFINITY;
  for (const n of [k - 1, k + 1]) {
    const v = n >= 0 ? xPosition(u, source.xScale, n) : null;
    if (v !== null) {
      gap = Math.min(gap, Math.abs(u.valToPos(v, source.xScale) - at));
    }
  }
  return Number.isFinite(gap) ? gap : POINT_HALF_BOX * 4;
}

function boxAround(left: number, top: number): OverlayBox {
  return {
    left: left - POINT_HALF_BOX,
    top: top - POINT_HALF_BOX,
    width: POINT_HALF_BOX * 2,
    height: POINT_HALF_BOX * 2,
  };
}

/**
 * Where a bar starts: at zero, or at the edge of the plot nearest zero when
 * the y scale does not reach it -- which is where uPlot fills a bar to.
 */
function barBase(u: UPlotInstance, source: UPlotLayerSource): number {
  const scale = u.scales[source.yScale];
  const min = finite(scale?.min) ? scale.min : 0;
  const max = finite(scale?.max) ? scale.max : 0;
  return Math.min(Math.max(0, min), max);
}

function barBox(u: UPlotInstance, source: UPlotLayerSource, k: number, x: number, y: number): OverlayBox {
  const tip = toPlot(u, source, x, y);
  const base = toPlot(u, source, x, barBase(u, source));
  const width = columnWidth(u, source, k) * BAR_WIDTH_SHARE;
  if (u.scales[source.xScale]?.ori === 1) {
    return {
      left: Math.min(tip.left, base.left),
      top: tip.top - width / 2,
      width: Math.abs(tip.left - base.left),
      height: width,
    };
  }
  return {
    left: tip.left - width / 2,
    top: Math.min(tip.top, base.top),
    width,
    height: Math.abs(tip.top - base.top),
  };
}

/**
 * The boxes to draw for a navigation position, and where uPlot's cursor
 * should go.
 */
function resolveHighlight(
  u: UPlotInstance,
  sources: ReadonlyMap<string, UPlotLayerSource>,
  event: NavEvent,
): { boxes: OverlayBox[]; cursor: { left: number; top: number } | null } {
  const source = sources.get(event.layerId);
  if (!source) {
    return { boxes: [], cursor: null };
  }

  // A point cloud names its selection by data index; see NavigateCallback.
  if (source.kind === 'scatter') {
    const seriesIdx = source.seriesIdxs[0];
    const indices = event.pointIndices ?? [];
    const boxes: OverlayBox[] = [];
    let cursor: { left: number; top: number } | null = null;
    for (const index of indices) {
      const k = source.sourceIdxs[0]?.[index];
      const point = k === undefined ? null : rawPoint(u, source, seriesIdx, k);
      if (point === null) {
        continue;
      }
      const at = toPlot(u, source, point[0], point[1]);
      boxes.push(boxAround(at.left, at.top));
      cursor ??= at;
    }
    return { boxes, cursor };
  }

  const seriesIdx = source.seriesIdxs[event.row];
  const k = source.sourceIdxs[event.row]?.[event.col];
  if (seriesIdx === undefined || k === undefined) {
    return { boxes: [], cursor: null };
  }
  const point = rawPoint(u, source, seriesIdx, k);
  if (point === null) {
    // A gap in a line: nothing is drawn there, but the cursor still marks x.
    const x = xPosition(u, source.xScale, k);
    if (x === null) {
      return { boxes: [], cursor: null };
    }
    const at = toPlot(u, source, x, 0);
    return { boxes: [], cursor: u.scales[source.xScale]?.ori === 1 ? { left: -10, top: at.top } : { left: at.left, top: -10 } };
  }
  const at = toPlot(u, source, point[0], point[1]);
  const box = source.kind === 'bar'
    ? barBox(u, source, k, point[0], point[1])
    : boxAround(at.left, at.top);
  return { boxes: [box], cursor: at };
}

/**
 * The mark under uPlot's cursor, as a MAIDR position, for a click on the
 * chart: of the points at the cursor's data index -- one per series -- the
 * one drawn nearest the click. uPlot only says which series is nearest when
 * its cursor focus is switched on, which it is not by default.
 *
 * @returns The target, or `null` when no layer reads a mark there
 */
function targetAtCursor(u: UPlotInstance, sources: ReadonlyMap<string, UPlotLayerSource>): NavigationTarget | null {
  const cursor = u.cursor;
  const left = cursor?.left;
  const top = cursor?.top;
  if (!cursor || !finite(left) || !finite(top) || left < 0 || top < 0) {
    return null;
  }
  const faceted = (u.mode ?? 1) === 2;
  let best: { target: NavigationTarget; distance: number } | null = null;
  for (const [layerId, source] of sources) {
    for (let row = 0; row < source.seriesIdxs.length; row++) {
      const seriesIdx = source.seriesIdxs[row];
      const k = faceted ? cursor.idxs?.[seriesIdx] : cursor.idx;
      if (typeof k !== 'number') {
        continue;
      }
      const col = source.sourceIdxs[row]?.indexOf(k) ?? -1;
      const point = col < 0 ? null : rawPoint(u, source, seriesIdx, k);
      if (point === null) {
        continue;
      }
      const at = toPlot(u, source, point[0], point[1]);
      const distance = Math.hypot(at.left - left, at.top - top);
      if (best === null || distance < best.distance) {
        best = {
          target: source.kind === 'scatter' ? { layerId, pointIndex: col } : { layerId, row, col },
          distance,
        };
      }
    }
  }
  return best?.target ?? null;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

type HookName = 'ready' | 'setData' | 'draw' | 'setSize' | 'destroy';

/** Adds a hook to a live instance, returning a function that removes it. */
function addHook(u: UPlotInstance, name: HookName, fn: (u: UPlotInstance) => void): () => void {
  const hooks = (u as unknown as { hooks?: Record<string, unknown> }).hooks;
  if (!hooks) {
    return () => {};
  }
  const existing = hooks[name];
  const list: unknown[] = Array.isArray(existing) ? [...existing] : typeof existing === 'function' ? [existing] : [];
  list.push(fn);
  hooks[name] = list;
  return () => {
    const current = hooks[name];
    if (Array.isArray(current)) {
      hooks[name] = current.filter(entry => entry !== fn);
    }
  };
}

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

/**
 * Makes a uPlot chart accessible with MAIDR.
 *
 * uPlot draws for the first time in a microtask after `new uPlot(...)`
 * returns, and what each series draws is only known once it has, so a chart
 * that has not drawn yet is bound when it does (its `ready` hook). Register
 * {@link maidrPlugin} instead to have this called for you.
 *
 * @param u - The uPlot instance
 * @param options - Adapter options
 * @returns A handle to refresh or dispose the binding
 * @throws Error when the chart has drawn but is not in the document
 */
export function bindUPlot(u: UPlotInstance, options: MaidrUPlotOptions = {}): MaidrUPlotHandle {
  const existing = bindings.get(u);
  if (existing) {
    return existing;
  }
  const id = options.id ?? (u.root.id ? `maidr-uplot-${u.root.id}` : `maidr-uplot-${nextId++}`);
  if (u.status === 1) {
    return bindNow(u, id, options);
  }

  let bound: MaidrUPlotHandle | null = null;
  let cancelled = false;
  const removeReady = addHook(u, 'ready', () => {
    removeReady();
    bindings.delete(u);
    if (cancelled) {
      return;
    }
    try {
      bound = bindNow(u, id, options);
    } catch (error) {
      console.warn(`[maidr/uplot] Skipping chart. ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const pending: MaidrUPlotHandle = {
    id,
    refresh: () => bound?.refresh(),
    dispose: () => {
      cancelled = true;
      removeReady();
      bindings.delete(u);
      bound?.dispose();
    },
  };
  bindings.set(u, pending);
  return pending;
}

function bindNow(u: UPlotInstance, id: string, options: MaidrUPlotOptions): MaidrUPlotHandle {
  const parent = u.root.parentElement;
  if (!parent) {
    throw new Error('the uPlot chart must be in the document before MAIDR can bind to it');
  }

  let extraction = extractUPlotData(u, id, options);
  let layers: MaidrLayer[] = extraction.maidr.subplots.flat().flatMap(subplot => subplot.layers);
  let lastActive: NavEvent | null = null;
  let overlay: UPlotHighlightOverlay | null = null;
  let disposed = false;

  const highlight = (): void => {
    if (overlay === null) {
      return;
    }
    if (lastActive === null) {
      overlay.clear();
      return;
    }
    try {
      const { boxes, cursor } = resolveHighlight(u, extraction.sources, lastActive);
      overlay.show(boxes);
      // Nothing to point at -- an empty selection -- releases uPlot's cursor
      // rather than leaving it on the last mark.
      u.setCursor?.(cursor ?? { left: -10, top: -10 });
    } catch (error) {
      console.warn('[maidr/uplot] Could not draw the highlight:', error);
    }
  };

  const onNavigate: NavigateCallback = (event) => {
    lastActive = event;
    if (event === null) {
      overlay?.clear();
      // A negative position is how uPlot hides its cursor.
      u.setCursor?.({ left: -10, top: -10 });
      return;
    }
    // A position the model has but the layer no longer does -- right after an
    // update shortened it -- draws nothing rather than a stale mark.
    if (!layers.some(layer => layer.id === event.layerId)) {
      overlay?.clear();
      return;
    }
    highlight();
  };

  const withCallback = (maidr: MaidrData): MaidrData => ({ ...maidr, onNavigate });

  // Mount MAIDR around the chart's root, where it stood.
  const container = document.createElement('div');
  container.style.display = 'contents';
  container.setAttribute('data-maidr-uplot', id);
  parent.insertBefore(container, u.root);

  const handleMount = (): void => {
    if (overlay === null && !disposed) {
      // The page's color, else the reader's own from MAIDR's settings, as the
      // other canvas adapters do.
      overlay = new UPlotHighlightOverlay(u.over, () => options.highlightColor ?? getHighlightColor());
    }
    // uPlot caches the plot's page rectangle to place its cursor; the root
    // has just moved.
    (u as unknown as { syncRect?: (defer?: boolean) => void }).syncRect?.(true);
  };

  const root: Root = createRoot(container, { identifierPrefix: id });
  root.render(
    <MaidrComponent data={withCallback(extraction.maidr)}>
      <ChartHost node={u.root} onMount={handleMount} />
    </MaidrComponent>,
  );

  /**
   * Moves the remembered position along with a sliding window: the model
   * keeps the reader on the same datum, one column further left for every
   * point dropped from the front of their row, but reports nothing, so the
   * highlight would otherwise land on whichever point took the old column.
   */
  const slide = (trims: ReadonlyMap<string, readonly number[]>): void => {
    const active = lastActive;
    const trim = active === null ? undefined : trims.get(active.layerId);
    if (active === null || trim === undefined) {
      return;
    }
    if (active.pointIndices !== undefined) {
      const shift = trim[0] ?? 0;
      const kept = active.pointIndices.map(index => index - shift).filter(index => index >= 0);
      lastActive = kept.length > 0 ? { ...active, pointIndices: kept } : null;
      return;
    }
    const col = active.col - (trim[active.row] ?? 0);
    lastActive = col >= 0 ? { ...active, col } : null;
  };

  const refresh = (): void => {
    if (disposed) {
      return;
    }
    let next;
    try {
      next = extractUPlotData(u, id, options);
    } catch (error) {
      console.warn(`[maidr/uplot] Could not read the updated chart; keeping the previous reading. ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    extraction = next;
    layers = next.maidr.subplots.flat().flatMap(subplot => subplot.layers);
    const figure = withCallback(next.maidr);
    if (liveDataManager.getData(id) === undefined) {
      // Not registered yet (the tree has not committed): hand React the data.
      root.render(
        <MaidrComponent data={figure}>
          <ChartHost node={u.root} onMount={handleMount} />
        </MaidrComponent>,
      );
    } else {
      slide(pushUpdate(figure).trims);
    }
    highlight();
  };

  // uPlot resets every series' path cache in `setData` and rebuilds it on the
  // draw that follows, and the series kinds are read off that cache -- so the
  // figure is re-read on the draw, not on `setData` itself.
  let dataChanged = false;
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const target = targetAtCursor(u, extraction.sources);
    if (target !== null) {
      liveDataManager.navigateTo(target, { id });
    }
  };
  u.over.addEventListener('click', onClick);

  // The highlight and uPlot's cursor follow the reader only while they are in
  // the chart. MAIDR reports nothing when focus leaves, so without this every
  // later tick and resize would pull a sighted user's hover cursor back to
  // the point the reader left.
  let focusTimer: ReturnType<typeof setTimeout> | null = null;
  const onFocusOut = (): void => {
    if (focusTimer !== null) {
      clearTimeout(focusTimer);
    }
    // Deferred: focus moving within the figure passes through the body.
    focusTimer = setTimeout(() => {
      focusTimer = null;
      if (!container.contains(document.activeElement)) {
        lastActive = null;
        overlay?.clear();
      }
    }, 0);
  };
  container.addEventListener('focusout', onFocusOut);

  const removers = [
    addHook(u, 'setData', () => {
      dataChanged = true;
    }),
    // Every draw, not just a data change: a zoom or any other scale change
    // moves every mark, and the highlight with it.
    addHook(u, 'draw', () => {
      if (dataChanged) {
        dataChanged = false;
        refresh();
      } else {
        highlight();
      }
    }),
    addHook(u, 'setSize', () => {
      overlay?.syncRegions();
      highlight();
    }),
    // uPlot has already taken its root out of the page by now.
    addHook(u, 'destroy', () => {
      dispose(false);
    }),
  ];

  function dispose(restore = true): void {
    if (disposed) {
      return;
    }
    disposed = true;
    removers.forEach(remove => remove());
    u.over.removeEventListener('click', onClick);
    container.removeEventListener('focusout', onFocusOut);
    if (focusTimer !== null) {
      clearTimeout(focusTimer);
    }
    overlay?.dispose();
    overlay = null;
    // Unmount first: the host's ref cleanup takes uPlot's root out of the
    // React tree, and it is then put back where it stood.
    const node = u.root;
    root.unmount();
    if (restore) {
      container.parentElement?.insertBefore(node, container);
    }
    container.remove();
    bindings.delete(u);
  }

  const handle: MaidrUPlotHandle = { id, refresh, dispose: () => dispose() };
  bindings.set(u, handle);
  return handle;
}

/**
 * A uPlot plugin that binds each chart it is given to MAIDR once the chart is
 * ready.
 *
 * @param options - Adapter options, shared by every chart the plugin is used on
 *   (so leave `id` unset when it is)
 * @returns The plugin, for uPlot's `plugins` option
 */
export function maidrPlugin(options: MaidrUPlotOptions = {}): UPlotPlugin {
  return {
    hooks: {
      ready: (u: UPlotInstance) => {
        if (options.enabled === false) {
          return;
        }
        try {
          bindUPlot(u, options);
        } catch (error) {
          console.warn(`[maidr/uplot] Skipping chart. ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
  };
}
