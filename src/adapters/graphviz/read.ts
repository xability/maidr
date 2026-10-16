/**
 * Reads the graph out of an SVG Graphviz drew.
 *
 * Graphviz's SVG renderer is regular: the graph is a `<g class="graph">`, and
 * inside it each node is a `<g class="node">` and each edge a
 * `<g class="edge">`, every one titled with what the DOT source called it.
 * A node's title is its name; an edge's is its two ends joined by `->` in a
 * `digraph` and `--` in a `graph`, each end carrying its port when the edge
 * named one (`a:out->b`). That holds for every Graphviz that writes SVG --
 * the `dot` command, the WebAssembly build Quarto and d3-graphviz use, viz.js
 * and R's DiagrammeR -- so the adapter reads the drawing alone and needs no
 * DOT parser.
 *
 * A cluster is a `<g class="cluster">`, but its nodes are not drawn inside
 * it: every group is a sibling in the graph group. What puts a node in a
 * cluster is that the cluster's outline is drawn around it, so membership is
 * read from where each was drawn.
 */

import type { Bounds } from './geometry';
import type { GraphvizCluster, GraphvizEdge, GraphvizGraph, GraphvizNode } from './types';
import { areaOf, boundsOf, contains } from './geometry';

/**
 * An element's own `<title>` child: Graphviz titles the group, not a
 * descendant, and a node wrapped in a link carries the link's title deeper
 * down.
 *
 * @param element - A graph, node or edge group
 * @returns The title's text, or null when it has none
 */
function ownTitle(element: Element): string | null {
  for (const child of element.children) {
    if (child.localName === 'title') {
      return child.textContent ?? '';
    }
  }
  return null;
}

/**
 * Whether an element is one of Graphviz's groups of a kind.
 *
 * @param element - The element
 * @param kind - `graph`, `node`, `edge` or `cluster`
 * @returns Whether it is a `<g>` of that class
 */
function isGroup(element: Element, kind: string): boolean {
  return element.localName === 'g' && (element.getAttribute('class') ?? '').split(/\s+/).includes(kind);
}

/**
 * The text an element draws, as a reader would read it: each `<text>` in
 * drawing order, joined by spaces. A label written over several lines
 * (`"Compile\nsources"`) is drawn as one `<text>` per line.
 *
 * @param elements - The `<text>` elements
 * @returns The text, trimmed, with runs of whitespace collapsed
 */
function textOf(elements: Iterable<Element>): string {
  return [...elements]
    .map(text => (text.textContent ?? '').trim())
    .filter(text => text !== '')
    .join(' ')
    .replace(/\s+/g, ' ');
}

/**
 * The graph group of a drawing: the `<g class="graph">` Graphviz puts every
 * other element in.
 *
 * @param svg - The drawing
 * @returns The group, or null when the SVG has none
 */
export function graphGroup(svg: Element): Element | null {
  for (const child of svg.children) {
    if (isGroup(child, 'graph')) {
      return child;
    }
  }
  return null;
}

/**
 * Whether an SVG is a Graphviz drawing.
 *
 * Graphviz opens every drawing with a `<g class="graph">`, numbered
 * `graph0` (one per page of a paginated drawing), and puts each node, edge
 * and cluster in a group of its own class directly inside it -- a shape no
 * charting library writes. The group carries a `<title>` only when the graph
 * has a name, so the id is what is checked.
 *
 * @param svg - The SVG
 * @returns Whether Graphviz drew it
 */
export function isGraphvizSvg(svg: Element): boolean {
  const graph = graphGroup(svg);
  return graph !== null && /^graph\d+$/.test(graph.id);
}

/**
 * Resolves one end of an edge's title to the node it names.
 *
 * The end is the node's name, followed by `:port` and `:compass` when the
 * edge named them. A node's name may itself hold a colon (`"a:b"` is a
 * valid quoted name), so the longest prefix that names a node wins.
 *
 * @param end - One side of the title
 * @param names - Every node's name
 * @returns The node's name, or null when the end names none
 */
function resolveEnd(end: string, names: Set<string>): string | null {
  if (names.has(end)) {
    return end;
  }
  for (let at = end.lastIndexOf(':'); at > 0; at = end.lastIndexOf(':', at - 1)) {
    const name = end.slice(0, at);
    if (names.has(name)) {
      return name;
    }
  }
  return null;
}

/**
 * Splits an edge's title into the two nodes it joins.
 *
 * A quoted name may hold `->` or `--` itself, so every place the operator
 * appears is tried, and the first split whose sides both name a node is
 * taken.
 *
 * @param title - The edge's title, e.g. `a->b` or `a:out--b`
 * @param names - Every node's name
 * @returns The ends and whether the edge is directed, or null when no split
 *   names two nodes
 */
export function splitEdgeTitle(
  title: string,
  names: Set<string>,
): { tail: string; head: string; directed: boolean } | null {
  for (const operator of ['->', '--']) {
    for (let at = title.indexOf(operator); at >= 0; at = title.indexOf(operator, at + 1)) {
      const tail = resolveEnd(title.slice(0, at), names);
      const head = resolveEnd(title.slice(at + operator.length), names);
      if (tail !== null && head !== null) {
        return { tail, head, directed: operator === '->' };
      }
    }
  }
  return null;
}

/**
 * What a cluster that draws no label is called: its name without the
 * `cluster` prefix Graphviz requires of it (`cluster_build` is `build`).
 *
 * @param name - The subgraph's name
 * @returns The name to announce
 */
function clusterName(name: string): string {
  return name.replace(/^cluster[\s_-]*/i, '') || name;
}

/**
 * The clusters drawn around a point, outermost first.
 *
 * Graphviz never lets two clusters overlap unless one holds the other, so
 * every cluster whose outline holds the point holds it, and the larger of
 * two holds the smaller.
 *
 * @param x - The point's x
 * @param y - The point's y
 * @param outlines - Each cluster with its outline
 * @returns The clusters holding the point
 */
function clustersAround(
  x: number,
  y: number,
  outlines: { cluster: GraphvizCluster; bounds: Bounds }[],
): GraphvizCluster[] {
  return outlines
    .filter(({ bounds }) => contains(bounds, x, y))
    .sort((a, b) => areaOf(b.bounds) - areaOf(a.bounds))
    .map(({ cluster }) => cluster);
}

/**
 * The centre of an element's box, or null when it draws nothing.
 *
 * @param element - A node or cluster group
 * @param shapesOnly - Whether to leave its text out
 * @returns The centre
 */
function centreOf(element: Element, shapesOnly = false): [number, number] | null {
  const bounds = boundsOf(element, shapesOnly);
  return bounds === null ? null : [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}

/**
 * Puts each node and cluster inside the clusters drawn around it.
 *
 * @param nodes - The nodes, whose paths are filled in
 * @param clusters - The clusters, whose paths are filled in
 */
function nestInClusters(nodes: GraphvizNode[], clusters: GraphvizCluster[]): void {
  const outlines = clusters.flatMap((cluster) => {
    const bounds = boundsOf(cluster.element, true);
    return bounds === null ? [] : [{ cluster, bounds }];
  });
  for (const cluster of clusters) {
    const centre = centreOf(cluster.element, true);
    if (centre !== null) {
      cluster.path = clustersAround(centre[0], centre[1], outlines)
        .filter(around => around !== cluster)
        .map(around => around.label);
    }
  }
  for (const node of nodes) {
    const centre = centreOf(node.element);
    if (centre !== null) {
      node.path = clustersAround(centre[0], centre[1], outlines).map(around => around.label);
    }
  }
}

/**
 * Reads a Graphviz drawing's nodes, clusters and edges.
 *
 * @param svg - The drawing
 * @returns What it shows
 * @throws Error when the SVG is not a Graphviz drawing
 */
export function readGraphviz(svg: Element): GraphvizGraph {
  const graph = graphGroup(svg);
  if (graph === null || !isGraphvizSvg(svg)) {
    throw new Error('[maidr/graphviz] The SVG is not a Graphviz drawing: it has no <g id="graph0" class="graph">.');
  }

  const nodes: GraphvizNode[] = [];
  const clusters: GraphvizCluster[] = [];
  const edgeGroups: Element[] = [];
  const labelTexts: Element[] = [];
  for (const child of graph.children) {
    if (isGroup(child, 'node')) {
      const name = ownTitle(child);
      if (name !== null) {
        nodes.push({ name, label: textOf(child.querySelectorAll('text')), path: [], element: child });
      }
    } else if (isGroup(child, 'cluster')) {
      const name = ownTitle(child) ?? '';
      const label = textOf(child.querySelectorAll('text')) || clusterName(name);
      clusters.push({ name, label, path: [], element: child });
    } else if (isGroup(child, 'edge')) {
      edgeGroups.push(child);
    } else if (child.localName === 'text') {
      // The graph's own label is the only text drawn straight into the
      // graph group; a cluster's sits in the cluster's group.
      labelTexts.push(child);
    }
  }

  nestInClusters(nodes, clusters);

  const names = new Set(nodes.map(node => node.name));
  const edges: GraphvizEdge[] = [];
  for (const element of edgeGroups) {
    const ends = splitEdgeTitle(ownTitle(element) ?? '', names);
    if (ends === null) {
      continue;
    }
    const label = textOf(element.querySelectorAll('text'));
    edges.push({ ...ends, ...(label ? { label } : {}), element });
  }

  const label = textOf(labelTexts);
  return { ...(label ? { label } : {}), nodes, clusters, edges };
}
