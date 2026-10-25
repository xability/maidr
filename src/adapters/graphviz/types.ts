/**
 * Types for the Graphviz adapter.
 */

import type { Locale } from '@util/i18n/locale';

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
  /**
   * The Graphviz layout that drew the graph, when it changes what the
   * drawing means. `'patchwork'` -- the layout that draws each node as a
   * rectangle whose area is its `area` attribute, packed inside its
   * clusters -- reads the drawing as a treemap. The SVG does not say which
   * layout drew it, so this is the caller's to say.
   */
  layout?: 'patchwork';
  /**
   * The language of the one word the adapter writes itself, `Area`, which a
   * patchwork drawing's magnitude is announced as. Everything else is read
   * from the drawing as written.
   *
   * Defaults to the language MAIDR speaks to the reader: the one they chose
   * in its settings, or else their browser's. A figure converted in that
   * language follows it when the reader changes it; one given a language
   * here keeps it.
   */
  language?: Locale;
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
  /**
   * The clusters the node is drawn inside, by their labels, outermost first.
   * Empty for a node outside every cluster.
   */
  path: string[];
  /** The node's group. */
  element: Element;
}

/** One cluster Graphviz drew: a `<g class="cluster">`, a `subgraph cluster_*`. */
export interface GraphvizCluster {
  /** The subgraph's name in the DOT source, such as `cluster_build`. */
  name: string;
  /**
   * What the cluster is called: its drawn label, or, when it draws none, its
   * name without the `cluster` prefix Graphviz requires.
   */
  label: string;
  /**
   * The labels of the clusters it is drawn inside, outermost first. Empty
   * for a cluster at the top level.
   */
  path: string[];
  /** The cluster's group. */
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
  /** Every cluster, in drawing order, which puts each before those inside it. */
  clusters: GraphvizCluster[];
  /** Every edge between two of those nodes, in drawing order. */
  edges: GraphvizEdge[];
}
