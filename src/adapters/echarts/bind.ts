/**
 * Keeping a MAIDR reading bound to an ECharts chart for as long as it lives.
 *
 * `createMaidrFromEChart` reads a chart once. A chart in a BI tool does not
 * stay as it was read: Apache Superset and Metabase both call `setOption`
 * again whenever a filter or a refresh changes the data, and `resize`
 * whenever a dashboard is laid out again, and each of them disposes the chart
 * when its tile is removed (#1304). A reading taken once is out of date after
 * the first of those, and one nobody tears down outlives its chart.
 *
 * Measured on echarts 6.1.0, the one signal every one of those ends in is the
 * instance's `finished` event -- and it is not specific to them: it fires
 * after *every* render, a mouse moving over the chart included. So the
 * reading is taken again only when what it is taken from has changed, which
 * is the chart's resolved option and its size; hovering changes neither.
 *
 * **What MAIDR is mounted on is ECharts' own element, not the host's.**
 * `initMaidrOnElement` moves the element it is given into a wrapper, and in
 * both tools the element passed to `echarts.init` is a `<div>` React renders
 * and will later remove from its parent -- a parent it would no longer be in.
 * ECharts draws into a `<div>` of its own inside that one, which React has
 * never seen, so that is the element that is bound.
 */

import type { Maidr } from '@type/grammar';
import type { EChartsAdapterOptions } from './converters';
import type { EChartsInstance } from './types';
import { createMaidrFromEChart } from './converters';

/**
 * An ECharts instance that can be kept bound.
 *
 * `on`, `off`, `getOption`, `getWidth`, `getHeight` and `getDom` are public
 * ECharts API, and all of them are present on an instance from `echarts`
 * and from `echarts/core` alike.
 */
export interface EChartsBindable extends EChartsInstance {
  /** Subscribes to one of the instance's events. */
  on: (event: string, handler: () => void) => void;
  /** Unsubscribes a handler {@link on} added. */
  off: (event: string, handler: () => void) => void;
  /** The option the chart was last drawn from, every default resolved. */
  getOption: () => unknown;
  /** The chart's width in CSS pixels. */
  getWidth: () => number;
  /** The chart's height in CSS pixels. */
  getHeight: () => number;
  /** The element passed to `echarts.init`. */
  getDom: () => HTMLElement;
}

/**
 * The part of the `echarts` module {@link bindAllECharts} needs.
 *
 * `echarts.getInstanceByDom` looks the instance up in a registry private to
 * the module that created it, so it has to be **the host's** copy of
 * ECharts: a second copy loaded beside it finds nothing.
 */
export interface EChartsLibrary {
  /** The instance drawn into an element, if there is one. */
  getInstanceByDom: (dom: HTMLElement) => EChartsBindable | undefined;
}

/** What ECharts writes on every element it was initialised on. */
const INSTANCE_ATTRIBUTE = '_echarts_instance_';

/**
 * Makes one ECharts chart accessible and keeps it so as the chart changes.
 *
 * Takes a reading now if the chart has drawn, and again after any later
 * render that changed its option or its size -- a new query result, a
 * filter, a dashboard resize. Nothing is re-read on a render that changed
 * neither, so a reader is not moved back to the start of the chart because
 * someone else's mouse crossed it.
 *
 * Call the returned function before disposing the chart, or when it should
 * no longer be read; it unsubscribes and tears the MAIDR instance down.
 *
 * @param chart   - The instance returned by `echarts.init`
 * @param options - Overrides for the figure's id and title
 * @returns A function that unbinds the chart
 */
export function bindEChart(
  chart: EChartsBindable,
  options: EChartsAdapterOptions = {},
): () => void {
  let drawnFrom: string | undefined;
  let target: HTMLElement | undefined;

  const read = (): void => {
    const next = drawingRoot(chart);
    const signature = signatureOf(chart);
    if (!next || (next === target && signature !== undefined && signature === drawnFrom)) {
      return;
    }

    let maidr: Maidr;
    try {
      maidr = createMaidrFromEChart(chart, next, options);
    } catch (error) {
      console.warn('[MAIDR] ECharts chart could not be read:', error);
      return;
    }

    if (target && target !== next) {
      unbindElement(target);
    }
    target = next;
    drawnFrom = signature;
    next.setAttribute('maidr-data', JSON.stringify(maidr));
    next.dispatchEvent(new CustomEvent('maidr:bindchart', { bubbles: true }));
  };

  chart.on('finished', read);
  read();

  return () => {
    chart.off('finished', read);
    if (target) {
      unbindElement(target);
      target = undefined;
    }
  };
}

/**
 * Makes every ECharts chart under a root accessible, including the ones drawn
 * after this is called.
 *
 * For a page that holds charts it did not create itself -- a Superset or
 * Metabase dashboard, where each tile creates its own. Each chart is found by
 * the attribute ECharts writes on the element it was initialised on, and
 * bound with {@link bindEChart}; one that is disposed or removed from the
 * page is unbound.
 *
 * @param echarts - The host page's own `echarts` (or `echarts/core`) module
 * @param root    - Where to look; the whole document by default
 * @returns A function that stops watching and unbinds every chart
 */
export function bindAllECharts(
  echarts: EChartsLibrary,
  root: ParentNode = document,
): () => void {
  const bound = new Map<HTMLElement, () => void>();

  const scan = (): void => {
    for (const [dom, unbind] of bound) {
      if (!dom.isConnected || !echarts.getInstanceByDom(dom)) {
        unbind();
        bound.delete(dom);
      }
    }
    root.querySelectorAll<HTMLElement>(`[${INSTANCE_ATTRIBUTE}]`).forEach((dom) => {
      const chart = bound.has(dom) ? undefined : echarts.getInstanceByDom(dom);
      if (chart) {
        bound.set(dom, bindEChart(chart));
      }
    });
  };

  // A dashboard adds and removes charts, and ECharts' SVG renderer rewrites
  // its own elements on every hover; one scan per frame is enough for both.
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) {
      return;
    }
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scan();
    });
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [INSTANCE_ATTRIBUTE],
  });
  scan();

  return () => {
    observer.disconnect();
    bound.forEach(unbind => unbind());
    bound.clear();
  };
}

/**
 * The element ECharts draws into, inside the one it was initialised on.
 *
 * Both renderers create it -- a positioned `<div>` holding the `<canvas>` or
 * the `<svg>` -- and keep it until the chart is disposed.
 *
 * @param chart - The chart
 * @returns The element, or `undefined` before the chart has drawn
 */
function drawingRoot(chart: EChartsBindable): HTMLElement | undefined {
  const drawn = chart.getDom().querySelector('canvas, svg');
  return drawn?.parentElement ?? undefined;
}

/**
 * What a reading is taken from, as one string.
 *
 * @param chart - The chart
 * @returns The option and the size, or `undefined` when the option cannot
 *   be written out -- in which case every render is read again
 */
function signatureOf(chart: EChartsBindable): string | undefined {
  try {
    return `${chart.getWidth()}x${chart.getHeight()} ${JSON.stringify(chart.getOption())}`;
  } catch {
    return undefined;
  }
}

/**
 * Tears down the MAIDR instance mounted on an element.
 *
 * @param element - The element a reading was bound on
 */
function unbindElement(element: HTMLElement): void {
  element.removeAttribute('maidr-data');
  document.dispatchEvent(new CustomEvent('maidr:unbindchart', { detail: element }));
}
