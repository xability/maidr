/**
 * Shared fixtures for the Mermaid adapter's tests, one file per diagram family
 * under `src/adapters/mermaid/diagrams/`.
 *
 * Mermaid itself does not load under jsdom, so each test hands the converter
 * the database a parse would have produced -- the getters it reads and
 * nothing else -- and an SVG holding the elements Mermaid draws with the ids
 * and classes it gives them. The e2e spec runs the real Mermaid.
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import { convertMermaidDiagram } from '@adapters/mermaid/converter';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds a rendered diagram: an SVG with the given id holding the markup.
 *
 * @param id - The SVG's id, which Mermaid prefixes its element ids with
 * @param markup - The SVG's contents
 * @returns The SVG, attached to the document
 */
export function drawn(id: string, markup = ''): SVGSVGElement {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.id = id;
  svg.innerHTML = markup;
  document.body.appendChild(svg);
  return svg;
}

/**
 * Converts a stand-in database and returns the figure.
 *
 * @param type - The diagram type
 * @param db - The database
 * @param svg - The drawing
 * @returns The figure
 */
export function convert(type: string, db: object, svg: SVGSVGElement = drawn('d')): Maidr {
  return convertMermaidDiagram({ type, db }, svg);
}

/**
 * The figure's layers.
 *
 * @param figure - The figure
 * @returns Its first subplot's layers
 */
export function layersOf(figure: Maidr): MaidrLayer[] {
  return figure.subplots[0][0].layers;
}

/**
 * How many elements a layer's selectors match.
 *
 * @param layer - The layer
 * @returns The match count
 */
export function matched(layer: MaidrLayer): number {
  const selectors = layer.selectors;
  if (typeof selectors === 'string') {
    return document.querySelectorAll(selectors).length;
  }
  return (selectors as string[] ?? []).flatMap(one => [...document.querySelectorAll(one)]).length;
}
