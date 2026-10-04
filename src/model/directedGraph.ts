import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import type { Coordinate, Node } from '@type/movable';
import type { PointCloudHighlightable } from '@type/navigation';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
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

  /** Whether the edges form a cycle, so the order is not topological throughout. */
  private readonly cyclic: boolean;

  /** How many distinct edges the layer declared. */
  private readonly edgeCount: number;

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
   * where the last step left the cursor -- which is how the walk notices the
   * reader has moved off with the arrows.
   */
  private edgeWalk: {
    from: GraphItem;
    along: 'outputs' | 'inputs';
    index: number;
    at: Coordinate;
  } | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new directed graph trace.
   *
   * @param layer - The MAIDR layer carrying the nodes
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as DirectedGraphPoint[];
    const { successors, predecessors, edges } = DirectedGraphTrace.resolveEdges(this.points);
    this.successors = successors;
    this.predecessors = predecessors;
    this.edgeCount = edges;

    const { order, cyclic } = DirectedGraphTrace.topologicalOrder(successors, predecessors);
    this.order = order;
    this.cyclic = cyclic;
    const rank: number[] = Array.from({ length: this.points.length }, () => 0);
    order.forEach((node, at) => {
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
   * counts once.
   *
   * @param points - The declared nodes
   * @returns Successors and predecessors per node, and the edge count
   */
  private static resolveEdges(points: DirectedGraphPoint[]): {
    successors: number[][];
    predecessors: number[][];
    edges: number;
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
    const seen = new Set<string>();
    let edges = 0;
    points.forEach((point, to) => {
      for (const input of point.inputs ?? []) {
        const from = byId.get(String(input));
        if (from === undefined || from === to) {
          continue;
        }
        const key = `${from}>${to}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        successors[from].push(to);
        predecessors[to].push(from);
        edges++;
      }
    });
    return { successors, predecessors, edges };
  }

  /**
   * Orders the declared nodes so that every edge points forward: inputs
   * first, outputs last.
   *
   * Kahn's algorithm, taking ready nodes in declared order. A cycle leaves
   * nodes that never become ready; they follow in declared order, and the
   * description says the order is not topological throughout rather than
   * claim one the data does not have.
   *
   * @param successors - Each node's successors
   * @param predecessors - Each node's predecessors
   * @returns The order, and whether a cycle interrupted it
   */
  private static topologicalOrder(
    successors: number[][],
    predecessors: number[][],
  ): { order: number[]; cyclic: boolean } {
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

    const cyclic = order.length < successors.length;
    for (let node = 0; node < successors.length; node++) {
      if (!placed.has(node)) {
        order.push(node);
      }
    }
    return { order, cyclic };
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
   * this one is in, or down the first line of members to the deepest.
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
          start: at(siblings[0]),
          end: at(siblings[siblings.length - 1]),
          top: at(top),
          bottom: at(bottom),
        };
      }));
  }

  /** The item the cursor is on, when it is on one. */
  private get current(): GraphItem | null {
    return this.levels[this.row]?.[this.col] ?? null;
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
   * A list of names, cut short with a count of the rest.
   *
   * @param items - The items to name
   * @param from - Where the reader is
   * @returns The joined names
   */
  private static nameList(items: GraphItem[], from: GraphItem): string {
    const shown = items.slice(0, NAMED_NEIGHBOURS)
      .map(item => DirectedGraphTrace.nameFrom(item, from))
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
   * What an item is in the flow: where data enters or leaves the graph, and
   * where it branches or merges. Nothing for a link in a chain.
   *
   * @param item - The item to describe
   * @returns The role, or null
   */
  private static roleOf(item: GraphItem): string | null {
    const inputs = item.inputs.length;
    const outputs = item.outputs.length;
    if (inputs === 0 && outputs === 0) {
      return t('model.dagRoleIsolated');
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
      panning: {
        x: this.col,
        y: this.row,
        rows: this.levels.length,
        cols: Math.max(2, this.levels[this.row]?.length ?? 1),
      },
    };
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
    // which the text service speaks as their own clauses.
    const asides: { label: string; value: string }[] = [];

    const path = DirectedGraphTrace.pathOf(item);
    if (path.length > 0) {
      asides.push({ label: t('model.asidePath'), value: path.join(PATH_JOIN) });
    }

    if (item.kind === 'scope') {
      // Said first, so a reader on a closed block knows it is one and that
      // there is something to open before hearing anything else about it.
      asides.push({
        label: t('model.asideScope'),
        value: t(item.members.length === 1 ? 'model.dagScopeSizeOne' : 'model.dagScopeSizeMany', {
          count: item.members.length,
        }),
      });
    }

    asides.push({
      label: t('model.asideConnections'),
      value: DirectedGraphTrace.degreePhrase(item.inputs.length, item.outputs.length),
    });

    const role = DirectedGraphTrace.roleOf(item);
    if (role !== null) {
      asides.push({ label: t('model.asideRole'), value: role });
    }

    if (item.inputs.length > 0) {
      asides.push({ label: t('model.tableFrom'), value: DirectedGraphTrace.nameList(item.inputs, item) });
    }
    if (item.outputs.length > 0) {
      asides.push({ label: t('model.tableTo'), value: DirectedGraphTrace.nameList(item.outputs, item) });
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
      main: { label: this.nodeLabel, value: item.name },
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

  public get description(): DescriptionState {
    const nodes = this.nodeItems;
    const scopes = this.allItems(this.roots).filter(item => item.kind === 'scope');
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
    const branches = this.successors.filter(list => list.length > 1).length;
    const merges = this.predecessors.filter(list => list.length > 1).length;

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
    stats.push({ label: t('model.statBranchPoints'), value: branches });
    stats.push({ label: t('model.statMergePoints'), value: merges });
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

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [
          t('model.asidePath'),
          this.nodeLabel,
          t('model.tableInputs'),
          t('model.tableOutputs'),
          ...keys,
        ],
        // The name sits on x, as the announcement says it; the rest are
        // joined names and the producer's own strings, on no axis.
        columnAxes: [undefined, 'x', undefined, undefined, ...keys.map(() => undefined)],
        // In topological order, input to output, which is the order the
        // graph is read in.
        rows: this.order.map((node) => {
          const item = nodes[node];
          const attributes = new Map(item.attributes);
          return [
            DirectedGraphTrace.pathOf(item).join(PATH_JOIN),
            item.name,
            this.predecessors[node].map(one => DirectedGraphTrace.nameFrom(nodes[one], null)).join(', '),
            this.successors[node].map(one => DirectedGraphTrace.nameFrom(nodes[one], null)).join(', '),
            ...keys.map(key => attributes.get(key) ?? ''),
          ];
        }),
      },
    };
  }

  /**
   * Maps the declared nodes onto their drawn elements.
   *
   * One element per declared node, in declared order. A scope was not
   * declared and has nothing of its own to outline, so it gets a hidden
   * placeholder; withdrawn entirely on a count mismatch, since a list that has
   * slipped by one outlines the wrong layer for the rest of the chart.
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
   * @returns The indices, or nothing before the cursor has entered
   */
  public get highlightedPointIndices(): readonly number[] {
    if (this.isInitialEntry) {
      return [];
    }
    return this.current?.members ?? [];
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
