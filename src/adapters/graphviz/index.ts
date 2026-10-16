/**
 * Graphviz adapter for MAIDR.
 *
 * Makes graphs drawn by Graphviz navigable with audio, text, braille and
 * keyboard. It reads the SVG Graphviz wrote -- from the `dot` command, a
 * Quarto `{dot}` cell, R's DiagrammeR, or a WebAssembly build such as
 * `@hpcc-js/wasm-graphviz` or viz.js in the page -- and needs neither the
 * DOT source nor Graphviz itself.
 *
 * @remarks
 * Call {@link bindGraphviz} once the drawings are in the page, or convert one
 * yourself with {@link createMaidrFromGraphviz} and set the result as its
 * `maidr` attribute.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/graphviz.js"></script>
 * <script>maidrGraphviz.bindGraphviz();</script>
 * ```
 *
 * @packageDocumentation
 */

export { bindGraphviz, renderGraphviz } from './bind';
export { createMaidrFromGraphviz } from './converter';
export { isGraphvizSvg, readGraphviz } from './read';
export type { GraphvizAdapterOptions, GraphvizCluster, GraphvizEdge, GraphvizGraph, GraphvizNode } from './types';
