import { bindMermaid, renderMermaid } from './adapters/mermaid/bind';
import {
  convertMermaidDiagram,
  createMaidrFromMermaid,
  supportedMermaidDiagrams,
} from './adapters/mermaid/converter';
import { watchQuartoMermaid } from './adapters/mermaid/quarto';
/**
 * Mermaid adapter entry point for MAIDR.
 *
 * This module re-exports the Mermaid adapter API and exposes it globally for
 * script-tag usage. For detailed documentation and examples, see
 * {@link bindMermaid} and {@link createMaidrFromMermaid}.
 *
 * @packageDocumentation
 */
import { isQuartoPage, whenParsed } from './adapters/shared/quarto';

export { bindMermaid, renderMermaid } from './adapters/mermaid/bind';
export {
  convertMermaidDiagram,
  createMaidrFromMermaid,
  supportedMermaidDiagrams,
} from './adapters/mermaid/converter';
export { watchQuartoMermaid } from './adapters/mermaid/quarto';
export type {
  MermaidAdapterOptions,
  MermaidApi,
  MermaidDiagram,
  MermaidRenderResult,
} from './adapters/mermaid/types';

// Expose the Mermaid adapter globally for script-tag usage (UMD build).
// Only runs in browser environments (not SSR/Node.js).
declare global {
  interface Window {
    maidrMermaid?: {
      bindMermaid: typeof bindMermaid;
      renderMermaid: typeof renderMermaid;
      createMaidrFromMermaid: typeof createMaidrFromMermaid;
      convertMermaidDiagram: typeof convertMermaidDiagram;
      supportedMermaidDiagrams: typeof supportedMermaidDiagrams;
      watchQuartoMermaid: typeof watchQuartoMermaid;
    };
    /** Set to `false` before the script loads to keep it from starting on a Quarto page. */
    maidrMermaidAutoInit?: boolean;
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned. The UMD build hands this global to the bundle and
  // writes the remaining exports onto it; replacing it would drop them.
  window.maidrMermaid = Object.assign(window.maidrMermaid ?? {}, {
    bindMermaid,
    renderMermaid,
    createMaidrFromMermaid,
    convertMermaidDiagram,
    supportedMermaidDiagrams,
    watchQuartoMermaid,
  });

  // On a Quarto page the script tag is the whole integration: a `{mermaid}`
  // cell has nowhere to call a binder from. Anywhere else nothing starts.
  // A page that loads the bundle twice -- the `maidr` filter in both
  // `_quarto.yml` and a document -- starts it once.
  const page = window as Window & { maidrMermaidAutoStarted?: boolean };
  if (window.maidrMermaidAutoInit !== false && !page.maidrMermaidAutoStarted) {
    page.maidrMermaidAutoStarted = true;
    whenParsed(() => {
      if (isQuartoPage()) {
        watchQuartoMermaid();
      }
    });
  }
}

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
