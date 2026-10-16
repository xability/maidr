/**
 * Converts a Graphviz drawing into MAIDR's schema.
 *
 * A `digraph` becomes a `directed_graph` layer: one point per node, each
 * naming the nodes whose edges arrive at it, with the edge's label beside
 * it. Each point is paired with the node's group in the drawing, so the node
 * the reader is on is outlined.
 */

import type { DirectedGraphPoint, Maidr, MaidrLayer } from '@type/grammar';
import type { GraphvizAdapterOptions, GraphvizGraph } from './types';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { TraceType } from '@type/grammar';
import { readGraphviz } from './read';

/** The attribute each node's group is marked with, by its index. */
const NODE_MARK = 'data-maidr-graphviz-node';

/**
 * Marks each node's group and names it by the mark, inside the drawing.
 *
 * Graphviz numbers its groups `node1`, `node2`, ... afresh in every drawing,
 * so two graphs on one page -- the ordinary case in a Quarto document --
 * share every id. The drawing's own id, which the adapter sets when it has
 * none, scopes each selector to it.
 *
 * @param svgId - The drawing's id
 * @param elements - One element per node, in point order
 * @returns One selector per node
 */
function selectorsFor(svgId: string, elements: Element[]): string[] {
  return elements.map((element, index) => {
    element.setAttribute(NODE_MARK, String(index));
    return `#${cssEscape(svgId)} [${NODE_MARK}="${index}"]`;
  });
}

/**
 * Builds the `directed_graph` layer of a `digraph`.
 *
 * @param graph - What was read from the drawing
 * @param svgId - The drawing's id
 * @param layerId - The layer's id
 * @param options - Figure options
 * @returns The layer
 */
function directedGraphLayer(
  graph: GraphvizGraph,
  svgId: string,
  layerId: string,
  options: GraphvizAdapterOptions,
): MaidrLayer {
  const inputs = new Map<string, { ids: string[]; labels: (string | null)[] }>();
  for (const edge of graph.edges) {
    const entry = inputs.get(edge.head) ?? { ids: [], labels: [] };
    entry.ids.push(edge.tail);
    entry.labels.push(edge.label ?? null);
    inputs.set(edge.head, entry);
  }

  const data: DirectedGraphPoint[] = graph.nodes.map((node) => {
    const point: DirectedGraphPoint = { id: node.name };
    // A node drawn with no text (shape=point) is announced by its name.
    if (node.label !== '' && node.label !== node.name) {
      point.label = node.label;
    }
    const entry = inputs.get(node.name);
    if (entry) {
      point.inputs = entry.ids;
      if (entry.labels.some(label => label !== null)) {
        point.inputLabels = entry.labels;
      }
    }
    return point;
  });

  return {
    id: layerId,
    type: TraceType.DIRECTED_GRAPH,
    ...(options.nodeLabel ? { axes: { x: { label: options.nodeLabel } } } : {}),
    selectors: selectorsFor(svgId, graph.nodes.map(node => node.element)),
    data,
  };
}

/**
 * Creates a MAIDR figure from a Graphviz drawing on the page.
 *
 * Call it once the SVG is in the document: the layer's selectors name the
 * drawing's own node groups, and each group is marked so it can be named
 * however many graphs share the page.
 *
 * @param svg - The SVG Graphviz drew
 * @param options - Figure options
 * @returns The MAIDR figure, ready for the `maidr` attribute
 * @throws Error when the SVG is not a Graphviz drawing, or when it is an
 *   undirected `graph`, which the adapter does not read yet. A drawing with
 *   no nodes becomes a figure with no layers, which MAIDR announces as empty
 *
 * @example
 * ```js
 * const svg = document.querySelector('#pipeline svg');
 * svg.setAttribute('maidr', JSON.stringify(maidrGraphviz.createMaidrFromGraphviz(svg)));
 * ```
 */
export function createMaidrFromGraphviz(
  svg: SVGSVGElement,
  options: GraphvizAdapterOptions = {},
): Maidr {
  const graph = readGraphviz(svg);
  if (graph.edges.length > 0 && graph.edges.every(edge => !edge.directed)) {
    throw new Error('[maidr/graphviz] Undirected graphs (`graph { a -- b }`) are not supported yet.');
  }

  const svgId = ensureContainerId(svg, 'maidr-graphviz');
  const id = options.id ?? svgId;
  const layers = graph.nodes.length > 0
    ? [directedGraphLayer(graph, svgId, `${id}-graph`, options)]
    : [];
  const title = options.title ?? graph.label;
  return {
    id,
    ...(title ? { title } : {}),
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    ...(options.caption ? { caption: options.caption } : {}),
    subplots: [[{ layers }]],
  };
}
