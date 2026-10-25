/**
 * Shared fixtures for the Mermaid adapter's tests, one file per diagram family
 * under `src/adapters/mermaid/diagrams/`.
 *
 * Mermaid itself does not load under jsdom, so each test hands the converter
 * the database a parse would have produced -- the getters it reads and
 * nothing else -- and an SVG holding the elements Mermaid draws with the ids
 * and classes it gives them. The e2e spec runs the real Mermaid.
 */

import type { MermaidAdapterOptions } from '@adapters/mermaid/types';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
 * @param options - Figure options: a `language` to write the adapter's words in
 * @returns The figure
 */
export function convert(type: string, db: object, svg: SVGSVGElement = drawn('d'), options: MermaidAdapterOptions = {}): Maidr {
  return convertMermaidDiagram({ type, db }, svg, options);
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

/**
 * Mermaid's own list of the shapes a flowchart can draw, each as the names
 * Mermaid takes for it: its short name, its aliases, and the internal names
 * a flowchart written with brackets records. Read from Mermaid's bundle,
 * since Mermaid does not load here.
 *
 * @returns One list of names per shape
 * @throws When the bundle holds no list, as it would once Mermaid lists its
 * shapes some other way
 */
export function mermaidShapeNames(): string[][] {
  const dir = path.resolve('node_modules/mermaid/dist/chunks/mermaid.esm');
  const source = readdirSync(dir)
    .filter(file => file.endsWith('.mjs'))
    .map(file => readFileSync(path.join(dir, file), 'utf8'))
    .find(text => text.includes('semanticName:'));
  if (source === undefined) {
    throw new Error(`No list of shapes in ${dir}: see how Mermaid lists its shapes now.`);
  }
  return [...source.matchAll(/\{\s*semanticName:[^{}]*\}/g)].map(([entry]) => {
    const names = (field: string): string[] => {
      const list = new RegExp(`\\b${field}:\\s*\\[([^\\]]*)\\]`).exec(entry)?.[1] ?? '';
      return [...list.matchAll(/"([^"]+)"/g)].map(([, name]) => name);
    };
    const short = /shortName:\s*"([^"]+)"/.exec(entry)?.[1];
    return [...new Set([...(short === undefined ? [] : [short]), ...names('aliases'), ...names('internalAliases')])];
  });
}
