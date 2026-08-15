/**
 * Binding and Quarto auto-detection for the Observable Plot adapter.
 *
 * A Quarto document's charts are drawn by the OJS runtime, from code cells the
 * author wrote for a browser and not for this adapter. Nothing calls a binder,
 * because there is nothing in an `{ojs}` cell to call it from — the cell's
 * value *is* the chart, and Quarto inserts it into the page for you.
 *
 * So the adapter watches instead. {@link initObservablePlots} observes the
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
  ObservableWatchOptions,
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
 * SVGs that are not Plot charts, so a re-scan does not test them again.
 *
 * A page mutates for reasons that have nothing to do with charts, and every
 * mutation schedules a scan; without this, each one re-tests every icon and
 * illustration in the document.
 */
const notPlots = new WeakSet<Element>();

/**
 * Charts with a live MAIDR instance, so the ones the page discards can be
 * released.
 *
 * A discarded chart is not reclaimed on its own: the page holds no reference to
 * it while MAIDR's registries still do, so an OJS document — where a cell
 * re-runs and replaces its output on every input change — accumulates one whole
 * chart per frame.
 *
 * Held strongly and on purpose. A `WeakSet` cannot be walked, and walking is
 * the point: a chart is gone precisely when nothing else refers to it, which is
 * the moment a weak collection would stop being able to tell anyone.
 */
const tracked = new Set<Element>();

/**
 * Charts seen in the document since they were bound.
 *
 * Binding a chart *moves* it — the runtime replaces it with a wrapper and
 * adopts it into React's tree, which React commits on its own schedule — so
 * "not in the document" means one of two opposite things: discarded by the
 * page, or still being mounted. A chart that has been seen in the document
 * since it was bound has finished mounting, and its absence afterwards can only
 * be the first.
 */
const settled = new WeakSet<Element>();

/**
 * Charts the runtime took out of the page to mount, and has not put back.
 *
 * The only thing that makes a detached chart ambiguous is a mount in flight, so
 * this records whether there is one. The runtime mounts synchronously from the
 * `maidr:bindchart` dispatch and mounting *removes* the chart — it puts a
 * wrapper in the chart's place and adopts the chart a React commit later — so
 * whether the chart still has a parent when the dispatch returns says which of
 * the two a later parentless sweep is looking at.
 *
 * Without it, "parentless" is read as "mounting" for every chart, and a chart
 * the page threw away before it was ever seen settled would be waited on
 * forever. That is not the rare case it sounds like: `cell.innerHTML = …` is
 * how an OJS cell replaces its output, and it leaves the old chart parented to
 * nothing whenever Plot returned a bare `<svg>` rather than a `<figure>`.
 */
const mounting = new WeakSet<Element>();

/** The watcher the automatic start owns, so it can be stopped and not doubled. */
let autoWatcher: (() => void) | null = null;

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
  if (!maidr) {
    // Said out loud rather than left as a chart that simply never responds.
    // A mark this adapter cannot read is the usual reason — a heatmap, a box
    // plot, a mark drawn as paths — and an author who wanted the chart read
    // has no other way to find out which.
    console.warn(
      `${LOG_PREFIX} no mark on this chart could be read, so it was left `
      + 'unbound. See https://maidr.ai/observable.html for what is supported.',
      svg,
    );
    return null;
  }

  const result: ObservablePlotResult = {
    maidr,
    layers: maidr.subplots.flat().flatMap(subplot => subplot.layers),
    element: svg,
  };

  // Memoised either way. The watcher decides what to bind by asking what it has
  // not bound yet, so a chart converted with `autoApply: false` that is never
  // recorded is converted again on every mutation the page makes, forever.
  bound.add(svg);
  if (options.autoApply === false)
    return result;

  svg.setAttribute('maidr-data', JSON.stringify(maidr));
  // Dispatched on the element so it bubbles to the runtime's listener — which
  // needs the element to be in the document. A chart bound before it is
  // inserted would be announced to nobody, and would look bound.
  if (!svg.isConnected) {
    console.warn(
      `${LOG_PREFIX} the chart is not in the document yet; `
      + 'insert it before binding, or MAIDR will not pick it up.',
    );
  }
  svg.dispatchEvent(new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }));
  // Read after the dispatch, because the runtime answers it synchronously: a
  // chart with no parent now is one the mount has lifted out and will adopt on
  // its next commit. See {@link mounting}.
  if (svg.parentNode === null)
    mounting.add(svg);
  tracked.add(svg);
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
export function initObservablePlots(options: ObservableWatchOptions = {}): () => void {
  const root = options.root ?? document.body;
  if (!root)
    return () => {};

  let scheduled = false;
  let stopped = false;
  const scan = (): void => {
    scheduled = false;
    if (stopped)
      return;
    sweepDiscarded();
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
      // Removals matter as much as additions: a cell emptied without a
      // replacement discards a chart that nothing else will report.
      if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        schedule();
        return;
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    // A pass already queued would otherwise bind one more chart after the
    // caller asked the watcher to stop.
    stopped = true;
  };
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
export function autoInitObservablePlots(): (() => void) | null {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return null;
  if ((window as Window & { maidrObservableAutoInit?: boolean }).maidrObservableAutoInit === false)
    return null;
  // A page that loads the bundle twice — a Quarto project with the filter in
  // both `_quarto.yml` and a document, say — would otherwise get two watchers
  // scanning the same document forever.
  if (autoWatcher)
    return autoWatcher;

  if (document.readyState !== 'loading') {
    autoWatcher = initObservablePlots();
    return autoWatcher;
  }

  // Stopping before the document is ready has to cancel the pending start, not
  // just the watcher that does not exist yet.
  let stop: (() => void) | null = null;
  let cancelled = false;
  document.addEventListener('DOMContentLoaded', () => {
    if (!cancelled)
      stop = initObservablePlots();
  }, { once: true });

  autoWatcher = () => {
    cancelled = true;
    stop?.();
    stop = null;
  };
  return autoWatcher;
}

/**
 * Stops the watcher {@link autoInitObservablePlots} started, if it started one.
 *
 * Charts already bound stay bound; this only stops new ones being picked up.
 * Exposed so a single-page app can hand the page back cleanly, and so a test
 * can turn the adapter off.
 */
export function stopObservablePlots(): void {
  autoWatcher?.();
  autoWatcher = null;
}

/**
 * Releases the MAIDR instance of every chart the page has discarded.
 *
 * Covers every way a chart can go, not only the tidy one: a cell that re-runs
 * into something unreadable, a cell removed outright, and a chart that was
 * never inside a cell to begin with.
 *
 * See {@link settled} for why absence alone is not enough to act on.
 */
function sweepDiscarded(): void {
  for (const chart of tracked) {
    if (chart.isConnected) {
      settled.add(chart);
      continue;
    }

    // Parented to nothing, with a mount still in flight: the wrapper has taken
    // the chart's place and the commit that adopts it has not run. Waiting
    // costs nothing, because React commits into its container whether or not
    // the page still holds that container, so a chart discarded during its own
    // mount acquires a parent anyway and is released on the next sweep.
    if (!settled.has(chart) && chart.parentNode === null && mounting.has(chart))
      continue;

    tracked.delete(chart);
    bound.delete(chart);
    // On the chart's own document, with the element in `detail`: the chart is
    // detached by now, so an event fired on it would reach no listener, and a
    // detached chart still belongs to the document it was drawn in — which is
    // where the runtime holding its instance is listening.
    chart.ownerDocument?.dispatchEvent(
      new CustomEvent('maidr:unbindchart', { detail: chart }),
    );
  }
}

/**
 * Finds every Plot chart under a root that is not bound yet.
 *
 * @param root - The subtree to search.
 * @returns The charts' `<svg>` elements.
 */
function findUnboundPlots(root: ParentNode): Element[] {
  const found: Element[] = [];
  // `:not([maidr-data])` narrows the query itself, and everything already
  // rejected is remembered — otherwise every insertion anywhere on the page
  // re-tests every SVG the document happens to contain, icons included.
  for (const svg of Array.from(root.querySelectorAll('svg:not([maidr-data])'))) {
    if (bound.has(svg) || notPlots.has(svg))
      continue;
    if (isObservablePlot(svg))
      found.push(svg);
    else
      notPlots.add(svg);
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
function bindOne(svg: Element, options: ObservableWatchOptions): void {
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

/**
 * @deprecated Renamed to {@link initObservablePlots}. The watcher never had
 * anything to do with Quarto — it binds Plot charts wherever they appear, and
 * the Quarto name said otherwise to everyone using it on an ordinary page.
 * Kept so the released name goes on working; it will be removed in the next
 * major.
 */
export const initQuartoObservable = initObservablePlots;

/**
 * @deprecated Renamed to {@link stopObservablePlots}. See
 * {@link initQuartoObservable}.
 */
export const stopQuartoObservable = stopObservablePlots;

/**
 * @deprecated Renamed to {@link autoInitObservablePlots}. See
 * {@link initQuartoObservable}.
 */
export const autoInitQuartoObservable = autoInitObservablePlots;
