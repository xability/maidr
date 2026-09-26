/**
 * Keeps a MAIDR instance bound to a live ApexCharts chart.
 *
 * MAIDR resolves a layer's selectors when the layer is built, and ApexCharts
 * re-creates every node of the chart on a resize, an
 * `updateSeries`/`updateOptions` call or a legend toggle. A binding made once
 * would therefore keep reading the old values and highlight nodes that are no
 * longer in the page. So the binding follows ApexCharts' `updated` event and
 * converts the chart again each time it has settled.
 *
 * The first binding goes through the `maidr:bindchart` event: the page
 * script (`maidr.js`) reads the element's `maidr-data` attribute and mounts
 * MAIDR on it. Every later one goes through `window.maidrLive.setData`, the
 * core's in-place update, which swaps the chart's data without re-mounting
 * it. Re-mounting would tear down the element the reader's focus is on, and
 * a keyboard user inside the chart would be thrown out of it on every redraw.
 * The bound data is marked `live: true`, which is what makes the core apply
 * the new data while the reader is inside the chart, keeping their place,
 * rather than on their next visit.
 */

import type { Maidr } from '../../type/grammar';
import type { ApexChartsAdapterOptions, ApexChartsBinding, ApexChartsInstance } from './types';
import { apexchartsToMaidr } from './adapter';

/** How long the drawn geometry must stay still before it is read, in ms. */
const QUIET_MS = 120;

/** How often the chart's drawing state is polled, in ms. */
const POLL_MS = 50;

/** Attributes whose changes mean ApexCharts is still moving the geometry. */
const GEOMETRY_ATTRIBUTES = ['d', 'x', 'y', 'cx', 'cy', 'width', 'height', 'transform'];

/**
 * How long to wait for an animation before reading the chart anyway.
 *
 * Mirrors ApexCharts' own bound for the same question: its `animationEnded`
 * flag flips at roughly twice the configured speed, so the deadline is that
 * plus a second, clamped so neither a tiny nor a huge speed makes it useless.
 *
 * @param chart - The chart
 * @returns The deadline, in ms
 */
function animationBudget(chart: ApexChartsInstance): number {
  const animations = chart.w.config.chart.animations;
  const speed = animations?.speed ?? 800;
  const dynamic = animations?.dynamicAnimation?.enabled === false ? 0 : (animations?.dynamicAnimation?.speed ?? 350);
  return Math.min(Math.max(1000 + speed * 2 + dynamic, 1500), 15000);
}

/**
 * The chart's wrapper, when it has been drawn and is still alive.
 *
 * @param chart - The chart
 * @returns The wrapper, or null
 */
function drawnWrapper(chart: ApexChartsInstance): Element | null {
  if (chart.w.globals.isDestroyed) {
    return null;
  }
  const wrap = chart.el.querySelector('.apexcharts-canvas');
  return wrap && wrap.querySelector('svg') ? wrap : null;
}

/**
 * Waits until the chart's DOM is final: drawn, its animation over, and its
 * geometry unchanged for a moment.
 *
 * The quiet period is what covers an update: ApexCharts morphs the new
 * paths from the old ones after an update, and does not always lower
 * `animationEnded` while it does. The deadline caps the whole wait: once it
 * has passed, a drawn chart is taken as it is, animating or not.
 *
 * @param chart     - The chart
 * @param deadline  - When to stop waiting, as a `Date.now()` time
 * @param cancelled - Asked before each step; true stops the wait
 * @returns `'final'` once the chart is final, `'undrawn'` when it was still
 *   not drawn at the deadline, and `'cancelled'` when the wait was cancelled
 */
function whenSettled(
  chart: ApexChartsInstance,
  deadline: number,
  cancelled: () => boolean,
): Promise<'final' | 'undrawn' | 'cancelled'> {
  return new Promise((resolve) => {
    const waitForQuiet = (wrap: Element): void => {
      if (typeof MutationObserver === 'undefined') {
        resolve('final');
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let observer: MutationObserver | undefined;
      // (Re)starts the quiet period; the deadline caps it.
      const arm = (): void => {
        clearTimeout(timer);
        const wait = Math.max(0, Math.min(QUIET_MS, deadline - Date.now()));
        timer = setTimeout(() => {
          observer?.disconnect();
          resolve(cancelled() ? 'cancelled' : 'final');
        }, wait);
      };
      observer = new MutationObserver(arm);
      observer.observe(wrap, { attributes: true, subtree: true, attributeFilter: GEOMETRY_ATTRIBUTES });
      arm();
    };

    const poll = (): void => {
      if (cancelled()) {
        resolve('cancelled');
        return;
      }
      const wrap = drawnWrapper(chart);
      const late = Date.now() >= deadline;
      if (!wrap) {
        // Not drawn yet: the `mounted` event will ask again.
        if (late) {
          resolve('undrawn');
        } else {
          setTimeout(poll, POLL_MS);
        }
        return;
      }
      const animated = chart.w.config.chart.animations?.enabled !== false;
      if (animated && chart.w.globals.animationEnded === false && !late) {
        setTimeout(poll, POLL_MS);
        return;
      }
      waitForQuiet(wrap);
    };

    poll();
  });
}

/**
 * Waits until an element is back in the document.
 *
 * Mounting MAIDR takes the chart's container out of the page and puts it
 * back inside MAIDR's own wrapper once React has rendered. ApexCharts treats
 * a detached container as a chart with nothing to draw, so a caller that
 * updates the chart the moment `ready` resolves would wipe it.
 *
 * @param element - The chart's container
 * @returns Resolves once the element is connected, or after two seconds
 */
function whenConnected(element: Element): Promise<void> {
  const deadline = Date.now() + 2000;
  return new Promise((resolve) => {
    const check = (): void => {
      if (element.isConnected || Date.now() >= deadline) {
        resolve();
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

/**
 * The part of the page script's `window.maidrLive` API the binding uses.
 */
interface MaidrLiveApi {
  setData?: (maidr: Maidr) => boolean;
}

/**
 * Whether MAIDR is mounted on the chart's container with a figure of this id,
 * so its data can be replaced in place.
 *
 * @param element - The chart's container
 * @param id      - The MAIDR figure id
 * @returns True when the container sits inside that figure
 */
function isMounted(element: Element, id: string): boolean {
  const figure = element.ownerDocument.getElementById(`maidr-figure-${id}`);
  return figure !== null && figure.contains(element);
}

/**
 * Replaces the data of the MAIDR instance mounted on the chart, in place.
 *
 * @param element - The chart's container
 * @param maidr   - The new data; its id names the instance
 * @returns True when the mounted instance took the data
 */
function updateInPlace(element: Element, maidr: Maidr): boolean {
  if (!isMounted(element, maidr.id)) {
    return false;
  }
  const live = (globalThis as { maidrLive?: MaidrLiveApi }).maidrLive;
  return typeof live?.setData === 'function' && live.setData(maidr);
}

/**
 * Whether the chart takes its width from its container — a percentage
 * width, ApexCharts' default of `'100%'` included — rather than a fixed one.
 *
 * @param chart - The chart
 * @returns True for a percentage width
 */
function isFluid(chart: ApexChartsInstance): boolean {
  const width = chart.w.config.chart.width;
  return width === undefined || (typeof width === 'string' && width.trim().endsWith('%'));
}

/**
 * The width the page gave the chart's container, as a share of the space it
 * sits in: 1 for `auto`, the fraction for a percentage, and null for any
 * other width, which does not follow the page.
 *
 * Read from the inline style, then from the computed value where the
 * browser exposes it unresolved (`computedStyleMap`); a browser without it
 * is taken to have left the width `auto`.
 *
 * @param element - The chart's container
 * @returns The share, or null
 */
function widthShare(element: HTMLElement): number | null {
  const styleMap = (element as { computedStyleMap?: () => { get: (property: string) => unknown } }).computedStyleMap;
  const specified = element.style.width || String(styleMap?.call(element).get('width') ?? 'auto');
  if (specified === 'auto') {
    return 1;
  }
  const percent = /^([\d.]+)%$/.exec(specified.trim());
  return percent ? Number(percent[1]) / 100 : null;
}

/**
 * Keeps the chart's container as wide as the space MAIDR's figure has for it.
 *
 * MAIDR wraps the container in a tab stop sized to fit its content, so once
 * it is mounted the container's width comes from the chart drawn inside it.
 * ApexCharts sizes a chart from its container, so the two would hold each
 * other still: the chart would stop following the page's width, and a chart
 * redrawn while it is momentarily empty (a pie after `updateSeries`) would
 * shrink to ApexCharts' 300-pixel fallback. The figure is a block the page
 * lays out, so its width is a definite one to hand the container — all of
 * it for a container left at `auto`, its share for a percentage width. The
 * container's own `max-width` still applies on top of it, and a container
 * with a fixed width is left alone.
 *
 * Setting the width does not by itself make ApexCharts redraw: it watches
 * the element that was the container's parent when the chart was rendered,
 * and MAIDR has since moved the container out of it. So `resized` is called
 * after each fit, to tell the chart what its own observer would have.
 *
 * @param element - The chart's container
 * @param figure  - MAIDR's figure element around it
 * @param resized - Called after each fit
 * @returns A function that stops following and puts the width back
 */
function followFigureWidth(element: HTMLElement, figure: Element, resized: () => void): () => void {
  const share = widthShare(element);
  if (share === null || typeof ResizeObserver === 'undefined') {
    return () => {};
  }
  const previous = element.style.width;
  const fit = (): void => {
    const style = getComputedStyle(element);
    const px = (value: string): number => Number.parseFloat(value) || 0;
    let chrome = px(style.marginLeft) + px(style.marginRight);
    if (style.boxSizing !== 'border-box') {
      chrome += px(style.paddingLeft) + px(style.paddingRight)
        + px(style.borderLeftWidth) + px(style.borderRightWidth);
    }
    const width = Math.max(0, figure.clientWidth * share - chrome);
    if (width > 0) {
      element.style.width = `${width}px`;
      resized();
    }
  };
  const observer = new ResizeObserver(fit);
  observer.observe(figure);
  fit();
  return () => {
    observer.disconnect();
    element.style.width = previous;
  };
}

/**
 * Binds MAIDR to an ApexCharts chart and keeps it bound.
 *
 * Waits until the chart has finished drawing — `render()` resolved and the
 * entry animation over, or at once with animations disabled — converts it
 * with {@link apexchartsToMaidr}, writes the result to the `maidr-data`
 * attribute of the chart's container (`chart.el`) and dispatches
 * `maidr:bindchart`, which `maidr.js` answers by mounting MAIDR on the
 * container. Whenever ApexCharts redraws the chart afterwards — a resize,
 * `updateSeries`, `updateOptions`, a legend toggle — it converts the chart
 * again and hands the result to the mounted instance through
 * `window.maidrLive.setData`, so the highlight keeps following the chart and
 * a reader inside it keeps their focus and their place.
 *
 * The data is bound with `live: true`, which is what lets MAIDR apply a
 * redraw while the reader is in the chart. It also makes MAIDR's monitor
 * mode (M) available, although a redraw replaces the data rather than
 * appending to it, so monitor mode has nothing to announce.
 *
 * While MAIDR is mounted, a chart with a percentage width (ApexCharts'
 * default) whose container is `auto` or percentage wide has the container's
 * `width` set in pixels from the space MAIDR's figure gives it, and kept
 * there as the page resizes: MAIDR's tab stop is sized to its content, which
 * would otherwise hold the chart at the width it was first drawn at.
 * `dispose()` puts the container's width back.
 *
 * Call it right after `chart.render()`; it does not need `render()` to have
 * resolved. `maidr.js` must be on the page for the chart to become
 * interactive; without it, `ready` still resolves with the data.
 *
 * @param chart   - An ApexCharts instance, rendered or about to be
 * @param options - Overrides for the id, titles and axis labels
 * @returns The binding: `ready` resolves with the first MAIDR data bound,
 *   and `dispose()` stops following the chart
 *
 * @example
 * ```ts
 * const chart = new ApexCharts(el, {
 *   chart: { type: 'line', accessibility: { enabled: false } },
 *   series: [{ name: 'Sales', data: [3, 5, 4] }],
 *   xaxis: { categories: ['Jan', 'Feb', 'Mar'] },
 * });
 * chart.render();
 * const binding = maidrApexCharts.bindApexCharts(chart, { title: 'Sales' });
 * ```
 */
export function bindApexCharts(
  chart: ApexChartsInstance,
  options: ApexChartsAdapterOptions = {},
): ApexChartsBinding {
  let disposed = false;
  let generation = 0;
  // When the oldest redraw not yet bound was asked for, or null when none is
  // waiting; see `schedule`.
  let pendingSince: number | null = null;
  let settled = false;
  let warnedUndrawn = false;
  let stopFollowing: (() => void) | null = null;
  let resolveReady: (maidr: Maidr) => void = () => {};
  let rejectReady: (reason: unknown) => void = () => {};
  const ready = new Promise<Maidr>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // A page that never awaits `ready` must not see an unhandled rejection;
  // the failure is logged below either way.
  ready.catch(() => {});

  // Hands ApexCharts the container's new width. Its handler compares the
  // container with the size the chart was last drawn at, so a fit that
  // changed nothing costs nothing, and it waits out a running animation.
  const redrawIfResized = (): void => {
    if (!disposed && !chart.w.globals.isDestroyed) {
      chart.parentResizeHandler?.();
    }
  };

  // Starts keeping the container's width in step with MAIDR's figure, once.
  const follow = (id: string): void => {
    if (disposed || stopFollowing || !isFluid(chart) || !(chart.el instanceof HTMLElement)) {
      return;
    }
    const figure = chart.el.ownerDocument.getElementById(`maidr-figure-${id}`);
    if (figure && figure.contains(chart.el)) {
      stopFollowing = followFigureWidth(chart.el, figure, redrawIfResized);
    }
  };

  const bind = (): void => {
    try {
      const maidr: Maidr = { ...apexchartsToMaidr(chart, options), live: true };
      chart.el.setAttribute('maidr-data', JSON.stringify(maidr));
      if (!updateInPlace(chart.el, maidr)) {
        // Mounting builds a new figure, so the width follows that one.
        stopFollowing?.();
        stopFollowing = null;
        chart.el.dispatchEvent(new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }));
      }
      const first = !settled;
      settled = true;
      void whenConnected(chart.el).then(() => {
        follow(maidr.id);
        if (first) {
          resolveReady(maidr);
        }
      });
    } catch (error) {
      console.error('[maidr/apexcharts] Could not bind the chart:', error);
      if (!settled) {
        settled = true;
        rejectReady(error);
      }
    }
  };

  // Each request supersedes the ones before it, so a burst of updates binds
  // once, after the last. But a request inherits the deadline of the oldest
  // one still waiting rather than starting its own: a chart that streams,
  // updating again before its update animation ends (ApexCharts' realtime
  // demo does, every second), would otherwise push the binding back forever
  // and leave MAIDR reading the first data it was given. So during a stream
  // the chart is bound at least once per animation budget, as it stands.
  const schedule = (): void => {
    generation += 1;
    const token = generation;
    const cancelled = (): boolean => disposed || token !== generation;
    pendingSince ??= Date.now();
    void whenSettled(chart, pendingSince + animationBudget(chart), cancelled).then((outcome) => {
      if (cancelled()) {
        return;
      }
      // Answered, one way or the other: the next request starts afresh. A
      // chart rendered after an `undrawn` wait gets its whole entry
      // animation's worth of time again.
      pendingSince = null;
      if (outcome === 'final') {
        bind();
      } else if (outcome === 'undrawn' && !settled && !warnedUndrawn) {
        // `ready` stays pending: the `mounted` event still binds the chart
        // if it is rendered later.
        warnedUndrawn = true;
        console.warn('[maidr/apexcharts] The chart has not been drawn, so MAIDR has not been bound to it. '
          + 'Call chart.render(); the binding takes the chart once it is drawn.');
      }
    });
  };

  // The first draw starts its own deadline, whatever was asked before it: a
  // chart rendered a while after it was bound still gets its whole entry
  // animation.
  const onMounted = (): void => {
    pendingSince = null;
    schedule();
  };
  const onRedraw = (): void => schedule();
  chart.addEventListener?.('mounted', onMounted);
  chart.addEventListener?.('updated', onRedraw);
  schedule();

  return {
    ready,
    dispose: (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      generation += 1;
      if (!settled) {
        settled = true;
        rejectReady(new Error('[maidr/apexcharts] The binding was disposed before the chart was bound.'));
      }
      chart.removeEventListener?.('mounted', onMounted);
      chart.removeEventListener?.('updated', onRedraw);
      stopFollowing?.();
      stopFollowing = null;
    },
  };
}
