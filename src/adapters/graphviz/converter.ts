/**
 * Converts a Graphviz drawing into MAIDR's schema.
 *
 * A `digraph` becomes a `directed_graph` layer: one point per node, each
 * naming the nodes whose edges arrive at it, with the edge's label beside
 * it. Each point is paired with the node's group in the drawing, so the node
 * the reader is on is outlined.
 *
 * An undirected `graph` becomes a `network` layer: one link per edge, read
 * by degree and by connected group, since a link between two nodes is a fact
 * about the pair rather than a way to go. Each link is paired with the
 * edge's group.
 */

import type { DirectedGraphPoint, Maidr, MaidrLayer, NetworkPoint } from '@type/grammar';
import type { GraphvizAdapterOptions, GraphvizGraph } from './types';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { TraceType } from '@type/grammar';
import { readGraphviz } from './read';

/** The attribute each node's group is marked with, by its index. */
const NODE_MARK = 'data-maidr-graphviz-node';

/** The attribute each edge's group is marked with, by its index. */
const EDGE_MARK = 'data-maidr-graphviz-edge';

/**
 * Marks each element and names it by the mark, inside the drawing.
 *
 * Graphviz numbers its groups `node1`, `edge1`, ... afresh in every drawing,
 * so two graphs on one page -- the ordinary case in a Quarto document --
 * share every id. The drawing's own id, which the adapter sets when it has
 * none, scopes each selector to it.
 *
 * @param svgId - The drawing's id
 * @param mark - The attribute to mark each element with
 * @param elements - One element per point, in point order
 * @returns One selector per point
 */
function selectorsFor(svgId: string, mark: string, elements: Element[]): string[] {
  return elements.map((element, index) => {
    element.setAttribute(mark, String(index));
    return `#${cssEscape(svgId)} [${mark}="${index}"]`;
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
    selectors: selectorsFor(svgId, NODE_MARK, graph.nodes.map(node => node.element)),
    data,
  };
}

/**
 * Builds the `network` layer of an undirected `graph`.
 *
 * A network names its nodes by what its links call them, so each end is
 * the text drawn on the node, which is what a sighted reader reads. Where
 * two nodes are drawn with the same text, every node is named by its DOT
 * name instead, since one name would merge the two into one node. A node no
 * edge touches has no link to be named in, and is not read.
 *
 * @param graph - What was read from the drawing
 * @param svgId - The drawing's id
 * @param layerId - The layer's id
 * @param options - Figure options
 * @returns The layer
 */
function networkLayer(
  graph: GraphvizGraph,
  svgId: string,
  layerId: string,
  options: GraphvizAdapterOptions,
): MaidrLayer {
  const drawn = new Map(graph.nodes.map(node => [node.name, node.label || node.name]));
  const unique = new Set(drawn.values()).size === drawn.size;
  const nameOf = (node: string): string => (unique ? drawn.get(node) : undefined) ?? node;

  const data: NetworkPoint[] = graph.edges.map(edge => ({ source: nameOf(edge.tail), target: nameOf(edge.head) }));
  const linked = new Set(graph.edges.flatMap(edge => [edge.tail, edge.head]));
  const lone = graph.nodes.filter(node => !linked.has(node.name)).map(node => nameOf(node.name));
  if (lone.length > 0) {
    console.warn(
      `[maidr/graphviz] ${lone.length} node${lone.length === 1 ? '' : 's'} with no edge `
      + `(${lone.join(', ')}) cannot be read: a network names its nodes by their links.`,
    );
  }
  return {
    id: layerId,
    type: TraceType.NETWORK,
    ...(options.nodeLabel ? { axes: { x: { label: options.nodeLabel } } } : {}),
    selectors: selectorsFor(svgId, EDGE_MARK, graph.edges.map(edge => edge.element)),
    data,
  };
}

/**
 * The layer a drawing with nodes becomes.
 *
 * An edge is written `--` only in a `graph`, so a drawing whose edges all are
 * is undirected. A graph with no edges at all cannot say which it is, and
 * reads as a directed graph of lone nodes.
 *
 * @param graph - What was read from the drawing
 * @param svgId - The drawing's id
 * @param id - The figure's id
 * @param options - Figure options
 * @returns The layer
 */
function layerFor(graph: GraphvizGraph, svgId: string, id: string, options: GraphvizAdapterOptions): MaidrLayer {
  if (graph.edges.length > 0 && graph.edges.every(edge => !edge.directed)) {
    return networkLayer(graph, svgId, `${id}-network`, options);
  }
  return directedGraphLayer(graph, svgId, `${id}-graph`, options);
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
 * @throws Error when the SVG is not a Graphviz drawing. A drawing with no
 *   nodes becomes a figure with no layers, which MAIDR announces as empty
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
  const svgId = ensureContainerId(svg, 'maidr-graphviz');
  const id = options.id ?? svgId;
  const layers = graph.nodes.length === 0 ? [] : [layerFor(graph, svgId, id, options)];
  const title = options.title ?? graph.label;
  return {
    id,
    ...(title ? { title } : {}),
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    ...(options.caption ? { caption: options.caption } : {}),
    subplots: [[{ layers }]],
  };
}
