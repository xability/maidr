/**
 * Mermaid adapter entry point for MAIDR.
 *
 * This module re-exports the Mermaid adapter API and exposes it globally for
 * script-tag usage. For detailed documentation and examples, see
 * {@link bindMermaid} and {@link createMaidrFromMermaid}.
 *
 * @packageDocumentation
 */
import { bindMermaid, renderMermaid } from './adapters/mermaid/bind';
import {
  convertMermaidDiagram,
  createMaidrFromMermaid,
  supportedMermaidDiagrams,
} from './adapters/mermaid/converter';

export { bindMermaid, renderMermaid } from './adapters/mermaid/bind';
export {
  convertMermaidDiagram,
  createMaidrFromMermaid,
  supportedMermaidDiagrams,
} from './adapters/mermaid/converter';
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
    };
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
  });
}

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
