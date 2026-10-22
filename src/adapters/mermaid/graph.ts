/**
 * Builds a `directed_graph` layer from the nodes, groups and edges of a
 * Mermaid diagram.
 *
 * Most Mermaid diagrams are boxes joined by arrows -- flowcharts, state,
 * class, entity-relationship, requirement, use case, C4, block, architecture
 * and git graphs -- and differ only in what a box and an arrow carry. Each
 * converter reads its own database into the shape here, and this module does
 * the part they share: nesting nodes in their groups, pointing every edge at
 * the node it arrives at, and pairing nodes with their drawn elements.
 */

import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import type { DiagramContext } from './types';
import { TraceType } from '@type/grammar';
import { selectorsFor } from './read';

/** One box of a diagram. */
export interface GraphNode {
  id: string;
  /** What it is announced as. Defaults to `id`. */
  label?: string;
  /** The group it sits in, by the group's id. */
  parent?: string;
  /** Anything else the reader should hear about it. */
  attributes?: Record<string, string | number>;
  /** The element Mermaid drew for it, when it was found. */
  element?: Element | null;
}

/** A group nodes are drawn inside: a subgraph, a boundary, a namespace. */
export interface GraphGroup {
  id: string;
  label?: string;
  /** The group it sits in, by that group's id. */
  parent?: string;
}

/** One arrow of a diagram. */
export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

/** What {@link directedGraphLayer} reads. */
export interface GraphParts {
  nodes: GraphNode[];
  groups?: GraphGroup[];
  edges: GraphEdge[];
  /** What a node is called on this diagram: `State`, `Class`, `Entity`. */
  nodeLabel?: string;
  /** The layer's name, when the figure has several. */
  name?: string;
}

/**
 * The path of group labels from the outermost group down to the one given.
 *
 * @param group - The innermost group's id
 * @param groups - Every group, by id
 * @returns The labels, outermost first
 */
function pathOf(group: string | undefined, groups: Map<string, GraphGroup>): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  for (let at = group; at !== undefined && !seen.has(at); at = groups.get(at)?.parent) {
    seen.add(at);
    const one = groups.get(at);
    if (one === undefined) {
      break;
    }
    path.unshift(one.label?.trim() || one.id);
  }
  return path;
}

/**
 * Builds the layer.
 *
 * An edge that starts or ends on a group -- `subgraph --> node` in a
 * flowchart, a transition into a composite state -- is drawn from the group
 * as a whole, so it is read as an edge from the nodes the group ends on, or
 * to the nodes it starts on. A group no node sits
 * in has nothing to open and is left out, as a directed graph derives its
 * scopes from its nodes.
 *
 * @param context - The diagram being converted
 * @param parts - Its nodes, groups and edges
 * @returns The layer, or null when the diagram has no nodes
 */
export function directedGraphLayer(context: DiagramContext, parts: GraphParts): MaidrLayer | null {
  const nodes = parts.nodes;
  if (nodes.length === 0) {
    return null;
  }
  const groups = new Map((parts.groups ?? []).map(group => [group.id, group]));
  const nodeIds = new Set(nodes.map(node => node.id));

  // Every node inside each group, however deep.
  const members = new Map<string, string[]>();
  for (const node of nodes) {
    const seen = new Set<string>();
    for (let at = node.parent; at !== undefined && !seen.has(at); at = groups.get(at)?.parent) {
      seen.add(at);
      const list = members.get(at) ?? [];
      list.push(node.id);
      members.set(at, list);
    }
  }
  // Within each group, which members an edge from outside enters on (those
  // nothing inside the group feeds) and which it leaves from (those that
  // feed nothing inside it): entering a composite state is entering its
  // initial states, and an edge out of a subgraph leaves from its last step.
  // A group that ends in a loop has no member feeding nothing: an edge out
  // of it leaves from every member something inside leads to, never from
  // the initial state only an edge from outside enters. Likewise an edge
  // into a group that starts in a loop enters every member leading on
  // inside, never its final state.
  const inner = parts.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const boundary = (group: string, side: 'entry' | 'exit'): string[] => {
    const inside = new Set(members.get(group) ?? []);
    // Whether an edge between two members arrives at this one, or leaves it.
    const linked = (id: string, arriving: boolean): boolean => inner.some(edge => inside.has(edge.from)
      && inside.has(edge.to) && edge.from !== edge.to && (arriving ? edge.to === id : edge.from === id));
    const open = [...inside].filter(id => !linked(id, side === 'entry'));
    return open.length > 0 ? open : [...inside].filter(id => linked(id, side === 'exit'));
  };
  const ends = (id: string, side: 'entry' | 'exit'): string[] =>
    nodeIds.has(id) ? [id] : boundary(id, side);

  const inputs = new Map<string, { ids: string[]; labels: (string | null)[] }>();
  for (const edge of parts.edges) {
    for (const from of ends(edge.from, 'exit')) {
      for (const to of ends(edge.to, 'entry')) {
        const entry = inputs.get(to) ?? { ids: [], labels: [] };
        entry.ids.push(from);
        entry.labels.push(edge.label?.trim() || null);
        inputs.set(to, entry);
      }
    }
  }

  const data: DirectedGraphPoint[] = nodes.map((node) => {
    const point: DirectedGraphPoint = { id: node.id };
    if (node.label !== undefined && node.label !== node.id) {
      point.label = node.label === '' ? node.id : node.label;
    }
    const path = pathOf(node.parent, groups);
    if (path.length > 0) {
      point.path = path;
    }
    const entry = inputs.get(node.id);
    if (entry) {
      point.inputs = entry.ids;
      if (entry.labels.some(label => label !== null)) {
        point.inputLabels = entry.labels;
      }
    }
    const attributes = Object.entries(node.attributes ?? {})
      .filter(([, value]) => value !== '' && value !== undefined);
    if (attributes.length > 0) {
      point.attributes = Object.fromEntries(attributes);
    }
    return point;
  });

  const selectors = selectorsFor(nodes.map(node => node.element));
  return {
    id: context.layerId('graph'),
    type: TraceType.DIRECTED_GRAPH,
    ...(parts.name ? { name: parts.name } : {}),
    ...(parts.nodeLabel ? { axes: { x: { label: parts.nodeLabel } } } : {}),
    ...(selectors ? { selectors } : {}),
    data,
  };
}
