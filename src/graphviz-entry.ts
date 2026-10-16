/**
 * Graphviz adapter entry point for MAIDR.
 *
 * This module re-exports the Graphviz adapter API and exposes it globally for
 * script-tag usage. For detailed documentation and examples, see
 * {@link bindGraphviz} and {@link createMaidrFromGraphviz}.
 *
 * @packageDocumentation
 */
import { bindGraphviz, renderGraphviz } from './adapters/graphviz/bind';
import { createMaidrFromGraphviz } from './adapters/graphviz/converter';
import { isGraphvizSvg, readGraphviz } from './adapters/graphviz/read';
import { watchGraphviz } from './adapters/graphviz/watch';
import { isQuartoPage, whenParsed } from './adapters/shared/quarto';

export { bindGraphviz, renderGraphviz } from './adapters/graphviz/bind';
export { createMaidrFromGraphviz } from './adapters/graphviz/converter';
export { isGraphvizSvg, readGraphviz } from './adapters/graphviz/read';
export type {
  GraphvizAdapterOptions,
  GraphvizCluster,
  GraphvizEdge,
  GraphvizGraph,
  GraphvizNode,
} from './adapters/graphviz/types';
export { watchGraphviz } from './adapters/graphviz/watch';

// Expose the Graphviz adapter globally for script-tag usage (UMD build).
// Only runs in browser environments (not SSR/Node.js).
declare global {
  interface Window {
    maidrGraphviz?: {
      bindGraphviz: typeof bindGraphviz;
      renderGraphviz: typeof renderGraphviz;
      createMaidrFromGraphviz: typeof createMaidrFromGraphviz;
      isGraphvizSvg: typeof isGraphvizSvg;
      readGraphviz: typeof readGraphviz;
      watchGraphviz: typeof watchGraphviz;
    };
    /** Set to `false` before the script loads to keep it from starting on a Quarto page. */
    maidrGraphvizAutoInit?: boolean;
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned. The UMD build hands this global to the bundle and
  // writes the remaining exports onto it; replacing it would drop them.
  window.maidrGraphviz = Object.assign(window.maidrGraphviz ?? {}, {
    bindGraphviz,
    renderGraphviz,
    createMaidrFromGraphviz,
    isGraphvizSvg,
    readGraphviz,
    watchGraphviz,
  });

  // On a Quarto page the script tag is the whole integration: a `{dot}` cell
  // has nowhere to call a binder from. Anywhere else nothing starts, so a
  // page that binds with its own options is not bound first with the
  // defaults. A page that loads the bundle twice starts it once.
  const page = window as Window & { maidrGraphvizAutoStarted?: boolean };
  if (window.maidrGraphvizAutoInit !== false && !page.maidrGraphvizAutoStarted) {
    page.maidrGraphvizAutoStarted = true;
    whenParsed(() => {
      if (isQuartoPage()) {
        watchGraphviz();
      }
    });
  }
}

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
