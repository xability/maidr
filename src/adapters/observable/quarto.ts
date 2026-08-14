/**
 * Binding and Quarto auto-detection for the Observable Plot adapter.
 *
 * A Quarto document's charts are drawn by the OJS runtime, from code cells the
 * author wrote for a browser and not for this adapter. Nothing calls a binder,
 * because there is nothing in an `{ojs}` cell to call it from — the cell's
 * value *is* the chart, and Quarto inserts it into the page for you.
 *
 * So the adapter watches instead. {@link initQuartoObservable} observes the
 * document, recognises an Observable Plot chart when one appears, converts it,
 * and hands the schema to MAIDR's runtime. An author adds the script and their
 * existing plots become navigable; nothing in the cell changes.
 *
 * Watching also handles the part of OJS that a one-shot scan could not:
 * reactivity. A cell that depends on a `viewof` input re-runs on every change
 * and replaces its output node wholesale, so charts appear long after load,
 * repeatedly, and the observer catches each new one.
 *
 * @packageDocumentation
 */

import type {
  ObservablePlotOptions,
  ObservablePlotResult,
  QuartoObservableOptions,
} from './types';
import { observablePlotToMaidr } from './converters';
import { isObservablePlot, resolveSvg } from './introspect';

/** Prefix for this adapter's console warnings. */
const LOG_PREFIX = '[maidr/observable]';

/**
 * Charts already bound, so a re-scan does not bind one twice.
 *
 * A `WeakSet` rather than an attribute because the guard has to survive the
 * chart being moved in the DOM and disappear with it when OJS drops the node.
 */
const bound = new WeakSet<Element>();

/**
 * Converts a rendered Observable Plot chart and hands it to MAIDR.
 *
 * Writes the schema to the chart's `<svg>` as a `maidr-data` attribute and
 * fires `maidr:bindchart`, which is how MAIDR's runtime picks up a chart bound
 * after its initial scan. Call it after `Plot.plot()` has returned — the
 * element has to be in the document, and drawn, before it can be read.
 *
 * @param element - The element `Plot.plot()` returned, or any element of it.
 * @param options - Overrides for what the rendered chart cannot say.
 * @returns The schema and the element it was written to, or `null` when the
 *          chart holds no mark this adapter reads.
 *
 * @example
 * ```js
 * const chart = Plot.plot({ marks: [Plot.barY(data, { x: 'day', y: 'count' })] });
 * document.querySelector('#chart').append(chart);
 * maidrObservable.bindObservablePlot(chart);
 * ```
 */
export function bindObservablePlot(
  element: Element,
  options: ObservablePlotOptions = {},
): ObservablePlotResult | null {
  const svg = resolveSvg(element);
  if (!svg) {
    console.warn(`${LOG_PREFIX} no <svg> found on the element passed to bindObservablePlot.`);
    return null;
  }

  const maidr = observablePlotToMaidr(element, options);
  if (!maidr)
    return null;

  const result: ObservablePlotResult = {
    maidr,
    layers: maidr.subplots.flat().flatMap(subplot => subplot.layers),
    element: svg,
  };

  if (options.autoApply === false)
    return result;

  bound.add(svg);
  svg.setAttribute('maidr-data', JSON.stringify(maidr));
  svg.dispatchEvent(new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }));
  return result;
}

/**
 * Watches a document for Observable Plot charts and binds each one.
 *
 * This is what makes a Quarto document work without touching its cells. It
 * binds everything already on the page, then keeps watching: OJS fills its
 * cells asynchronously and re-fills them whenever a reactive input changes, so
 * charts arrive after load and arrive again on every interaction.
 *
 * Safe to call more than once — a chart already bound is skipped.
 *
 * @param options - What to watch, and what to pass to each bind.
 * @returns A function that stops watching. Charts already bound stay bound.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
 * <!-- every {ojs} cell that draws with Plot is now navigable -->
 * ```
 */
export function initQuartoObservable(options: QuartoObservableOptions = {}): () => void {
  const root = options.root ?? document.body;
  if (!root)
    return () => {};

  let scheduled = false;
  const scan = (): void => {
    scheduled = false;
    for (const candidate of findUnboundPlots(root))
      bindOne(candidate, options);
  };

  // Coalesce the bursts of mutations one cell's render produces into a single
  // pass, so a document of twenty cells scans once rather than twenty times.
  const schedule = (): void => {
    if (scheduled)
      return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(scan);
    else
      setTimeout(scan, 0);
  };

  scan();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        schedule();
        return;
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => observer.disconnect();
}

/**
 * Binds the adapter as soon as the document is ready, unless opted out.
 *
 * The script tag is the whole integration — a Quarto author adds it in the
 * header and writes no JavaScript — so loading the bundle has to be enough to
 * start watching. Set `window.maidrObservableAutoInit = false` before the
 * script loads to keep the exported functions and skip the observer.
 *
 * @returns A function that stops watching, or `null` when auto-init is off.
 */
export function autoInitQuartoObservable(): (() => void) | null {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return null;
  if ((window as Window & { maidrObservableAutoInit?: boolean }).maidrObservableAutoInit === false)
    return null;

  if (document.readyState === 'loading') {
    let stop: (() => void) | null = null;
    document.addEventListener('DOMContentLoaded', () => {
      stop = initQuartoObservable();
    }, { once: true });
    return () => stop?.();
  }

  return initQuartoObservable();
}

/**
 * Finds every Plot chart under a root that is not bound yet.
 *
 * @param root - The subtree to search.
 * @returns The charts' `<svg>` elements.
 */
function findUnboundPlots(root: ParentNode): Element[] {
  const found: Element[] = [];
  for (const svg of Array.from(root.querySelectorAll('svg'))) {
    if (bound.has(svg) || svg.hasAttribute('maidr-data'))
      continue;
    if (isObservablePlot(svg))
      found.push(svg);
  }
  return found;
}

/**
 * Binds one chart, reporting rather than throwing when it cannot be read.
 *
 * A chart that fails to convert must not take the page's other charts with it,
 * and must not be retried on every subsequent mutation, so a failure marks the
 * element bound either way.
 *
 * @param svg     - The chart's `<svg>`.
 * @param options - The observer's options.
 */
function bindOne(svg: Element, options: QuartoObservableOptions): void {
  try {
    const result = bindObservablePlot(svg, options.plot ?? {});
    if (result)
      options.onBind?.(result);
    else
      bound.add(svg);
  } catch (error) {
    bound.add(svg);
    if (options.onError)
      options.onError(error, svg);
    else
      console.warn(`${LOG_PREFIX} failed to bind a plot:`, error);
  }
}
