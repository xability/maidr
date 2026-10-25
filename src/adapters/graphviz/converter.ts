/**
 * Converts a Graphviz drawing into MAIDR's schema.
 *
 * A `digraph` becomes a `directed_graph` layer: one point per node, each
 * naming the nodes whose edges arrive at it, with the edge's label beside
 * it, and the clusters drawn around it as its path, so each cluster is a
 * scope the reader opens and closes. Each point is paired with the node's
 * group in the drawing, so the node the reader is on is outlined.
 *
 * An undirected `graph` becomes a `network` layer: one link per edge, read
 * by degree and by connected group, since a link between two nodes is a fact
 * about the pair rather than a way to go. Each link is paired with the
 * edge's group.
 *
 * A graph drawn by the `patchwork` layout becomes a `treemap`: its clusters
 * are the branches and its nodes the leaves, each leaf's magnitude its
 * `area` as the rectangle drew it.
 */

import type { DirectedGraphPoint, Maidr, MaidrLayer, NetworkPoint, TreemapPoint } from '@type/grammar';
import type { Locale } from '@util/i18n/locale';
import type { Bounds } from './geometry';
import type { GraphvizAdapterOptions, GraphvizGraph } from './types';
import { adapterLocale, followReaderLanguage, stopFollowingReaderLanguage } from '@adapters/shared/language';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { TraceType } from '@type/grammar';
import { isLocale } from '@util/i18n/locale';
import { boundsOf } from './geometry';
import { readGraphviz } from './read';

/**
 * What a patchwork drawing's magnitude measures, in each language: the one
 * word the adapter writes itself. Everything else it reads is the drawing's.
 */
const AREA: Readonly<Record<Locale, string>> = {
  en: 'Area',
  ko: '면적',
  ja: '面積',
  zh: '面积',
  es: 'Área',
  de: 'Fläche',
  fr: 'Aire',
  it: 'Area',
  hi: 'क्षेत्रफल',
};

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
    if (node.path.length > 0) {
      point.path = node.path;
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

/** The attribute each cell of a patchwork is marked with, by its index. */
const CELL_MARK = 'data-maidr-graphviz-cell';

/**
 * How many square points patchwork draws for one unit of a node's `area`:
 * its source scales every area by 1000 so that the default of 1 is a
 * reasonable size, and draws in the graph's own coordinates, which `size`
 * and a page's resizing scale from outside.
 */
const PATCHWORK_SCALE = 1000;

/**
 * The `area` a patchwork rectangle was drawn for.
 *
 * Graphviz writes each corner to two decimals, so each side is known to
 * within a hundredth of a point, and the area to within the sum of the
 * sides over a hundred. The value is rounded to the decimal place that
 * bound reaches -- a hundredth for a small node, a tenth for one in the
 * thousands -- where the rounding actually seen stays well inside half a
 * step, so `area=60.25` and `area=12345` both come back as written.
 *
 * @param bounds - The rectangle
 * @returns Its area, in the units of the `area` attribute
 */
function patchworkArea(bounds: Bounds): number {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const error = ((width + height) * 0.01) / PATCHWORK_SCALE;
  const step = 10 ** Math.ceil(Math.log10(Math.max(error, 1e-6)));
  const area = (width * height) / PATCHWORK_SCALE;
  return Number((Math.round(area / step) * step).toFixed(Math.max(0, -Math.log10(step))));
}

/**
 * Builds the `treemap` layer of a graph the `patchwork` layout drew.
 *
 * Patchwork draws each node as a rectangle whose area is the node's `area`
 * attribute, packed inside the rectangles of its clusters, so the drawing is
 * a treemap whose branches are the clusters. Each leaf's magnitude is its
 * `area`, read back from the rectangle (see {@link patchworkArea}).
 *
 * Clusters are declared too, without a magnitude -- a branch is the sum of
 * its leaves -- so each is paired with its own outline and outlined when the
 * reader is on it. Patchwork draws no cluster labels, so a cluster is called
 * by its name.
 *
 * @param graph - What was read from the drawing
 * @param svgId - The drawing's id
 * @param layerId - The layer's id
 * @param options - Figure options
 * @returns The layer
 */
function treemapLayer(
  graph: GraphvizGraph,
  svgId: string,
  layerId: string,
  options: GraphvizAdapterOptions,
  language: Locale,
): MaidrLayer {
  const branches: TreemapPoint[] = graph.clusters.map(cluster => ({
    x: cluster.label,
    ...(cluster.path.length > 0 ? { path: cluster.path } : {}),
  }));
  const unread: string[] = [];
  const leaves: TreemapPoint[] = graph.nodes.map((node) => {
    const bounds = boundsOf(node.element, true);
    if (bounds === null) {
      unread.push(node.name);
    }
    return {
      x: node.label || node.name,
      y: bounds === null ? 0 : patchworkArea(bounds),
      ...(node.path.length > 0 ? { path: node.path } : {}),
    };
  });
  if (unread.length > 0) {
    console.warn(
      `[maidr/graphviz] ${unread.length} node${unread.length === 1 ? '' : 's'} (${unread.join(', ')}) `
      + 'drew no rectangle, so each is read with an area of 0. Was this drawing made by patchwork?',
    );
  }

  return {
    id: layerId,
    type: TraceType.TREEMAP,
    axes: {
      ...(options.nodeLabel ? { x: { label: options.nodeLabel } } : {}),
      y: { label: AREA[language] },
    },
    selectors: selectorsFor(svgId, CELL_MARK, [
      ...graph.clusters.map(cluster => cluster.element),
      ...graph.nodes.map(node => node.element),
    ]),
    data: [...branches, ...leaves],
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
 * A drawing the caller says `patchwork` drew is a treemap. Otherwise, an
 * edge is written `--` only in a `graph`, so a drawing whose edges all are
 * is undirected. A graph with no edges at all cannot say which it is, and
 * reads as a directed graph of lone nodes.
 *
 * @param graph - What was read from the drawing
 * @param svgId - The drawing's id
 * @param id - The figure's id
 * @param options - Figure options
 * @param language - The language of the adapter's own words
 * @returns The layer
 */
function layerFor(
  graph: GraphvizGraph,
  svgId: string,
  id: string,
  options: GraphvizAdapterOptions,
  language: Locale,
): MaidrLayer {
  // Patchwork draws no edges, and is read as a treemap whatever kind of
  // graph it was written as.
  if (options.layout === 'patchwork') {
    return treemapLayer(graph, svgId, `${id}-treemap`, options, language);
  }
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
 * Unless `options.language` names one, the one word the adapter writes
 * itself -- a patchwork drawing's `Area` -- is in the language MAIDR speaks
 * to the reader, and is written again when the reader changes it.
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
  const language = adapterLocale(options.language, 'graphviz');
  const maidr = convertIn(svg, options, language);
  if (isLocale(options.language)) {
    stopFollowingReaderLanguage(svg);
  } else {
    followReaderLanguage(svg, language, maidr, next => convertIn(svg, options, next));
  }
  return maidr;
}

/**
 * Converts a drawing, writing the adapter's words in a language.
 *
 * @param svg - The SVG Graphviz drew
 * @param options - Figure options
 * @param language - The language of the adapter's own words
 * @returns The MAIDR figure
 */
function convertIn(svg: SVGSVGElement, options: GraphvizAdapterOptions, language: Locale): Maidr {
  const graph = readGraphviz(svg);
  const svgId = ensureContainerId(svg, 'maidr-graphviz');
  const id = options.id ?? svgId;
  const layers = graph.nodes.length === 0 ? [] : [layerFor(graph, svgId, id, options, language)];
  const title = options.title ?? graph.label;
  return {
    id,
    ...(title ? { title } : {}),
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    ...(options.caption ? { caption: options.caption } : {}),
    subplots: [[{ layers }]],
  };
}
