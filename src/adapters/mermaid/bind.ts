/**
 * Renders Mermaid diagrams on a page and makes each one accessible.
 *
 * Mermaid's own `mermaid.run()` replaces each `.mermaid` element's text with
 * the drawing, and the text is what the adapter needs to read the diagram.
 * These helpers take the text first, render it, and set the `maidr`
 * attribute on the drawing, which MAIDR picks up as it does any other chart.
 */

import type { Maidr } from '@type/grammar';
import type { MermaidAdapterOptions, MermaidApi } from './types';
import { createMaidrFromMermaid } from './converter';

let renderCounter = 0;

/**
 * Renders one diagram into an element and makes it accessible.
 *
 * @param mermaid - The Mermaid API
 * @param element - Where the diagram goes. Its text is the diagram's source
 *   unless `text` is given
 * @param text - The source, when it is not the element's own text
 * @param options - Figure options
 * @returns The MAIDR figure set on the drawing
 * @throws Error when the diagram does not parse, render or convert
 */
export async function renderMermaid(
  mermaid: MermaidApi,
  element: Element,
  text?: string,
  options: MermaidAdapterOptions = {},
): Promise<Maidr> {
  const source = text ?? element.getAttribute('data-maidr-mermaid-source') ?? element.textContent ?? '';
  element.setAttribute('data-maidr-mermaid-source', source);

  renderCounter += 1;
  const id = element.id ? `${element.id}-svg` : `maidr-mermaid-svg-${renderCounter}`;
  const { svg, bindFunctions } = await mermaid.render(id, source);
  element.innerHTML = svg;
  bindFunctions?.(element);

  const drawing = element.querySelector('svg');
  if (drawing === null) {
    throw new Error('[maidr/mermaid] Mermaid rendered no SVG.');
  }
  const maidr = await createMaidrFromMermaid(mermaid, source, drawing, options);
  drawing.setAttribute('maidr', JSON.stringify(maidr));
  return maidr;
}

/**
 * Renders every diagram matching a selector and makes each one accessible,
 * in place of `mermaid.run()`.
 *
 * Diagrams are rendered one at a time, in document order, because some of
 * Mermaid's diagram databases are shared between parses. A diagram that
 * fails is reported on the console and left as Mermaid drew it -- or as text
 * when Mermaid could not -- and the rest are still made accessible.
 *
 * @param mermaid - The Mermaid API
 * @param selector - Which elements hold diagram source. Defaults to `.mermaid`
 * @param root - Where to look. Defaults to the document
 * @returns The figures made, one per diagram that converted
 *
 * @example
 * ```html
 * <pre class="mermaid">
 * pie title Pets
 *   "Dogs" : 386
 *   "Cats" : 85
 * </pre>
 * <script>
 *   mermaid.initialize({ startOnLoad: false });
 *   maidrMermaid.bindMermaid(mermaid);
 * </script>
 * ```
 */
export async function bindMermaid(
  mermaid: MermaidApi,
  selector = '.mermaid',
  root: ParentNode = document,
): Promise<Maidr[]> {
  const figures: Maidr[] = [];
  for (const element of root.querySelectorAll(selector)) {
    if (element.querySelector('svg[maidr]') !== null) {
      continue;
    }
    try {
      figures.push(await renderMermaid(mermaid, element));
    } catch (error) {
      console.error('[maidr/mermaid] Could not make a diagram accessible.', error);
    }
  }
  return figures;
}
