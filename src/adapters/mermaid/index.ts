/**
 * Mermaid adapter for MAIDR.
 *
 * Makes every Mermaid diagram type -- and ZenUML, through its plugin --
 * navigable with audio, text, braille and keyboard: it parses the diagram's text with Mermaid's own parser, reads the
 * result, and pairs it with the SVG Mermaid drew.
 *
 * @remarks
 * Mermaid must render with `startOnLoad: false`, so the adapter can take each
 * diagram's text before Mermaid replaces it with the drawing. Then either
 * call {@link bindMermaid} in place of `mermaid.run()`, or render yourself and
 * call {@link createMaidrFromMermaid} with the text and the SVG.
 *
 * @example
 * ```html
 * <pre class="mermaid">
 * flowchart LR
 *   A[Order] --> B{In stock?}
 *   B -->|yes| C[Ship]
 *   B -->|no| D[Back-order]
 * </pre>
 * <script src="https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.min.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/mermaid.js"></script>
 * <script>
 *   mermaid.initialize({ startOnLoad: false });
 *   maidrMermaid.bindMermaid(mermaid);
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export { bindMermaid, renderMermaid } from './bind';
export { convertMermaidDiagram, createMaidrFromMermaid, supportedMermaidDiagrams } from './converter';
export type { MermaidAdapterOptions, MermaidApi, MermaidDiagram, MermaidRenderResult } from './types';
