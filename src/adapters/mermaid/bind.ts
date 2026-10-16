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
 * A diagram's source as Mermaid's own `run()` reads it from the page: the
 * common indentation removed and the ends trimmed, so a diagram indented to
 * sit inside its markup -- and its front matter -- parses as written.
 *
 * @param text - The element's text
 * @returns The source
 */
export function sourceOf(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const indents = lines
    .filter(line => line.trim() !== '')
    .map(line => line.length - line.trimStart().length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(common)).join('\n').trim();
}

/**
 * A fresh id to render a diagram under, unique on the page.
 *
 * Mermaid removes whatever element already has the id it renders under,
 * prefixes every id inside the drawing with it, and selects with it
 * unescaped. So the id is built from the element's own -- reduced to
 * characters a selector takes as they are -- plus a counter that moves on
 * every render: two elements sharing an id, or one element rendered twice,
 * never draw under the same id, and one diagram never takes another's
 * drawing off the page.
 *
 * @param element - Where the diagram goes
 * @returns The id
 */
function renderIdFor(element: Element): string {
  const base = element.id.replace(/[^\w-]+/g, '-').replace(/^[^A-Z]+/i, '') || 'maidr-mermaid';
  let id: string;
  do {
    renderCounter += 1;
    id = `${base}-svg-${renderCounter}`;
  } while (document.getElementById(id) !== null);
  return id;
}

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
  const source = text ?? element.getAttribute('data-maidr-mermaid-source') ?? sourceOf(element.textContent ?? '');
  element.setAttribute('data-maidr-mermaid-source', source);

  const { svg, bindFunctions } = await mermaid.render(renderIdFor(element), source);
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
