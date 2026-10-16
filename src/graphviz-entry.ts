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
    };
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
  });
}

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
