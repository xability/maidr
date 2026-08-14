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
 * {@link initQuartoObservable} or {@link bindObservablePlot} yourself.
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
  autoInitQuartoObservable,
  bindObservablePlot,
  initQuartoObservable,
} from './adapters/observable/quarto';

export { observablePlotToMaidr } from './adapters/observable/converters';
export { isObservablePlot } from './adapters/observable/introspect';
export {
  autoInitQuartoObservable,
  bindObservablePlot,
  initQuartoObservable,
} from './adapters/observable/quarto';

export type {
  MarkDatum,
  ObservablePlotElement,
  ObservablePlotOptions,
  ObservablePlotResult,
  PlotScale,
  PlotScales,
  QuartoObservableOptions,
} from './adapters/observable/types';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

declare global {
  interface Window {
    maidrObservable?: {
      bindObservablePlot: typeof bindObservablePlot;
      initQuartoObservable: typeof initQuartoObservable;
      observablePlotToMaidr: typeof observablePlotToMaidr;
      isObservablePlot: typeof isObservablePlot;
    };
    /** Set to `false` before the bundle loads to skip the automatic watcher. */
    maidrObservableAutoInit?: boolean;
  }
}

if (typeof window !== 'undefined') {
  window.maidrObservable = {
    bindObservablePlot,
    initQuartoObservable,
    observablePlotToMaidr,
    isObservablePlot,
  };
  autoInitQuartoObservable();
}
