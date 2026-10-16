/**
 * Types for the Graphviz adapter.
 */

/** Options for the figure a Graphviz drawing becomes. */
export interface GraphvizAdapterOptions {
  /**
   * The figure's id. Defaults to the SVG's own id, which the adapter sets
   * when the drawing has none.
   */
  id?: string;
  /**
   * The figure's title. Defaults to the graph's `label`, when it has one.
   * Graphviz draws the graph's name (`digraph Pipeline`) nowhere a sighted
   * reader sees it, so the name is never used.
   */
  title?: string;
  /** The figure's subtitle. */
  subtitle?: string;
  /** The figure's caption. */
  caption?: string;
  /**
   * What a node is on this graph -- `Step`, `State`, `Module` -- announced
   * as the node noun. Defaults to MAIDR's own word for a node.
   */
  nodeLabel?: string;
}

/** One node Graphviz drew: a `<g class="node">`. */
export interface GraphvizNode {
  /** The node's name in the DOT source, which edges name it by. */
  name: string;
  /**
   * What the drawing says on the node: its `<text>` elements, in drawing
   * order, joined by spaces. Empty for a node drawn with no text, such as
   * `shape=point`.
   */
  label: string;
  /** The node's group. */
  element: Element;
}

/** One edge Graphviz drew: a `<g class="edge">`. */
export interface GraphvizEdge {
  /** The name of the node the edge leaves. */
  tail: string;
  /** The name of the node it arrives at. */
  head: string;
  /** Whether it was written `->` (a `digraph`) rather than `--` (a `graph`). */
  directed: boolean;
  /**
   * What the drawing says on the edge -- its `label`, `xlabel`, `headlabel`
   * and `taillabel` as drawn -- joined by spaces, or undefined when it says
   * nothing.
   */
  label?: string;
  /** The edge's group. */
  element: Element;
}

/** What the adapter read from one Graphviz drawing. */
export interface GraphvizGraph {
  /** The graph's `label`, as drawn, or undefined when it has none. */
  label?: string;
  /** Every node, in drawing order. */
  nodes: GraphvizNode[];
  /** Every edge between two of those nodes, in drawing order. */
  edges: GraphvizEdge[];
}
