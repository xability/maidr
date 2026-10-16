/**
 * Makes the Graphviz drawings on a page accessible.
 *
 * Graphviz draws ahead of time -- a Quarto `{dot}` cell, a static site
 * generator, R's DiagrammeR -- or in the page with a WebAssembly build, and
 * either way what reaches the page is an SVG. These helpers find those SVGs
 * and set the `maidr` attribute on each, which MAIDR picks up as it does any
 * other chart.
 */

import type { Maidr } from '@type/grammar';
import type { GraphvizAdapterOptions } from './types';
import { createMaidrFromGraphviz } from './converter';
import { isGraphvizSvg } from './read';

/**
 * Converts one drawing and sets the result on it.
 *
 * @param svg - The SVG Graphviz drew
 * @param options - Figure options
 * @returns The MAIDR figure set on the drawing
 * @throws Error when the drawing cannot be converted
 */
export function renderGraphviz(svg: SVGSVGElement, options: GraphvizAdapterOptions = {}): Maidr {
  const maidr = createMaidrFromGraphviz(svg, options);
  svg.setAttribute('maidr', JSON.stringify(maidr));
  return maidr;
}

/**
 * Makes every Graphviz drawing under a root accessible, or one drawing when
 * the root is itself one.
 *
 * A drawing already carrying a `maidr` attribute is left alone, so calling
 * this again after more drawings arrive binds only the new ones. A drawing
 * that cannot be converted is reported on the console and left as drawn, and
 * the rest are still made accessible.
 *
 * @param root - The drawing, or where to look for drawings. Defaults to the
 *   document
 * @param options - Figure options, applied to each drawing. An `id` is used
 *   only when the root is a single drawing, since two figures cannot share it
 * @returns The figures made, one per drawing that converted
 *
 * @example
 * ```html
 * <!-- The SVG a Quarto {dot} cell, or `dot -Tsvg`, wrote into the page -->
 * <svg>...</svg>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/graphviz.js"></script>
 * <script>maidrGraphviz.bindGraphviz();</script>
 * ```
 */
export function bindGraphviz(
  root: ParentNode | SVGSVGElement = document,
  options: GraphvizAdapterOptions = {},
): Maidr[] {
  const single = 'localName' in root && root.localName === 'svg';
  const drawings = single
    ? [root as SVGSVGElement]
    : [...root.querySelectorAll<SVGSVGElement>('svg')];
  const { id, ...shared } = options;
  const figures: Maidr[] = [];
  for (const svg of drawings) {
    if (svg.hasAttribute('maidr') || !isGraphvizSvg(svg)) {
      continue;
    }
    try {
      figures.push(renderGraphviz(svg, single && id !== undefined ? { ...shared, id } : shared));
    } catch (error) {
      console.error('[maidr/graphviz] Could not make a drawing accessible.', error);
    }
  }
  return figures;
}
