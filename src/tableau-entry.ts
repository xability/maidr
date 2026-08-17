/**
 * Tableau adapter entry point for MAIDR.
 *
 * Re-exports the adapter's API and exposes it as `window.maidrTableau` for
 * script-tag usage. For what the adapter does and how a page wires it up, see
 * {@link bindTableau}.
 *
 * @remarks
 * The Tableau Embedding API v3 library is loaded by the host page — this bundle
 * has no compile-time or runtime dependency on any `@tableau/*` package, and
 * only duck-types the live `<tableau-viz>` element.
 *
 * @example
 * ```html
 * <script type="module"
 *   src="https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/tableau.js"></script>
 *
 * <tableau-viz id="viz" src="https://public.tableau.com/views/Book/Sheet"></tableau-viz>
 *
 * <script>
 *   const viz = document.getElementById('viz');
 *   viz.addEventListener('firstinteractive', () => {
 *     window.maidrTableau.bindTableau(viz);
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

import { bindTableau, extractTableau } from './adapters/tableau';

export { bindTableau, extractTableau } from './adapters/tableau';
export type {
  SelectionIndex,
  TableauAdapterOptions,
  TableauBinding,
  TableauColumn,
  TableauDataType,
  TableauExtraction,
  TableauSelectionCriteria,
  TableauViz,
  TableauWorksheet,
  TableauWorksheetOverride,
  WorksheetSnapshot,
} from './adapters/tableau';

// Re-export core types that consumers may need alongside the adapter.
export type {
  Maidr as MaidrData,
  MaidrLayer,
  MaidrSubplot,
  StepDirection,
} from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

declare global {
  interface Window {
    maidrTableau?: {
      bindTableau: typeof bindTableau;
      extractTableau: typeof extractTableau;
    };
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned. The UMD build has already put every export on this
  // global; replacing it would drop the ones not named here — the enums a
  // script-tag consumer needs to read a layer's `type`, among them.
  window.maidrTableau = Object.assign(window.maidrTableau ?? {}, {
    bindTableau,
    extractTableau,
  });
}
