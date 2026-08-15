/**
 * Observable Plot adapter entry point for MAIDR.
 *
 * Re-exports the adapter's API, exposes it as `window.maidrObservable` for
 * script-tag usage, and — the part that makes a Quarto document work without
 * being edited — starts watching the page for Plot charts as soon as it loads.
 *
 * @remarks
 * Loading this bundle is the whole integration. A Quarto author adds two
 * script tags in the document header and every `{ojs}` cell that draws with
 * Observable Plot becomes navigable, including cells that re-run when a
 * `viewof` input changes.
 *
 * Set `window.maidrObservableAutoInit = false` **before** the bundle loads to
 * keep the exported functions and skip the watcher, then call
 * {@link initObservablePlots} or {@link bindObservablePlot} yourself.
 *
 * @example
 * ```yaml
 * # _quarto.yml — or the document's own YAML header
 * format:
 *   html:
 *     include-in-header:
 *       - text: |
 *           <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 *           <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
 * ```
 *
 * @packageDocumentation
 */

import { observablePlotToMaidr } from './adapters/observable/converters';
import { isObservablePlot } from './adapters/observable/introspect';
import {
  autoInitObservablePlots,
  bindObservablePlot,
  initObservablePlots,
  stopObservablePlots,
} from './adapters/observable/watcher';

export { observablePlotToMaidr } from './adapters/observable/converters';
export { isObservablePlot } from './adapters/observable/introspect';
export type {
  MarkDatum,
  ObservablePlotElement,
  ObservablePlotOptions,
  ObservablePlotResult,
  ObservableWatchOptions,
  PlotScale,
  PlotScales,
  QuartoObservableOptions,
} from './adapters/observable/types';

export {
  autoInitObservablePlots,
  autoInitQuartoObservable,
  bindObservablePlot,
  initObservablePlots,
  initQuartoObservable,
  stopObservablePlots,
  stopQuartoObservable,
} from './adapters/observable/watcher';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

declare global {
  interface Window {
    maidrObservable?: {
      bindObservablePlot: typeof bindObservablePlot;
      initObservablePlots: typeof initObservablePlots;
      stopObservablePlots: typeof stopObservablePlots;
      observablePlotToMaidr: typeof observablePlotToMaidr;
      isObservablePlot: typeof isObservablePlot;
      /** @deprecated Use `initObservablePlots`. */
      initQuartoObservable: typeof initObservablePlots;
      /** @deprecated Use `stopObservablePlots`. */
      stopQuartoObservable: typeof stopObservablePlots;
    };
    /** Set to `false` before the bundle loads to skip the automatic watcher. */
    maidrObservableAutoInit?: boolean;
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned. The UMD build has already put every export on this
  // global; replacing it would drop the ones not named here — the enums a
  // script-tag consumer needs to read a layer's `type`, among them.
  window.maidrObservable = Object.assign(window.maidrObservable ?? {}, {
    bindObservablePlot,
    initObservablePlots,
    stopObservablePlots,
    observablePlotToMaidr,
    isObservablePlot,
    // The names the first release shipped. A page written against them keeps
    // working; the guide only documents the ones above.
    initQuartoObservable: initObservablePlots,
    stopQuartoObservable: stopObservablePlots,
  });
  autoInitObservablePlots();
}
