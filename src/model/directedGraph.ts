import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import type { Coordinate, MovableDirection, Node } from '@type/movable';
import type { PointCloudHighlightable, XValue } from '@type/navigation';
import type {
  ChartObject,
  ChartObjectList,
  ObjectFilterOption,
  ObjectMeasure,
  ObjectSortOption,
} from '@type/objectList';
import type {
  AudioState,
  BrailleState,
  DescriptionState,
  HighlightState,
  TextAside,
  TextState,
  TraceEmptyState,
  TraceState,
} from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { centrality, withinCentralityBudget } from '@util/graphCentrality';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { findNamedCell } from '@util/navigation';
import {
  chartOrderSort,
  counter,
  measureSort,
  measureVaries,
  nameSort,
  offerFilters,
} from '@util/objectList';
import { Svg } from '@util/svg';
import { AbstractTrace, named } from './abstract';
import { MovableGraph } from './movable';

/** The two rotor units' keys, which the trace recognises a move request by. */
const OUT_ROTOR_KEY = 'outputs';
const IN_ROTOR_KEY = 'inputs';

/**
 * Rotor unit that steps along the edges leaving the current node.
 *
 * Built per call rather than held as a constant, because its words are
 * translated and the trace outlives a language change.
 *
 * @returns The unit, named in the active language
 */
function outRotorUnit(): RotorFilterUnit {
  return {
    key: OUT_ROTOR_KEY,
    label: t('model.rotorUnitOutputs'),
    noun: t('model.rotorNounOutputNodes'),
  };
}

/**
 * Rotor unit that steps back along the edges arriving at the current node.
 *
 * @returns The unit, named in the active language
 */
function inRotorUnit(): RotorFilterUnit {
  return {
    key: IN_ROTOR_KEY,
    label: t('model.rotorUnitInputs'),
    noun: t('model.rotorNounInputNodes'),
  };
}

/** How many neighbours a move names before it says how many more there are. */
const NAMED_NEIGHBOURS = 3;

/** How many names a description list gives before it stops. */
const NAMED_NODES = 5;

/** What the breadcrumb and a qualified name are joined with. */
const PATH_JOIN = ' > ';

/** How many numeric attributes the object list offers a sort by. */
const SORTED_ATTRIBUTES = 3;

/** How many other attributes it offers filters by, one per shared value. */
const FILTERED_ATTRIBUTES = 2;

/**
 * What a string attribute has to spell to count as a number: a plain decimal.
 * `(None, 32)` and `1e3` do not, so a column of shapes is never read as a
 * measure.
 */
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/**
 * The object list's filter ids: everything upstream and downstream of the
 * item under the cursor, then the roles a move announces, then the scopes.
 * A level's and an attribute value's are built by the functions below.
 */
const UPSTREAM_OF_CURRENT = 'upstream-of-current';
const DOWNSTREAM_OF_CURRENT = 'downstream-of-current';
const GRAPH_INPUTS = 'graph-inputs';
const GRAPH_OUTPUTS = 'graph-outputs';
const BRANCH_POINTS = 'branch-points';
const MERGE_POINTS = 'merge-points';
const NOT_CONNECTED = 'not-connected';
const SCOPES = 'scopes';

/**
 * The object list's filter id for one nesting level.
 *
 * @param depth - The level's depth, the top level at zero
 * @returns The id
 */
function levelFilterId(depth: number): string {
  return `level-${depth + 1}`;
}

/**
 * The object list's measure id for a numeric attribute.
 *
 * @param key - The attribute
 * @returns The id
 */
function attributeMeasureId(key: string): string {
  return `attr:${key}`;
}

/**
 * The object list's filter id for the nodes sharing one attribute value.
 *
 * @param key - The attribute
 * @param value - The value, as announced
 * @returns The id
 */
function attributeFilterId(key: string, value: string): string {
  return JSON.stringify(['attribute', key, value]);
}

/**
 * An attribute value as the object list sorts it.
 *
 * @param value - The declared value
 * @returns Its number, or null when it is not one
 */
function attributeNumber(value: string | number | boolean): number | null {
  if (typeof value === 'number') {
    return value;
  }
  return typeof value === 'string' && DECIMAL.test(value) ? Number(value) : null;
}

/**
 * What a graph calls its nodes when the layer names no x axis.
 *
 * @returns The label in the active language
 */
function nodeAxis(): string {
  return t('model.tableNode');
}

/**
 * One item the cursor can stand on: a declared node, or a scope that holds
 * some.
 *
 * Addressed `(depth, index-at-that-depth)` exactly as a {@link TreemapTrace}
 * node is, so the same {@link MovableGraph} walks it. Its `inputs` and
 * `outputs` are the items at the far end of each edge **as the reader sees
 * them from here**: an edge into a scope the reader has not opened arrives at
 * that scope, which is how TensorBoard draws the same edge.
 */
interface GraphItem {
  /** A declared node, or a scope derived from the nodes' paths. */
  kind: 'node' | 'scope';
  /** What it is called: a node's label, or the scope's own path segment. */
  name: string;
  /** How deep it sits, a top-level item at zero. */
  depth: number;
  /** Its position among every item at that depth. */
  index: number;
  /** The scope it sits in, or null at the top level. */
  parent: GraphItem | null;
  /** What it holds, in topological order. Empty for a node. */
  children: GraphItem[];
  /** Index into the declared array, or null for a scope. */
  source: number | null;
  /** Every declared node at or under it, as indices into the array. */
  members: number[];
  /** Earliest position in the topological order among its members. */
  rank: number;
  /** Items feeding it, each named as seen from here, in rank order. */
  inputs: GraphItem[];
  /** Items it feeds, each named as seen from here, in rank order. */
  outputs: GraphItem[];
  /** The declared attributes, as announced. */
  attributes: [string, string][];
}

/**
 * Trace implementation for directed graphs nested in scopes -- the
 * architecture of a neural network, or any other computation graph.
 *
 * A {@link NetworkTrace} reads an undirected graph by degree. A model graph
 * is read for other questions: what feeds this layer and what it feeds, where
 * the data branches and where it merges (a skip connection, a multi-input
 * model), and -- because a real graph runs to hundreds of ops -- which block
 * a layer belongs to. A two-hundred-op graph is legible only as ten blocks.
 *
 * **The scopes navigate as a tree, on the keys a tree already uses.** A
 * scope is an item of its own, collapsed: **down** opens it onto its first
 * member, **up** closes it again by returning to the scope. That is the
 * {@link TreemapTrace} interaction, and a reader enters at the top level with
 * every scope closed, which is the ten-block view.
 *
 * **Left and right walk the items of one scope in topological order, input
 * to output.** A sibling is never stranded, whatever the edges do, which is
 * the guarantee {@link NetworkTrace} keeps for the same reason; and on the
 * chain most of a model graph is, the next item in that order is the one the
 * data flows to. Where it is not -- the second arm of a branch -- every move
 * names what the node is fed from, so a step between parallel arms is heard
 * as one.
 *
 * **Following an edge is the rotor**, as it is on a sankey: the Outputs unit
 * steps along the edges leaving the node, downstream, and the Inputs unit back
 * along the edges arriving at it, upstream. An edge into a closed scope lands
 * on the scope.
 *
 * **What a move announces** is the node, its connections as `2 inputs, 1
 * output`, whether it is a graph input or output or a branch or merge point,
 * the names on either side, the producer's attributes, and its place in the
 * scope's order.
 */
export class DirectedGraphTrace extends AbstractTrace implements PointCloudHighlightable {
  /**
   * No go-to-extrema dialog: the graph inputs and outputs are named in the
   * description and every item is one arrow from its siblings. Leaving it true
   * without targets is the keyboard trap `extremaContract` guards against.
   */
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGraph;

  /** The declared points, in declared order. */
  private readonly points: DirectedGraphPoint[];

  /** Each declared node's own item, in declared order. */
  private readonly nodeItems: GraphItem[];

  /** Every item, by depth and then position within it. */
  private readonly levels: GraphItem[][];

  /** The top-level items, in topological order. */
  private readonly roots: GraphItem[];

  /** The declared nodes in topological order, as indices. */
  private readonly order: number[];

  /** Whether the edges form a cycle as drawn, so the order is not topological throughout. */
  private readonly cyclic: boolean;

  /** How many edges the layer's edges are drawn as. */
  private readonly edgeCount: number;

  /** Each labelled edge's label, keyed `from>to` by declared index. */
  private readonly edgeLabels: Map<string, string>;

  /**
   * Each edge's declarations, keyed `from>to` by declared index, by the drawn
   * edge they are part of: its id (`inputEdges`), or `''` for those declared
   * without one, which are one edge between them. Each holds the distinct
   * labels those declarations gave, in declared order.
   */
  private readonly drawnEdges: Map<string, Map<string, string[]>>;

  /** Each declared node's successors, as indices, in declared order. */
  private readonly successors: number[][];

  /** And its predecessors. */
  private readonly predecessors: number[][];

  /** Connections per item, shaped as `levels`, which the modalities read. */
  private readonly degrees: number[][];

  private readonly minDegree: number;
  private readonly maxDegree: number;

  /**
   * The edge walk in progress: whose edges, which way, how far along, and
   * where the last step left the cursor. Every move the walk did not make
   * itself ends it -- see {@link DirectedGraphTrace.moveOnce} -- and the
   * cursor's place is checked as well, for a cursor set from outside.
   */
  private edgeWalk: {
    from: GraphItem;
    along: 'outputs' | 'inputs';
    index: number;
    at: Coordinate;
  } | null = null;

  /**
   * Each listed item's betweenness, in the object list's order, once a sort
   * has asked for it: a walk from every declared node, paid for on the press
   * that chooses the sort rather than on every `o`, and once, since the graph
   * never changes under a trace.
   */
  private betweennessByObject: number[] | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new directed graph trace.
   *
   * @param layer - The MAIDR layer carrying the nodes
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as DirectedGraphPoint[];
    const { successors, predecessors, edges, labels, drawn } = DirectedGraphTrace.resolveEdges(this.points);
    this.successors = successors;
    this.predecessors = predecessors;
    this.edgeCount = edges;
    this.edgeLabels = labels;
    this.drawnEdges = drawn;

    this.order = DirectedGraphTrace.topologicalOrder(successors, predecessors);
    this.cyclic = DirectedGraphTrace.hasCycle(successors, drawn);
    const rank: number[] = Array.from({ length: this.points.length }, () => 0);
    this.order.forEach((node, at) => {
      rank[node] = at;
    });

    const { roots, nodeItems } = DirectedGraphTrace.buildScopes(this.points, rank);
    this.roots = roots;
    this.nodeItems = nodeItems;
    this.connectItems();
    DirectedGraphTrace.sortSiblings(this.roots);
    this.levels = this.placeItems();

    this.degrees = this.levels.map(level =>
      level.map(item => item.inputs.length + item.outputs.length));
    const flat = this.degrees.flat();
    this.minDegree = MathUtil.safeMin(flat);
    this.maxDegree = MathUtil.safeMax(flat);

    this.highlightValues = this.mapToSvgElements(layer.selectors, this.points.length);
    this.movable = new MovableGraph(this.buildGraph());
  }

  /**
   * Resolves each node's `inputs` into edges between declared nodes.
   *
   * An input naming no declared node is dropped, as is a node naming itself:
   * neither is an edge the reader can follow anywhere. An edge declared twice
   * counts once, and carries every distinct label its declarations gave it,
   * in declared order: a flowchart's `A -->|yes| B` and `A -->|retry| B` are
   * one edge the reader hears as `B (yes; retry)`. The semicolon keeps them
   * apart from the commas of the neighbour list.
   *
   * Edges are counted as the diagram draws them. The edges a layer says are
   * one drawn edge (`inputEdges`) -- a line declared once from each end, an
   * edge out of a scope declared from each node it leaves -- count once
   * between them, and every other edge counts by itself, beside any drawn
   * edge that joins the same two nodes.
   *
   * @param points - The declared nodes
   * @returns Successors and predecessors per node, the edge count, each
   *   labelled edge's labels keyed by `from>to`, and each edge's
   *   declarations by the drawn edge they are part of, keyed the same way
   */
  private static resolveEdges(points: DirectedGraphPoint[]): {
    successors: number[][];
    predecessors: number[][];
    edges: number;
    labels: Map<string, string>;
    drawn: Map<string, Map<string, string[]>>;
  } {
    const byId = new Map<string, number>();
    points.forEach((point, at) => {
      const id = String(point.id);
      // First declaration wins, so a repeated id cannot redirect edges that
      // already named the first.
      if (!byId.has(id)) {
        byId.set(id, at);
      }
    });

    const successors: number[][] = points.map(() => []);
    const predecessors: number[][] = points.map(() => []);
    const named = new Map<string, string[]>();
    const drawn = new Map<string, Map<string, string[]>>();
    points.forEach((point, to) => {
      (point.inputs ?? []).forEach((input, slot) => {
        const from = byId.get(String(input));
        if (from === undefined || from === to) {
          return;
        }
        const key = `${from}>${to}`;
        let parts = drawn.get(key);
        if (parts === undefined) {
          parts = new Map<string, string[]>();
          drawn.set(key, parts);
          successors[from].push(to);
          predecessors[to].push(from);
        }
        const label = String(point.inputLabels?.[slot] ?? '').trim();
        const edge = String(point.inputEdges?.[slot] ?? '').trim();
        const known = named.get(key) ?? [];
        const given = parts.get(edge) ?? [];
        parts.set(edge, given);
        if (label !== '' && !known.includes(label)) {
          named.set(key, [...known, label]);
        }
        if (label !== '' && !given.includes(label)) {
          given.push(label);
        }
      });
    });
    const labels = new Map<string, string>();
    named.forEach((names, key) => labels.set(key, names.join('; ')));

    // Each drawn edge an id names once, and the edges declared without one
    // once for each two nodes they join.
    const ids = new Set<string>();
    let unnamed = 0;
    drawn.forEach(parts => parts.forEach((_, edge) => {
      if (edge === '') {
        unnamed++;
      } else {
        ids.add(edge);
      }
    }));
    return { successors, predecessors, edges: ids.size + unnamed, labels, drawn };
  }

  /**
   * Whether the edges form a cycle, reading a line declared each way as the
   * one line it is drawn as.
   *
   * A line with no arrow, or an arrow at each end, is declared as an edge
   * each way sharing one drawn edge (`inputEdges`), and those two edges are a
   * cycle only by declaration: the diagram draws a single line. So each such
   * pair is read as a line, and the graph has a cycle when its lines close a
   * loop among themselves, two drawn between the same nodes included, or
   * when the one-way edges, with every group of nodes the lines join taken
   * as one, still do: a one-way edge between two nodes the lines already
   * join closes a loop with them, and so does a chain of one-way edges that
   * returns to where it started.
   *
   * @param successors - Each node's successors
   * @param drawn - Each edge's declarations by the drawn edge they are part
   *   of, keyed `from>to`
   * @returns True when the graph has a cycle as drawn
   */
  private static hasCycle(successors: number[][], drawn: Map<string, Map<string, string[]>>): boolean {
    const group = successors.map((_, node) => node);
    const find = (node: number): number => {
      let root = node;
      while (group[root] !== root) {
        root = group[root];
      }
      group[node] = root;
      return root;
    };

    const parts = (from: number, to: number): string[] => [...(drawn.get(`${from}>${to}`)?.keys() ?? [])];
    // The lines between two nodes: the drawn edges declared each way.
    const lines = (from: number, to: number): string[] => {
      const back = parts(to, from);
      return parts(from, to).filter(edge => edge !== '' && back.includes(edge));
    };
    // Whether an edge is also drawn one way: declared without an id, or with
    // one not declared back.
    const oneWay = (from: number, to: number): boolean => {
      const back = parts(to, from);
      return parts(from, to).some(edge => edge === '' || !back.includes(edge));
    };

    // The lines: a loop of them is a cycle, as two between the same nodes
    // are; otherwise each joins its ends into one group.
    for (let from = 0; from < successors.length; from++) {
      for (const to of successors[from]) {
        const between = from < to ? lines(from, to).length : 0;
        if (between === 0) {
          continue;
        }
        const [a, b] = [find(from), find(to)];
        if (a === b || between > 1) {
          return true;
        }
        group[b] = a;
      }
    }

    // The one-way edges between the groups, ordered as Kahn's algorithm
    // orders nodes: any left over are on a cycle.
    const waiting = new Map<number, number>();
    const next = new Map<number, number[]>();
    for (let from = 0; from < successors.length; from++) {
      waiting.set(find(from), waiting.get(find(from)) ?? 0);
      for (const to of successors[from]) {
        if (!oneWay(from, to)) {
          continue;
        }
        const [a, b] = [find(from), find(to)];
        if (a === b) {
          return true;
        }
        const list = next.get(a);
        if (list === undefined) {
          next.set(a, [b]);
        } else {
          list.push(b);
        }
        waiting.set(b, (waiting.get(b) ?? 0) + 1);
      }
    }
    const ready = [...waiting].filter(([, count]) => count === 0).map(([one]) => one);
    let placed = 0;
    while (ready.length > 0) {
      const one = ready.pop() as number;
      placed++;
      for (const after of next.get(one) ?? []) {
        const count = (waiting.get(after) ?? 0) - 1;
        waiting.set(after, count);
        if (count === 0) {
          ready.push(after);
        }
      }
    }
    return placed < waiting.size;
  }

  /**
   * Orders the declared nodes so that every edge points forward: inputs
   * first, outputs last.
   *
   * Kahn's algorithm, taking ready nodes in declared order. A cycle leaves
   * nodes that never become ready; they follow in declared order, and the
   * description says the order is not topological throughout rather than
   * claim one the data does not have -- see {@link hasCycle}, which does not
   * count a line declared each way as one, as nothing about such a line says
   * which end comes first.
   *
   * @param successors - Each node's successors
   * @param predecessors - Each node's predecessors
   * @returns The order
   */
  private static topologicalOrder(
    successors: number[][],
    predecessors: number[][],
  ): number[] {
    const waiting = predecessors.map(list => list.length);
    const ready = new MinQueue();
    waiting.forEach((count, node) => {
      if (count === 0) {
        ready.push(node, node);
      }
    });

    const order: number[] = [];
    const placed = new Set<number>();
    while (ready.size > 0) {
      const node = ready.pop();
      order.push(node);
      placed.add(node);
      for (const next of successors[node]) {
        waiting[next]--;
        if (waiting[next] === 0) {
          ready.push(next, next);
        }
      }
    }

    for (let node = 0; node < successors.length; node++) {
      if (!placed.has(node)) {
        order.push(node);
      }
    }
    return order;
  }

  /**
   * Builds the scope tree from the nodes' paths.
   *
   * Every scope a path names exists whether or not anything declared it, so
   * a producer emits only its nodes -- the treemap's reasoning, which is also
   * what a name scope is.
   *
   * @param points - The declared nodes
   * @param rank - Each node's position in the topological order
   * @returns The top-level items, and each declared node's own item
   */
  private static buildScopes(
    points: DirectedGraphPoint[],
    rank: number[],
  ): { roots: GraphItem[]; nodeItems: GraphItem[] } {
    const roots: GraphItem[] = [];
    const scopes = new Map<string, GraphItem>();

    const item = (
      kind: GraphItem['kind'],
      name: string,
      parent: GraphItem | null,
      source: number | null,
    ): GraphItem => {
      const made: GraphItem = {
        kind,
        name,
        depth: 0,
        index: 0,
        parent,
        children: [],
        source,
        members: [],
        rank: Number.POSITIVE_INFINITY,
        inputs: [],
        outputs: [],
        attributes: [],
      };
      (parent?.children ?? roots).push(made);
      return made;
    };

    const nodeItems = points.map((point, at) => {
      let parent: GraphItem | null = null;
      const path = (point.path ?? []).map(String);
      for (let depth = 0; depth < path.length; depth++) {
        // Keyed by the whole path, so two scopes sharing a name under
        // different parents stay two scopes.
        const key = JSON.stringify(path.slice(0, depth + 1));
        parent = scopes.get(key) ?? (() => {
          const scope = item('scope', path[depth], parent, null);
          scopes.set(key, scope);
          return scope;
        })();
      }
      const node = item('node', String(point.label ?? point.id), parent, at);
      node.attributes = Object.entries(point.attributes ?? {})
        .map(([key, value]) => [key, String(value)]);

      // Every enclosing scope holds this node and starts no later than it.
      for (let at2: GraphItem | null = node; at2 !== null; at2 = at2.parent) {
        at2.members.push(at);
        at2.rank = Math.min(at2.rank, rank[at]);
      }
      return node;
    });

    return { roots, nodeItems };
  }

  /**
   * Gives every item its inputs and outputs, as seen from where it sits.
   *
   * An edge from `u` to `v` is seen at the deepest scope holding both ends.
   * From inside that scope, each end is the item directly in it that holds
   * the node -- the node itself, or the closed scope around it. Every item on
   * the way down to `u` sees the same far end, so an op inside an open block
   * is told it feeds the next block, just as the block itself is.
   */
  private connectItems(): void {
    const chain = (item: GraphItem): GraphItem[] => {
      const out: GraphItem[] = [];
      for (let at: GraphItem | null = item; at !== null; at = at.parent) {
        out.push(at);
      }
      return out;
    };

    const outSets = new Map<GraphItem, Set<GraphItem>>();
    const inSets = new Map<GraphItem, Set<GraphItem>>();
    const add = (sets: Map<GraphItem, Set<GraphItem>>, item: GraphItem, other: GraphItem): void => {
      const set = sets.get(item) ?? new Set<GraphItem>();
      set.add(other);
      sets.set(item, set);
    };

    this.successors.forEach((targets, from) => {
      const up = chain(this.nodeItems[from]);
      for (const to of targets) {
        const down = chain(this.nodeItems[to]);
        const shared = new Set(down);
        // The deepest scope holding both, or null for the top level.
        const meet = up.find(item => item.kind === 'scope' && shared.has(item)) ?? null;
        const near = up.slice(0, up.findIndex(item => item.parent === meet) + 1);
        const far = down.slice(0, down.findIndex(item => item.parent === meet) + 1);
        const farEnd = far[far.length - 1];
        const nearEnd = near[near.length - 1];
        for (const item of near) {
          add(outSets, item, farEnd);
        }
        for (const item of far) {
          add(inSets, item, nearEnd);
        }
      }
    });

    for (const item of this.allItems(this.roots)) {
      item.outputs = [...(outSets.get(item) ?? [])].sort((a, b) => a.rank - b.rank);
      item.inputs = [...(inSets.get(item) ?? [])].sort((a, b) => a.rank - b.rank);
    }
  }

  /**
   * Every item under the given ones, depth first.
   *
   * @param items - Where to start
   * @returns The items and all of their descendants
   */
  private allItems(items: GraphItem[]): GraphItem[] {
    return items.flatMap(item => [item, ...this.allItems(item.children)]);
  }

  /**
   * Orders each scope's items so every edge between them points forward.
   *
   * Kahn's algorithm over the edges between siblings, taking the earliest
   * ready item first. Edges between siblings can form a cycle even in an
   * acyclic graph -- a block feeding a node that feeds the block back -- and
   * there the earliest remaining item is taken anyway, so the order still
   * runs input to output as nearly as the scopes allow.
   *
   * @param items - One scope's items; sorted in place, with their children
   */
  private static sortSiblings(items: GraphItem[]): void {
    const siblings = new Set(items);
    const waiting = new Map<GraphItem, number>();
    for (const item of items) {
      waiting.set(item, item.inputs.filter(one => siblings.has(one)).length);
    }

    const ready = new MinQueue();
    const position = new Map(items.map((item, at) => [item, at]));
    const byRank = [...items].sort((a, b) => a.rank - b.rank);
    for (const item of byRank) {
      if (waiting.get(item) === 0) {
        ready.push(position.get(item) as number, item.rank);
      }
    }

    const sorted: GraphItem[] = [];
    const done = new Set<GraphItem>();
    let fallback = 0;
    while (sorted.length < items.length) {
      let next: GraphItem | undefined;
      while (ready.size > 0 && next === undefined) {
        const candidate = items[ready.pop()];
        if (!done.has(candidate)) {
          next = candidate;
        }
      }
      if (next === undefined) {
        // A cycle among the siblings: take the earliest one not yet placed.
        while (done.has(byRank[fallback])) {
          fallback++;
        }
        next = byRank[fallback];
      }
      sorted.push(next);
      done.add(next);
      for (const after of next.outputs) {
        const count = waiting.get(after);
        if (count === undefined || done.has(after)) {
          continue;
        }
        waiting.set(after, count - 1);
        if (count - 1 === 0) {
          ready.push(position.get(after) as number, after.rank);
        }
      }
    }

    items.splice(0, items.length, ...sorted);
    for (const item of items) {
      DirectedGraphTrace.sortSiblings(item.children);
    }
  }

  /**
   * Assigns every item its address, level by level.
   *
   * Within a depth, items run parent by parent in each parent's own order, so
   * a scope's members sit together and in topological order.
   *
   * @returns The items, by depth then position
   */
  private placeItems(): GraphItem[][] {
    const levels: GraphItem[][] = [];
    let current = this.roots;
    while (current.length > 0) {
      const depth = levels.length;
      current.forEach((item, index) => {
        item.depth = depth;
        item.index = index;
      });
      levels.push(current);
      current = current.flatMap(item => item.children);
    }
    return levels;
  }

  /**
   * Wires the items into the graph the cursor walks.
   *
   * Up closes the scope the item is in, by returning to it; down opens a
   * scope onto its first member. Left and right are the scope's other items
   * in topological order, never a neighbour in another scope. Ctrl with them
   * goes to the first or last item of the scope, out to the top-level item
   * this one is in, or down the first line of members to the deepest -- and,
   * as at the end of a step, is refused where the item already is that
   * extreme, rather than replaying it as if the cursor had moved.
   *
   * @returns The navigation graph, addressed as the items are
   */
  private buildGraph(): (Node | null)[][] {
    const at = (item: GraphItem | null | undefined): Coordinate | null =>
      item ? { row: item.depth, col: item.index } : null;

    return this.levels.map(level =>
      level.map((item) => {
        const siblings = item.parent?.children ?? this.roots;
        const place = siblings.indexOf(item);
        let top: GraphItem | null = null;
        for (let up = item.parent; up !== null; up = up.parent) {
          top = up;
        }
        let bottom: GraphItem | null = null;
        for (let down = item.children[0]; down !== undefined; down = down.children[0]) {
          bottom = down;
        }
        return {
          up: at(item.parent),
          down: at(item.children[0]),
          left: at(siblings[place - 1]),
          right: at(siblings[place + 1]),
          start: place > 0 ? at(siblings[0]) : null,
          end: place < siblings.length - 1 ? at(siblings[siblings.length - 1]) : null,
          top: at(top),
          bottom: at(bottom),
        };
      }));
  }

  /** The item the cursor is on, when it is on one. */
  private get current(): GraphItem | null {
    return this.levels[this.row]?.[this.col] ?? null;
  }

  /**
   * The state, with where the item sits among the items of its scope and at
   * which depth of nesting, the place a tree gives its node.
   *
   * The position key read the pan, whose column is the item's place in its
   * scope and whose row its depth, and announced them as a column and a row:
   * the first step of Mermaid's flowchart example was "column 1 of 4, row 1
   * of 2", a column and a row the drawing does not have. Placed as a tree's
   * node is, it is "Level 1 of 2, Position is 1 of 4", and an item inside a
   * scope names the scope.
   *
   * @returns The trace state
   */
  public override get state(): TraceState {
    const state = super.state;
    const item = this.current;
    if (state.empty || item === null) {
      return state;
    }
    const siblings = item.parent?.children ?? this.roots;
    return {
      ...state,
      treePosition: {
        index: Math.max(0, siblings.indexOf(item)),
        count: siblings.length,
        level: item.depth,
        levels: this.levels.length,
        ...(item.parent === null ? {} : { parent: item.parent.name }),
      },
    };
  }

  /**
   * The item's name, which is what another layer of the same chart can find
   * it by. The default read a magnitude or nothing, so a layer switch landed a
   * reader on whatever came first rather than on the same item.
   *
   * @returns The name of the item under the cursor, or null off the chart
   */
  public override getCurrentXValue(): XValue | null {
    return this.current?.name ?? null;
  }

  /**
   * Moves to the item carrying a name, keeping the cursor where it is when
   * it already does (see {@link findNamedCell}).
   *
   * @param xValue - The name another layer was on
   * @returns True when a item carries it and the cursor moved there
   */
  public override moveToXValue(xValue: XValue): boolean {
    // Null when the layer left has no X: `String(null)` would find a item
    // named "null".
    if (xValue === null || xValue === undefined) {
      return false;
    }
    const at = findNamedCell(this.levels, String(xValue), this.row, this.col);
    return at !== null && this.moveToIndex(at.row, at.col);
  }

  public override hasXValue(xValue: XValue): boolean {
    return xValue !== null && xValue !== undefined
      && findNamedCell(this.levels, String(xValue), this.row, this.col) !== null;
  }

  /** What this chart calls a node, from the x axis when the layer names one. */
  private get nodeLabel(): string {
    return named(this.layer.axes?.x?.label, nodeAxis());
  }

  /**
   * The scopes an item sits in, outermost first.
   *
   * @param item - The item to trace back from
   * @returns Their names
   */
  private static pathOf(item: GraphItem): string[] {
    const names: string[] = [];
    for (let up = item.parent; up !== null; up = up.parent) {
      names.unshift(up.name);
    }
    return names;
  }

  /**
   * An item's name as heard from beside another one: bare when the two share
   * a scope, and with its path when they do not, since `conv` alone names
   * one of several.
   *
   * @param item - The item to name
   * @param from - Where the reader is
   * @returns The name to announce
   */
  private static nameFrom(item: GraphItem, from: GraphItem | null): string {
    if (from !== null && item.parent === from.parent) {
      return item.name;
    }
    return [...DirectedGraphTrace.pathOf(item), item.name].join(PATH_JOIN);
  }

  /**
   * The label of the edge between two items, when it carries one.
   *
   * A closed scope stands for every declared edge between its members and
   * the item at the far end -- see {@link DirectedGraphTrace.connectItems},
   * which is why the edges between the two items' members are exactly the
   * ones the adjacency was built from. The label is heard when they all
   * carry the same one: a flowchart's `yes` into a subgraph, a state
   * diagram's `stop` out of a composite state, which Mermaid draws once and
   * the producer expands to an edge per member. It is withheld when they
   * disagree or some carry none, so it never names only one of the edges the
   * scope stands for. Between two declared nodes there is one edge, so this
   * is that edge's label.
   *
   * @param from - The item the edge leaves
   * @param to - The item it arrives at
   * @returns The label, or undefined
   */
  private edgeLabel(from: GraphItem, to: GraphItem): string | undefined {
    const into = new Set(to.members);
    let shared: string | undefined;
    for (const source of from.members) {
      for (const target of this.successors[source]) {
        if (!into.has(target)) {
          continue;
        }
        const label = this.edgeLabels.get(`${source}>${target}`);
        if (label === undefined || (shared !== undefined && label !== shared)) {
          return undefined;
        }
        shared = label;
      }
    }
    return shared;
  }

  /**
   * A neighbour's name with the label of the edge that joins it, when the
   * edge has one.
   *
   * @param name - The neighbour's name as heard from here
   * @param label - The edge's label, if any
   * @returns The name, labelled
   */
  private static labelled(name: string, label: string | undefined): string {
    return label === undefined ? name : t('model.dagEdgeLabelled', { name, label });
  }

  /**
   * A list of neighbours' names, each with the label of its edge, cut short
   * with a count of the rest.
   *
   * @param items - The neighbours to name
   * @param from - Where the reader is
   * @param along - Whether the neighbours are the item's inputs or outputs
   * @returns The joined names
   */
  private nameList(items: GraphItem[], from: GraphItem, along: 'inputs' | 'outputs'): string {
    const shown = items.slice(0, NAMED_NEIGHBOURS)
      .map(item => DirectedGraphTrace.labelled(
        DirectedGraphTrace.nameFrom(item, from),
        along === 'inputs' ? this.edgeLabel(item, from) : this.edgeLabel(from, item),
      ))
      .join(', ');
    return items.length > NAMED_NEIGHBOURS
      ? `${shown}${t('model.networkAndMore', { count: items.length - NAMED_NEIGHBOURS })}`
      : shown;
  }

  /**
   * `2 inputs, 1 output`, in the active language.
   *
   * @param inputs - How many inputs
   * @param outputs - How many outputs
   * @returns The phrase
   */
  private static degreePhrase(inputs: number, outputs: number): string {
    return t('model.dagDegree', {
      inputs: t(inputs === 1 ? 'model.dagInputsOne' : 'model.dagInputsMany', { count: inputs }),
      outputs: t(outputs === 1 ? 'model.dagOutputsOne' : 'model.dagOutputsMany', { count: outputs }),
    });
  }

  /**
   * Whether nothing inside an item has an edge at all.
   *
   * A node with no inputs and no outputs has none. A scope with none has no
   * edge crossing its boundary, which says nothing about the edges between
   * its members: an agent flow drawn as one scope holds the whole graph, and
   * calling it not connected says the diagram has no arrows.
   *
   * @param item - The item
   * @returns True when no member has an edge
   */
  private isolated(item: GraphItem): boolean {
    return item.members.every(member =>
      this.successors[member].length === 0 && this.predecessors[member].length === 0);
  }

  /**
   * What an item is in the flow: where data enters or leaves the graph, and
   * where it branches or merges. Nothing for a link in a chain, nor for a
   * scope whose edges all stay inside it.
   *
   * @param item - The item to describe
   * @param isolated - Whether nothing inside it has an edge at all
   * @returns The role, or null
   */
  private static roleOf(item: GraphItem, isolated: boolean): string | null {
    const inputs = item.inputs.length;
    const outputs = item.outputs.length;
    if (inputs === 0 && outputs === 0) {
      return isolated ? t('model.dagRoleIsolated') : null;
    }
    const roles: string[] = [];
    if (inputs === 0) {
      roles.push(t('model.dagRoleSource'));
    }
    if (outputs === 0) {
      roles.push(t('model.dagRoleSink'));
    }
    if (inputs > 1 && outputs > 1) {
      roles.push(t('model.dagRoleMergeBranch'));
    } else if (inputs > 1) {
      roles.push(t('model.dagRoleMerge'));
    } else if (outputs > 1) {
      roles.push(t('model.dagRoleBranch'));
    }
    return roles.length > 0 ? roles.join(', ') : null;
  }

  protected get values(): number[][] {
    return this.degrees;
  }

  protected get audio(): AudioState {
    const item = this.current;
    // One scale for the chart, as on a network: a node of five connections
    // should sound like one wherever it sits, and branch and merge points --
    // the structure a reader is listening for -- rise above the chain.
    return {
      freq: {
        min: this.minDegree,
        max: this.maxDegree,
        raw: item === null ? 0 : item.inputs.length + item.outputs.length,
      },
      panning: this.panning,
    };
  }

  /**
   * Where the item sits in the stereo field: its place among the items of
   * its scope, the row Left and Right walk and "Order is i of n" counts.
   *
   * Not its index among every item at its depth, which runs across scopes:
   * a scope's members were squeezed into their slice of the field -- a git
   * graph's main branch from hard left to just right of centre, its develop
   * branch at the far right -- and an item alone in its scope was counted as
   * one of two and put hard left, where the audio service centres a lone
   * item.
   *
   * @returns The panning state
   */
  private get panning(): AudioState['panning'] {
    const item = this.current;
    const siblings = item?.parent?.children ?? this.roots;
    const place = item === null ? 0 : siblings.indexOf(item);
    return {
      x: Math.max(0, place),
      y: this.row,
      rows: this.levels.length,
      cols: siblings.length,
    };
  }

  /**
   * The boundary tone sounds where the item the reader stopped at sounds, at
   * the edge of its scope, rather than at its index across the whole depth.
   *
   * @returns The empty trace state, panned to the cursor's item
   */
  protected override get outOfBoundsState(): TraceEmptyState {
    return { empty: true, type: 'trace', traceType: this.type, audio: this.panning };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.degrees,
      min: this.degrees.map(() => this.minDegree),
      max: this.degrees.map(() => this.maxDegree),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const item = this.current;
    if (item === null) {
      return {
        main: { label: this.nodeLabel, value: '' },
        mainAxis: 'x',
        crossAxis: 'y',
      };
    }

    // None of these is a position on an axis, so they travel as asides,
    // which the text service speaks as their own clauses. Those whose value
    // is a bare name, or a list of them, keep a word of their label in terse
    // mode, so the scope, the inputs and the outputs do not run together.
    const asides: TextAside[] = [];

    const path = DirectedGraphTrace.pathOf(item);
    if (path.length > 0) {
      const joined = path.join(PATH_JOIN);
      asides.push({ label: t('model.asidePath'), value: joined, terse: t('model.tersePath', { path: joined }) });
    }

    if (item.kind === 'scope') {
      // Said first, so a reader on a closed block knows how much there is to
      // open before hearing anything else about it. The main clause already
      // calls it a scope.
      asides.push({
        label: t('model.asideScopeSize'),
        value: t(item.members.length === 1 ? 'model.dagScopeSizeOne' : 'model.dagScopeSizeMany', {
          count: item.members.length,
        }),
      });
    }

    asides.push({
      label: t('model.asideConnections'),
      value: DirectedGraphTrace.degreePhrase(item.inputs.length, item.outputs.length),
    });

    const role = DirectedGraphTrace.roleOf(item, this.isolated(item));
    if (role !== null) {
      asides.push({ label: t('model.asideRole'), value: role });
    }

    if (item.inputs.length > 0) {
      const names = this.nameList(item.inputs, item, 'inputs');
      asides.push({ label: t('model.tableFrom'), value: names, terse: t('model.terseFrom', { names }) });
    }
    if (item.outputs.length > 0) {
      const names = this.nameList(item.outputs, item, 'outputs');
      asides.push({ label: t('model.tableTo'), value: names, terse: t('model.terseTo', { names }) });
    }

    for (const [label, value] of item.attributes) {
      asides.push({ label, value });
    }

    const siblings = item.parent?.children ?? this.roots;
    if (siblings.length > 1) {
      asides.push({
        label: t('model.asideOrder'),
        value: t('model.dagOrder', { index: siblings.indexOf(item) + 1, total: siblings.length }),
      });
    }

    return {
      // The x axis names what a node is -- a step, a commit, a layer -- which
      // a scope is not: a branch announced as "Commit is main" said the
      // wrong kind before the size clause could correct it.
      main: { label: item.kind === 'scope' ? t('model.asideScope') : this.nodeLabel, value: item.name },
      mainAxis: 'x',
      crossAxis: 'y',
      asides,
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.levels.length,
      cols: this.levels[this.row]?.length ?? 0,
    };
  }

  /**
   * Offers the edges on either side of the current item.
   *
   * The arrows walk the scope in order and never follow an edge, so this is
   * where the edges are followed: Outputs downstream, Inputs upstream.
   * Withheld on a graph with no edges, where both could only answer "none".
   *
   * @returns The edge units alongside whatever else is offered
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    return this.edgeCount > 0 ? [...inherited, outRotorUnit(), inRotorUnit()] : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    const along = key === OUT_ROTOR_KEY
      ? 'outputs'
      : key === IN_ROTOR_KEY ? 'inputs' : null;
    if (along === null) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const item = this.current;
    if (item === null) {
      this.notifyRotorBounds();
      return false;
    }

    // Anchored on the item the walk started from: a step lands on another
    // item with edges of its own, and deriving the list from the cursor would
    // enumerate a different item's edges on every press.
    const walk = this.edgeWalk;
    const continuing = walk !== null
      && walk.along === along
      && walk.at.row === this.row
      && walk.at.col === this.col;
    const from = continuing && walk !== null ? walk.from : item;
    const neighbours = from[along];
    const index = continuing && walk !== null
      ? walk.index + (direction === 'right' ? 1 : -1)
      : (direction === 'right' ? 0 : neighbours.length - 1);

    const target = neighbours[index];
    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    const at = { row: target.depth, col: target.index };
    this.edgeWalk = { from, along, index, at };
    this.movable.moveToIndex(at.row, at.col);
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Ends any edge walk before a jump.
   *
   * A jump from the object list can land on the very item a walk last stepped
   * to, and the walk would then carry on through the edges of the item it
   * started from rather than of the one the reader chose. The walk's own
   * steps move the cursor directly, so they are not affected.
   *
   * @param row - The depth to move to
   * @param col - The item's position at that depth
   * @returns True when the cursor moved
   */
  public override moveToIndex(row: number, col: number): boolean {
    this.edgeWalk = null;
    return super.moveToIndex(row, col);
  }

  /**
   * Ends any edge walk before an arrow move.
   *
   * The walk knew the reader had moved off only by the cursor no longer
   * being where its last step left it, which an arrow move that comes back
   * cannot show: on In stock?, reached by an Outputs step from Order
   * received, Left then Right put the cursor back where the step had, and
   * the next Outputs step carried on through Order received's one output
   * and said In stock? had none. A reader who moves with the arrows has left
   * the walk, so the next step starts one from where they are.
   *
   * @param direction - The key's direction
   * @returns True when the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    this.edgeWalk = null;
    return super.moveOnce(direction);
  }

  /**
   * Ends any edge walk before a move to the end of a scope, for the reason
   * {@link DirectedGraphTrace.moveOnce} gives.
   *
   * @param direction - The key's direction
   * @returns True when the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    this.edgeWalk = null;
    return super.moveToExtreme(direction);
  }

  /**
   * Every item, for the `o` list: the declared nodes and the scopes holding
   * them, in outline order -- each scope followed by what it holds, siblings
   * in the order the arrows walk them, which is the tree a graph viewer shows.
   *
   * It opens on that order, because on a model graph the order is the
   * reading: input to output, block by block. Each item is listed bare, as a
   * move names it, with its scope, its connections and its role beside it --
   * what the announcement says -- and a scope with how much it holds. A list
   * that opened every scope at once has to say where `conv` is, since several
   * blocks have one.
   *
   * Betweenness is offered once the data branches or merges: on a chain it
   * would only say which nodes sit nearer the middle, which the graph order
   * already says. The producer's numeric attributes -- a parameter count --
   * sort the list, and its other attributes -- a layer type -- narrow it.
   *
   * @returns The list, or null on a graph with nothing in it
   */
  public override getObjectList(): ChartObjectList | null {
    const items = this.allItems(this.roots);
    if (items.length === 0) {
      return null;
    }

    // Only once the reader is on an item: before that the cursor's (0, 0) is
    // where the walk will start, not anything they chose.
    const current = this.isInitialEntry ? null : this.current;
    const upstream = current === null
      ? new Set<GraphItem>()
      : this.reach(current, 'inputs');
    const downstream = current === null
      ? new Set<GraphItem>()
      : this.reach(current, 'outputs');
    const { numeric, shared } = this.listedAttributes();
    const filtered = new Set(shared.map(([key]) => key));
    const keys = this.objectKeys(items);

    // How many items read alike -- the same name in the same scope -- so the
    // ones that would can be told apart by their ids.
    const alike = new Map<string, number>();
    for (const item of items) {
      const signature = DirectedGraphTrace.signatureOf(item);
      alike.set(signature, (alike.get(signature) ?? 0) + 1);
    }

    const objects = items.map((item, at): ChartObject => {
      const measures: Record<string, number> = {
        connections: item.inputs.length + item.outputs.length,
      };
      const declared = new Map(Object.entries(
        item.source === null ? {} : this.points[item.source].attributes ?? {},
      ));
      for (const key of numeric) {
        const value = declared.get(key);
        const number = value === undefined ? null : attributeNumber(value);
        if (number !== null) {
          measures[attributeMeasureId(key)] = number;
        }
      }
      return {
        key: keys[at],
        label: item.name,
        detail: this.objectDetail(item, (alike.get(DirectedGraphTrace.signatureOf(item)) ?? 0) > 1),
        row: item.depth,
        col: item.index,
        measures,
        groups: DirectedGraphTrace.objectGroups(item, this.isolated(item), upstream, downstream, filtered),
      };
    });

    const connections: ObjectMeasure = {
      id: 'connections',
      label: t('model.asideConnections'),
      spoken: true,
    };
    const betweenness: ObjectMeasure = {
      id: 'betweenness',
      label: t('model.objectMeasureBetweenness'),
      spoken: false,
    };
    const attributes: ObjectMeasure[] = numeric
      .map(key => ({ id: attributeMeasureId(key), label: key, spoken: false }))
      .filter(measure => measureVaries(objects, measure.id));
    const byConnections = measureVaries(objects, connections.id);
    // On a chain every node between the ends brokers the same single route,
    // so betweenness would only restate the graph order; it says something
    // once the data branches or merges. And only a node with something on
    // both sides of it is between anything: on a fan out of one node, every
    // node would score zero.
    const brokered = this.points.length >= 3
      && withinCentralityBudget(this.successors)
      && (this.successors.some(list => list.length > 1)
        || this.predecessors.some(list => list.length > 1))
      && this.successors.some((list, node) => list.length > 0 && this.predecessors[node].length > 0);

    const sorts: ObjectSortOption[] = [
      chartOrderSort(t('model.objectOrderGraph')),
      nameSort(),
      ...(byConnections ? [measureSort(connections, 'descending')] : []),
      ...(brokered ? [measureSort(betweenness, 'descending')] : []),
      ...attributes.map(measure => measureSort(measure, 'descending')),
    ];

    const candidates: ObjectFilterOption[] = [];
    if (current !== null) {
      candidates.push(
        { id: UPSTREAM_OF_CURRENT, label: t('model.objectFilterUpstream', { name: current.name }) },
        { id: DOWNSTREAM_OF_CURRENT, label: t('model.objectFilterDownstream', { name: current.name }) },
      );
    }
    candidates.push(
      { id: GRAPH_INPUTS, label: t('model.objectFilterGraphInputs') },
      { id: GRAPH_OUTPUTS, label: t('model.objectFilterGraphOutputs') },
      { id: BRANCH_POINTS, label: t('model.objectFilterBranchPoints') },
      { id: MERGE_POINTS, label: t('model.objectFilterMergePoints') },
      { id: NOT_CONNECTED, label: t('model.objectFilterNotConnected') },
    );
    if (this.levels.length > 1) {
      this.levels.forEach((_level, depth) => {
        candidates.push({
          id: levelFilterId(depth),
          label: t('model.objectFilterLevel', { level: depth + 1 }),
        });
      });
    }
    if (items.some(item => item.kind === 'scope')) {
      candidates.push({ id: SCOPES, label: t('model.objectFilterScopes') });
    }
    for (const [name, values] of shared) {
      for (const value of values) {
        candidates.push({
          id: attributeFilterId(name, value),
          label: t('model.objectFilterAttribute', { name, value }),
        });
      }
    }

    // The list holds the scopes as well as the nodes, and the description
    // counts the nodes alone, so the scopes are counted as scopes.
    const scopeCount = items.filter(item => item.kind === 'scope').length;
    const nodes = counter('model.objectNodesOne', 'model.objectNodesMany');
    const scopes = counter('model.objectScopesOne', 'model.objectScopesMany');
    return {
      title: t('model.objectsNodes'),
      count: scopeCount === 0
        ? nodes
        : total => t('model.objectNodesAndScopes', { nodes: nodes(total - scopeCount), scopes: scopes(scopeCount) }),
      objects,
      measures: [
        ...(byConnections ? [connections] : []),
        ...(brokered ? [betweenness] : []),
        ...attributes,
      ],
      sorts,
      filters: offerFilters(objects, candidates),
      ...(brokered ? { deferred: { betweenness: () => this.betweennessInListOrder() } } : {}),
    };
  }

  /**
   * Each item's key in the object list, from the data rather than from where
   * it sits: a node by its declared id, counted so a repeated id stays two
   * nodes, and a scope by its path, which is what makes it one scope.
   *
   * @param items - The listed items
   * @returns Their keys, in the same order
   */
  private objectKeys(items: GraphItem[]): string[] {
    const seen = new Map<string, number>();
    const occurrence = this.points.map((point) => {
      const id = String(point.id);
      const count = seen.get(id) ?? 0;
      seen.set(id, count + 1);
      return count;
    });
    return items.map(item => (item.source === null
      ? JSON.stringify(['scope', ...DirectedGraphTrace.pathOf(item), item.name])
      : JSON.stringify(['node', String(this.points[item.source].id), occurrence[item.source]])));
  }

  /**
   * What reads alike in the object list: an item's name in its scope.
   *
   * @param item - The item
   * @returns A string two items share exactly when a reader would hear them
   *   the same
   */
  private static signatureOf(item: GraphItem): string {
    return JSON.stringify([...DirectedGraphTrace.pathOf(item), item.name]);
  }

  /**
   * What the object list says beside an item's name: its scope, and then
   * what a move to it says -- how much a scope holds, its connections and its
   * role.
   *
   * @param item - The item
   * @param ambiguous - Whether another item reads the same, so the id is
   *   the only way left to tell them apart
   * @returns The detail, in the active language
   */
  private objectDetail(item: GraphItem, ambiguous: boolean): string {
    const parts: string[] = [];
    const path = DirectedGraphTrace.pathOf(item);
    if (path.length > 0) {
      parts.push(path.join(PATH_JOIN));
    }
    if (ambiguous && item.source !== null) {
      parts.push(String(this.points[item.source].id));
    }
    if (item.kind === 'scope') {
      parts.push(t(item.members.length === 1 ? 'model.dagScopeSizeOne' : 'model.dagScopeSizeMany', {
        count: item.members.length,
      }));
    }
    parts.push(DirectedGraphTrace.degreePhrase(item.inputs.length, item.outputs.length));
    const role = DirectedGraphTrace.roleOf(item, this.isolated(item));
    if (role !== null) {
      parts.push(role);
    }
    return parts.join(t('dialogs.objectListSeparator'));
  }

  /**
   * The object list's filters an item belongs to.
   *
   * The roles are the ones {@link roleOf} announces, read from the same
   * counts, so a merge-and-branch point is in both lists and a graph input
   * that branches is in both of those.
   *
   * @param item - The item
   * @param isolated - Whether nothing inside it has an edge at all
   * @param upstream - What feeds the item under the cursor, however far back
   * @param downstream - What it feeds, however far on
   * @param filtered - The attributes the list filters by
   * @returns The filter ids
   */
  private static objectGroups(
    item: GraphItem,
    isolated: boolean,
    upstream: ReadonlySet<GraphItem>,
    downstream: ReadonlySet<GraphItem>,
    filtered: ReadonlySet<string>,
  ): string[] {
    const groups: string[] = [];
    if (upstream.has(item)) {
      groups.push(UPSTREAM_OF_CURRENT);
    }
    if (downstream.has(item)) {
      groups.push(DOWNSTREAM_OF_CURRENT);
    }
    const inputs = item.inputs.length;
    const outputs = item.outputs.length;
    if (inputs === 0 && outputs > 0) {
      groups.push(GRAPH_INPUTS);
    }
    if (outputs === 0 && inputs > 0) {
      groups.push(GRAPH_OUTPUTS);
    }
    if (outputs > 1) {
      groups.push(BRANCH_POINTS);
    }
    if (inputs > 1) {
      groups.push(MERGE_POINTS);
    }
    if (inputs === 0 && outputs === 0 && isolated) {
      groups.push(NOT_CONNECTED);
    }
    groups.push(levelFilterId(item.depth));
    if (item.kind === 'scope') {
      groups.push(SCOPES);
    }
    for (const [key, value] of item.attributes) {
      if (filtered.has(key)) {
        groups.push(attributeFilterId(key, value));
      }
    }
    return groups;
  }

  /**
   * Everything an item reaches by following edges one way: the declared
   * nodes on a path from it, and the scopes holding any of them.
   *
   * Walked over the declared edges rather than the items' own, which are as
   * the reader hears them from one step: a closed scope's edges are those of
   * all its members together, so a walk through the scope would carry on from
   * members it never reached -- one of two parallel paths through a block
   * would seem to feed the other's consumers. A scope counts as reached when
   * a node inside it is, unless it holds the start, which would make every
   * enclosing block its own upstream; and nothing inside a scope the walk
   * starts from is counted.
   *
   * @param from - Where to start
   * @param along - Upstream through the inputs, or downstream through the
   *   outputs
   * @returns The items reached, not counting the start even on a cycle back
   *   to it
   */
  private reach(from: GraphItem, along: 'inputs' | 'outputs'): Set<GraphItem> {
    const next = along === 'inputs' ? this.predecessors : this.successors;
    const start = new Set(from.members);
    const reached = new Set<number>();
    const queue = [...start];
    for (let head = 0; head < queue.length; head++) {
      for (const node of next[queue[head]]) {
        if (!start.has(node) && !reached.has(node)) {
          reached.add(node);
          queue.push(node);
        }
      }
    }

    const holdsStart = (item: GraphItem): boolean =>
      item.members.some(member => start.has(member));
    return new Set(this.allItems(this.roots).filter(item =>
      !holdsStart(item) && item.members.some(member => reached.has(member))));
  }

  /**
   * The producer's attributes the object list uses, in the order the nodes
   * first declare them.
   *
   * An attribute is a measure when every node declaring it gives a number --
   * a parameter count -- and at least two do, since one value orders nothing.
   * Any other attribute -- a layer type, an output shape -- is a filter for
   * each value two or more nodes share. A few of each, so the sorts and
   * filters stay a short turn of the key.
   *
   * @returns The numeric attributes, and the others with their shared values
   */
  private listedAttributes(): { numeric: string[]; shared: [string, string[]][] } {
    const keys: string[] = [];
    const declaring = new Map<string, number>();
    const notNumbers = new Set<string>();
    const values = new Map<string, Map<string, number>>();
    for (const point of this.points) {
      for (const [key, value] of Object.entries(point.attributes ?? {})) {
        if (!declaring.has(key)) {
          keys.push(key);
        }
        declaring.set(key, (declaring.get(key) ?? 0) + 1);
        if (attributeNumber(value) === null) {
          notNumbers.add(key);
        }
        // As announced, which is how the filter names it.
        const counts = values.get(key) ?? new Map<string, number>();
        counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
        values.set(key, counts);
      }
    }

    const numeric = keys
      .filter(key => !notNumbers.has(key) && (declaring.get(key) ?? 0) >= 2)
      .slice(0, SORTED_ATTRIBUTES);
    const shared = keys
      .filter(key => notNumbers.has(key))
      .slice(0, FILTERED_ATTRIBUTES)
      .map((key): [string, string[]] => [
        key,
        [...(values.get(key) ?? new Map<string, number>())]
          .filter(([, count]) => count >= 2)
          .map(([value]) => value),
      ]);
    return { numeric, shared };
  }

  /**
   * Betweenness for every listed item, worked out on the first call and kept.
   *
   * Measured on the declared nodes and their own edges rather than on what a
   * closed scope shows, since a scope is a way of reading the graph and not a
   * node a path runs through. A scope has none.
   *
   * @returns One value per listed item, in the object list's order
   */
  private betweennessInListOrder(): number[] {
    if (this.betweennessByObject === null) {
      const { betweenness } = centrality(this.successors);
      this.betweennessByObject = this.allItems(this.roots)
        .map(item => (item.source === null ? Number.NaN : betweenness[item.source]));
    }
    return this.betweennessByObject;
  }

  public get description(): DescriptionState {
    const nodes = this.nodeItems;
    const items = this.allItems(this.roots);
    const scopes = items.filter(item => item.kind === 'scope');
    const listed = (items: GraphItem[]): string => {
      const shown = items.slice(0, NAMED_NODES)
        .map(item => DirectedGraphTrace.nameFrom(item, null))
        .join(', ');
      return items.length > NAMED_NODES
        ? t('model.networkIsolatedListMore', { count: items.length, shown, more: items.length - NAMED_NODES })
        : t('model.networkIsolatedList', { count: items.length, shown });
    };

    // The declared graph's own sources and sinks, not what a closed scope
    // shows: the description speaks of the whole graph at once.
    const inputs = this.order
      .filter(node => this.predecessors[node].length === 0 && this.successors[node].length > 0)
      .map(node => nodes[node]);
    const outputs = this.order
      .filter(node => this.successors[node].length === 0 && this.predecessors[node].length > 0)
      .map(node => nodes[node]);
    // The items a move and the object list call branch or merge points, each
    // as seen from its scope, named so each can be found. Counted by the
    // declared nodes' own edges, the summary named points nothing else calls
    // one: a node whose two edges both enter one closed scope, which a move
    // hears as one output, and an end three states inside a composite feed,
    // which a move reaches from the composite alone.
    const branches = items.filter(item => item.outputs.length > 1);
    const merges = items.filter(item => item.inputs.length > 1);

    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfNodes'), value: nodes.length },
      { label: t('model.statNumberOfEdges'), value: this.edgeCount },
    ];
    if (scopes.length > 0) {
      stats.push({ label: t('model.statScopes'), value: scopes.length });
      stats.push({ label: t('model.statNestingDepth'), value: this.levels.length - 1 });
      // The view a reader enters on, which is the shape of the model at a
      // glance: the blocks in order, input to output.
      stats.push({
        label: t('model.statTopLevel'),
        value: this.roots.length > NAMED_NODES * 2
          ? t('model.networkAndMoreList', {
              shown: this.roots.slice(0, NAMED_NODES * 2).map(item => item.name).join(', '),
              count: this.roots.length - NAMED_NODES * 2,
            })
          : this.roots.map(item => item.name).join(', '),
      });
    }
    if (inputs.length > 0) {
      stats.push({ label: t('model.statGraphInputs'), value: listed(inputs) });
    }
    if (outputs.length > 0) {
      stats.push({ label: t('model.statGraphOutputs'), value: listed(outputs) });
    }
    stats.push({ label: t('model.statBranchPoints'), value: branches.length > 0 ? listed(branches) : 0 });
    stats.push({ label: t('model.statMergePoints'), value: merges.length > 0 ? listed(merges) : 0 });
    if (this.cyclic) {
      stats.push({ label: t('model.statCycle'), value: t('model.dagCycle') });
    }

    // Every attribute any node declares, in first-seen order, one column each.
    const keys: string[] = [];
    for (const item of nodes) {
      for (const [key] of item.attributes) {
        if (!keys.includes(key)) {
          keys.push(key);
        }
      }
    }

    // A graph with no scopes has no paths, so a Path column would be blank
    // in every row -- and the first column is each row's header, so every
    // row would be headed by nothing. A scope exists only where a path names
    // one, so this is exactly "some node declared a path".
    const scoped = scopes.length > 0;

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [
          ...(scoped ? [t('model.asidePath')] : []),
          this.nodeLabel,
          t('model.tableInputs'),
          t('model.tableOutputs'),
          ...keys,
        ],
        // The name sits on x, as the announcement says it; the rest are
        // joined names and the producer's own strings, on no axis. Shaped
        // as the headers are, since the formatters are applied by column.
        columnAxes: [...(scoped ? [undefined] : []), 'x', undefined, undefined, ...keys.map(() => undefined)],
        // In topological order, input to output, which is the order the
        // graph is read in.
        rows: this.order.map((node) => {
          const item = nodes[node];
          const attributes = new Map(item.attributes);
          return [
            ...(scoped ? [DirectedGraphTrace.pathOf(item).join(PATH_JOIN)] : []),
            item.name,
            this.neighbourCell(node, 'inputs'),
            this.neighbourCell(node, 'outputs'),
            ...keys.map(key => attributes.get(key) ?? ''),
          ];
        }),
      },
    };
  }

  /**
   * One node's inputs or outputs, as the description's table lists them:
   * each declared edge by the node at its far end, with its label, in
   * declared order.
   *
   * Copies of one drawn edge (`inputEdges`) that all reach the node from one
   * scope, or all leave it for one, are listed as that scope, once: a
   * composite state's `stop`, declared from each state inside it, is drawn
   * as one arrow out of the composite, and Idle's inputs read `start,
   * Running (stop)`, not one entry per state. Their label is given when they
   * all carry the same one, as a move hears it. Copies that share no scope
   * apart from the node's own are listed one by one, and so is an edge drawn
   * beside a copy, between the same two nodes.
   *
   * @param node - The node, as a declared index
   * @param along - Whether to list the edges arriving at it or leaving it
   * @returns The joined entries
   */
  private neighbourCell(node: number, along: 'inputs' | 'outputs'): string {
    const nodes = this.nodeItems;
    const keyOf = (one: number): string => (along === 'inputs' ? `${one}>${node}` : `${node}>${one}`);
    const partsOf = (one: number): Map<string, string[]> => this.drawnEdges.get(keyOf(one)) ?? new Map<string, string[]>();
    const joined = (labels: string[]): string | undefined => (labels.length > 0 ? labels.join('; ') : undefined);
    const neighbours = along === 'inputs' ? this.predecessors[node] : this.successors[node];

    // The neighbours each drawn edge reaches, by its id.
    const copies = new Map<string, number[]>();
    for (const one of neighbours) {
      for (const edge of partsOf(one).keys()) {
        if (edge === '') {
          continue;
        }
        const list = copies.get(edge);
        if (list === undefined) {
          copies.set(edge, [one]);
        } else {
          list.push(one);
        }
      }
    }
    // The scope a drawn edge's copies all come from or go to, when there are
    // several and it is not the node's own.
    const scopeOf = (edge: string): GraphItem | null => {
      const group = copies.get(edge) ?? [];
      const scope = group.length > 1 ? DirectedGraphTrace.commonScope(group.map(each => nodes[each])) : null;
      return scope !== null && !scope.members.includes(node) ? scope : null;
    };

    const listed = new Set<string>();
    const entries: string[] = [];
    for (const one of neighbours) {
      const grouped: [string, GraphItem][] = [];
      const beside: string[] = [];
      let alone = false;
      for (const [edge, labels] of partsOf(one)) {
        const scope = edge === '' ? null : scopeOf(edge);
        if (scope === null) {
          alone = true;
          beside.push(...labels.filter(label => !beside.includes(label)));
        } else {
          grouped.push([edge, scope]);
        }
      }
      if (grouped.length === 0) {
        entries.push(DirectedGraphTrace.labelled(DirectedGraphTrace.nameFrom(nodes[one], null), this.edgeLabels.get(keyOf(one))));
        continue;
      }
      for (const [edge, scope] of grouped) {
        if (listed.has(edge)) {
          continue;
        }
        listed.add(edge);
        const labels = new Set((copies.get(edge) ?? []).map(each => joined(partsOf(each).get(edge) ?? [])));
        const label = labels.size === 1 ? [...labels][0] : undefined;
        entries.push(DirectedGraphTrace.labelled(DirectedGraphTrace.nameFrom(scope, null), label));
      }
      // An edge drawn beside the copies, between the same two nodes.
      if (alone) {
        entries.push(DirectedGraphTrace.labelled(DirectedGraphTrace.nameFrom(nodes[one], null), joined(beside)));
      }
    }
    return entries.join(', ');
  }

  /**
   * The deepest scope holding every one of the given nodes.
   *
   * @param items - Declared nodes' own items
   * @returns The scope, or null when only the top level holds them all
   */
  private static commonScope(items: GraphItem[]): GraphItem | null {
    for (let scope = items[0]?.parent ?? null; scope !== null; scope = scope.parent) {
      const holds = scope.members;
      if (items.every(item => item.source !== null && holds.includes(item.source))) {
        return scope;
      }
    }
    return null;
  }

  /**
   * Maps the declared nodes onto their drawn elements.
   *
   * One element per declared node, in declared order. A scope was not
   * declared and has nothing of its own to outline, so it gets a hidden
   * placeholder, and {@link highlight} outlines its members instead;
   * withdrawn entirely on a count mismatch, since a list that has slipped by
   * one outlines the wrong layer for the rest of the chart.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many nodes the layer declared
   * @returns One element per item, in the cursor's own shape, or null
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    declared: number,
  ): SVGElement[][] | null {
    // Resolved live first and cloned only once the count fits, so a declined
    // list leaves no clones behind.
    let live: SVGElement[];
    if (typeof selectors === 'string') {
      live = Svg.selectAllElements(selectors, false);
    } else if (Array.isArray(selectors) && selectors.every(one => typeof one === 'string')) {
      live = selectors.flatMap(one => Svg.selectAllElements(one, false));
    } else {
      return null;
    }

    if (live.length !== declared) {
      return null;
    }
    const flat = live.map(element => Svg.cloneHidden(element));

    return this.levels.map(level =>
      level.map((item) => {
        const element = item.source === null ? undefined : flat[item.source];
        return element ?? Svg.createEmptyElement();
      }));
  }

  /**
   * The declared nodes the cursor covers, as indices into `layer.data`: the
   * node itself, or every node inside a closed scope.
   *
   * **This is the single expression both highlight channels read**:
   * {@link highlight} outlines these nodes and {@link highlightedPointIndices}
   * names them, so a canvas chart and an SVG chart light the same nodes.
   *
   * @returns The indices, or nothing before the cursor has entered
   */
  private get coveredMembers(): readonly number[] {
    return this.isInitialEntry ? [] : this.current?.members ?? [];
  }

  /**
   * On a scope, every declared node inside it.
   *
   * The chart was given no element for a scope, which is derived from its
   * nodes' paths rather than declared, so its own cell is a hidden
   * placeholder. Outlining that took the previous outline away and drew
   * nothing in its place -- on as many as one stop in three of a diagram of
   * subgraphs, and on the stop every nested scope is entered through --
   * while a canvas chart lit the scope's members. Its members are what the
   * scope is drawn round, so they are outlined instead.
   *
   * @returns The highlight at the cursor
   */
  protected override get highlight(): HighlightState {
    const values = this.highlightValues;
    if (values === null || this.current?.kind !== 'scope') {
      return super.highlight;
    }
    const elements = this.coveredMembers
      .map(member => this.nodeItems[member])
      .map(node => values[node.depth]?.[node.index])
      .filter((element): element is SVGElement => element !== undefined);
    return elements.length > 0 ? { empty: false, elements } : super.highlight;
  }

  /**
   * The declared nodes the cursor covers, as indices into `layer.data`.
   *
   * @returns The nodes {@link coveredMembers} names
   */
  public get highlightedPointIndices(): readonly number[] {
    return this.coveredMembers;
  }

  protected findNearestPoint(): NearestPoint | null {
    // The cursor is addressed by scope and topological position, neither of
    // which is where the layout happened to draw a node.
    return null;
  }
}

/**
 * The smallest-priority-first queue Kahn's algorithm takes ready items from.
 *
 * A binary heap of `[value, priority]`, ties broken by value, so the order is
 * deterministic and a graph of thousands of ops does not sort its ready list
 * on every step.
 */
class MinQueue {
  private readonly heap: [number, number][] = [];

  /** How many entries are waiting. */
  public get size(): number {
    return this.heap.length;
  }

  /**
   * Adds an entry.
   *
   * @param value - What to return when it is taken
   * @param priority - Smaller is taken first
   */
  public push(value: number, priority: number): void {
    const heap = this.heap;
    heap.push([value, priority]);
    let at = heap.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!MinQueue.before(heap[at], heap[parent])) {
        break;
      }
      [heap[at], heap[parent]] = [heap[parent], heap[at]];
      at = parent;
    }
  }

  /**
   * Takes the entry with the smallest priority.
   *
   * @returns Its value
   */
  public pop(): number {
    const heap = this.heap;
    const top = heap[0];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      heap[0] = last;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let least = at;
        if (left < heap.length && MinQueue.before(heap[left], heap[least])) {
          least = left;
        }
        if (right < heap.length && MinQueue.before(heap[right], heap[least])) {
          least = right;
        }
        if (least === at) {
          break;
        }
        [heap[at], heap[least]] = [heap[least], heap[at]];
        at = least;
      }
    }
    return top[0];
  }

  /**
   * Whether one entry comes out before another.
   *
   * @param a - One entry
   * @param b - The other
   * @returns True when `a` is taken first
   */
  private static before(a: [number, number], b: [number, number]): boolean {
    return a[1] < b[1] || (a[1] === b[1] && a[0] < b[0]);
  }
}
