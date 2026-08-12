import type { FlowPoint, MaidrLayer } from '@type/grammar';
import type { Coordinate, MovableDirection, Node } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGraph } from './movable';

/** Rotor unit that steps through the flows leaving the current node. */
const OUT_ROTOR_UNIT: RotorFilterUnit = {
  key: 'outgoing',
  label: 'Outgoing',
  noun: 'outgoing flows',
};

/** Rotor unit that steps through the flows arriving at the current node. */
const IN_ROTOR_UNIT: RotorFilterUnit = {
  key: 'incoming',
  label: 'Incoming',
  noun: 'incoming flows',
};

/** How many hops the dominant path follows before it stops describing itself. */
const PATH_HOPS = 8;

/** One edge of the graph, resolved to node indices. */
interface Edge {
  /** Index of the node the flow leaves. */
  from: number;
  /** Index of the node the flow arrives at. */
  to: number;
  /** How much flows. */
  value: number;
  /**
   * Where the flow sat in the declared array.
   *
   * Carried on the edge rather than recovered later, because the edge lists
   * are sorted by value the moment they are built: a selector list is one
   * entry per flow in **declared** order, so re-deriving a position from the
   * sorted lists highlights a different ribbon than the one announced.
   */
  at: number;
}

/** One node of the graph, placed in the grid the cursor addresses. */
interface FlowNode {
  /** What the node is called. */
  name: string;
  /** Which column of the layout it sits in. */
  stage: number;
  /** Its position within that stage. */
  index: number;
  /** Edges leaving it, largest first. */
  out: Edge[];
  /** Edges arriving at it, largest first. */
  in: Edge[];
  /** Everything leaving it, added up. */
  outTotal: number;
  /** Everything arriving at it, added up. */
  inTotal: number;
}

/** Formats a fraction as a percentage, to one decimal place. */
function asPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Trace implementation for sankey, alluvial and chord diagrams.
 *
 * These charts encode weighted flow between nodes, and they exist to show
 * **routing and proportion at once**: where a quantity comes from, where it
 * splits, and how much is lost at each hop. That is a question about topology,
 * and topology is the thing a flat reading is worst at. A sighted reader
 * traces a ribbon in a second; MAIDR's grid had no equivalent action at all,
 * and unlike most gaps there was no partial reading available either -- the
 * chart is a graph and the model was a grid.
 *
 * **Following a ribbon is the primary move, and it is on the keys that already
 * exist.** A sankey is drawn as columns of nodes with flow running left to
 * right, so the arrows are given the chart's own geometry:
 *
 * - **right** follows the largest flow *out* of this node, to the next column;
 * - **left** follows the largest flow *in*, back upstream;
 * - **up and down** walk the other nodes stacked in this column.
 *
 * That is both the drawing and MAIDR's ordinary reading of its arrows -- left
 * and right move along, up and down move between -- so nothing has to be
 * relearned. The *largest* flow is the default because it is the ribbon an eye
 * follows: the widest band leaving a node is the one the chart is drawing
 * attention to. Every other flow is one rotor away.
 *
 * **The edge is announced, not just the node it lands on.** A move that said
 * only "Electricity, 34" would have withheld the entire content of the step --
 * which flow was taken, how big it was, and what share of this node's output
 * it represents. So the trace remembers the edge it arrived by and announces
 * it: *Coal to Electricity, 34, 60.7% of Coal*.
 *
 * **Stages are derived, and a cycle is answered honestly.** A node's column is
 * its longest distance from a source, which is how these layouts are built. A
 * chord diagram is cyclic and has no such thing, so when the graph does not
 * sort, every node goes in one stage: the ribbons still follow, and nothing is
 * claimed about an ordering the data does not have.
 *
 * **Nodes are derived from the edges.** A flow list names both of its ends, so
 * a separate node list would be a second source of truth for something the
 * edges already say -- the treemap's reasoning about paths, applied to a graph.
 */
export class FlowTrace extends AbstractTrace {
  /**
   * No go-to-extrema dialog. Every node is one arrow from its neighbours and
   * the largest flows are named in the description; leaving this true without
   * overriding `getExtremaTargets` is the keyboard trap `extremaContract`
   * exists to prevent. Unrelated to `moveToExtreme`, which follows the
   * dominant path to its end and works either way.
   */
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGraph;

  /** Every node, in declared order. */
  private readonly nodes: FlowNode[];

  /** Node indices per stage, so a column can be walked. */
  private readonly stages: number[][];

  /** The address grid: `[indexWithinStage][stage]`, or null where empty. */
  private readonly grid: (FlowNode | null)[][];

  /** Throughput in the same shape, which is what the modalities read. */
  private readonly flowValues: number[][];

  /** Per-stage extremes, for the pitch range. */
  private readonly stageMin: number[];
  private readonly stageMax: number[];

  /**
   * The edge the cursor arrived by, or null when it did not arrive along one.
   *
   * Set before the move rather than after, because `moveOnce` notifies its
   * observers before returning and the announcement is assembled from `text`
   * during that notification.
   */
  private arrivedVia: Edge | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new flow trace.
   *
   * @param layer - The MAIDR layer carrying the flows
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const flows = layer.data as FlowPoint[];
    this.nodes = FlowTrace.buildNodes(flows);
    this.stages = FlowTrace.assignStages(this.nodes);
    for (const [stage, members] of this.stages.entries()) {
      for (const [index, node] of members.entries()) {
        this.nodes[node].stage = stage;
        this.nodes[node].index = index;
      }
    }

    const tallest = Math.max(1, ...this.stages.map(members => members.length));
    this.grid = Array.from({ length: tallest }, (_, index) =>
      this.stages.map(members =>
        members[index] === undefined ? null : this.nodes[members[index]]));
    this.flowValues = this.grid.map(row =>
      row.map(node => node?.outTotal ?? node?.inTotal ?? Number.NaN));

    this.stageMin = this.stages.map(members =>
      MathUtil.safeMin(members.map(node => this.throughputOf(this.nodes[node]))));
    this.stageMax = this.stages.map(members =>
      MathUtil.safeMax(members.map(node => this.throughputOf(this.nodes[node]))));

    this.highlightValues = this.mapToSvgElements(layer.selectors, flows.length);
    this.movable = new MovableGraph(this.buildGraph());
  }

  /**
   * Resolves the declared flows into nodes.
   *
   * A flow names both of its ends, so the nodes are already in the data and a
   * separate list would be a second source of truth for them. Order is first
   * appearance, which is the order the producer drew them in.
   *
   * @param flows - The declared edges
   * @returns Every node, with its edges attached largest first
   */
  private static buildNodes(flows: FlowPoint[]): FlowNode[] {
    const byName = new Map<string, number>();
    const nodes: FlowNode[] = [];

    /**
     * The node with a name, created on first sight.
     *
     * @param name - What it is called
     * @returns Its index
     */
    function ensure(name: string): number {
      const existing = byName.get(name);
      if (existing !== undefined) {
        return existing;
      }
      byName.set(name, nodes.length);
      nodes.push({
        name,
        stage: 0,
        index: 0,
        out: [],
        in: [],
        outTotal: 0,
        inTotal: 0,
      });
      return nodes.length - 1;
    }

    for (const [at, flow] of flows.entries()) {
      const value = Number(flow.value);
      if (!Number.isFinite(value)) {
        continue;
      }
      const from = ensure(String(flow.source));
      const to = ensure(String(flow.target));
      const edge: Edge = { from, to, value, at };
      nodes[from].out.push(edge);
      nodes[to].in.push(edge);
      nodes[from].outTotal += value;
      nodes[to].inTotal += value;
    }

    // Largest first, so "follow this ribbon" takes the widest band and the
    // rotor enumerates in the order the chart draws attention in.
    for (const node of nodes) {
      node.out.sort((a, b) => b.value - a.value);
      node.in.sort((a, b) => b.value - a.value);
    }
    return nodes;
  }

  /**
   * Places every node in a column.
   *
   * A node's stage is its longest distance from a source, which is how these
   * layouts are built: a node sits one column past the furthest thing that
   * feeds it, so no ribbon ever runs backwards.
   *
   * A cyclic graph -- a chord diagram, where every node both sends and
   * receives -- has no such ordering, and the sort simply does not complete.
   * That answers with a single stage holding everything rather than with a
   * partial layering, because a partial one would put some ribbons in a
   * direction the data does not support and read as though it meant something.
   *
   * @param nodes - Every node, with its edges
   * @returns Node indices per stage
   */
  private static assignStages(nodes: FlowNode[]): number[][] {
    const remaining = nodes.map(node => node.in.length);
    const depth = nodes.map(() => 0);
    const queue = nodes
      .map((_, index) => index)
      .filter(index => remaining[index] === 0);
    let sorted = 0;

    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      sorted++;
      for (const edge of nodes[at].out) {
        // `max` rather than assignment, though the in-degree gate above makes
        // the two agree here: a node is only queued once every edge into it
        // has been counted, and a node at depth d is fed only by nodes of
        // depth < d, so writes arrive in non-decreasing depth and the last
        // one is already the largest. It is kept because it is what the rule
        // *is* -- one column past the furthest feeder -- and a later change
        // to the traversal would otherwise turn a correct line into a subtly
        // wrong one. No test can distinguish the two, so none claims to.
        depth[edge.to] = Math.max(depth[edge.to], depth[at] + 1);
        remaining[edge.to]--;
        if (remaining[edge.to] === 0) {
          queue.push(edge.to);
        }
      }
    }

    if (sorted !== nodes.length || nodes.length === 0) {
      return nodes.length === 0 ? [] : [nodes.map((_, index) => index)];
    }

    const stages: number[][] = [];
    for (const [index] of nodes.entries()) {
      const stage = depth[index];
      (stages[stage] ??= []).push(index);
    }
    return stages.map(members => members ?? []);
  }

  /**
   * Wires the graph the cursor walks.
   *
   * Left and right cross stages by following a ribbon; up and down stay in
   * the column. The address is `[indexWithinStage][stage]`, so a step along a
   * ribbon changes both coordinates -- which is exactly what
   * {@link MovableGraph} exists to allow and a grid cannot express.
   *
   * @returns The navigation graph, addressed as the grid is
   */
  private buildGraph(): (Node | null)[][] {
    return this.grid.map((row, index) =>
      row.map((node, stage) => {
        if (node === null) {
          return null;
        }
        const column = this.stages[stage] ?? [];
        return {
          up: index > 0 ? { row: index - 1, col: stage } : null,
          down: index < column.length - 1 ? { row: index + 1, col: stage } : null,
          right: this.addressOf(node.out[0]?.to),
          left: this.addressOf(node.in[0]?.from),
          top: { row: 0, col: stage },
          bottom: { row: column.length - 1, col: stage },
          // The ribbon followed to its end, and back to its origin: the
          // sighted action this chart is read with, in one keystroke.
          end: this.addressOf(this.followFrom(node, 'out')),
          start: this.addressOf(this.followFrom(node, 'in')),
        };
      }));
  }

  /**
   * Where a node sits, as the cursor addresses it.
   *
   * @param node - Which node, by index
   * @returns Its address, or null when there is no such node
   */
  private addressOf(node: number | undefined): Coordinate | null {
    if (node === undefined) {
      return null;
    }
    const found = this.nodes[node];
    return found === undefined ? null : { row: found.index, col: found.stage };
  }

  /**
   * Follows the largest flow repeatedly until it runs out.
   *
   * Guarded against revisiting, because a cyclic graph would otherwise walk
   * forever -- and a chord diagram is cyclic by construction.
   *
   * @param from - Where to start
   * @param along - Whether to run with the flow or against it
   * @returns The last node reached, or undefined when the first step is not
   *   available
   */
  private followFrom(from: FlowNode, along: 'out' | 'in'): number | undefined {
    const seen = new Set<FlowNode>([from]);
    let at = from;
    let last: number | undefined;
    for (;;) {
      const edge = at[along][0];
      if (edge === undefined) {
        return last;
      }
      const next = this.nodes[along === 'out' ? edge.to : edge.from];
      if (next === undefined || seen.has(next)) {
        return last;
      }
      seen.add(next);
      last = along === 'out' ? edge.to : edge.from;
      at = next;
    }
  }

  /** The node the cursor is on, when it is on one. */
  private get current(): FlowNode | null {
    return this.grid[this.row]?.[this.col] ?? null;
  }

  /**
   * What a node carries.
   *
   * A source has no input and a sink no output, so the larger of the two is
   * the amount that passes through it -- and on a conserving graph they agree
   * everywhere in between.
   *
   * @param node - The node to measure
   * @returns Its throughput
   */
  private throughputOf(node: FlowNode): number {
    return Math.max(node.outTotal, node.inTotal);
  }

  public override moveOnce(direction: MovableDirection): boolean {
    // Recorded before the move, because `super.moveOnce` notifies during the
    // call and the announcement is assembled from `text` at that moment.
    const node = this.current;
    this.arrivedVia = node === null
      ? null
      : direction === 'FORWARD'
        ? node.out[0] ?? null
        : direction === 'BACKWARD' ? node.in[0] ?? null : null;

    const moved = super.moveOnce(direction);
    if (!moved) {
      this.arrivedVia = null;
    }
    return moved;
  }

  public override moveToExtreme(direction: MovableDirection): boolean {
    // A jump follows many ribbons rather than one, so naming any of them
    // would name an arbitrary hop of the path taken.
    this.arrivedVia = null;
    return super.moveToExtreme(direction);
  }

  public override moveToIndex(row: number, col: number): boolean {
    this.arrivedVia = null;
    return super.moveToIndex(row, col);
  }

  protected get values(): number[][] {
    return this.flowValues;
  }

  protected get audio(): AudioState {
    const node = this.current;
    return {
      freq: {
        // Scaled within the stage. Flow is conserved across a sankey, so the
        // whole-chart range is dominated by the source, and every node past
        // the first split would sit near the floor of it.
        min: this.stageMin[this.col] ?? 0,
        max: this.stageMax[this.col] ?? 0,
        raw: node === null ? 0 : this.throughputOf(node),
      },
      panning: {
        // Along the flow, so moving downstream moves rightwards in the stereo
        // field: the chart's own left-to-right geometry, heard.
        x: this.col,
        y: this.row,
        rows: this.grid.length,
        cols: Math.max(2, this.stages.length),
      },
    };
  }

  protected get braille(): BrailleState {
    // Transposed: the cursor is addressed as `[indexWithinStage][stage]`
    // because that is what puts the arrows on the chart's geometry, while a
    // braille line has to be a **stage** -- a column of the drawing -- or the
    // row would be "the third node of every stage", which is not a thing.
    const byStage = this.stages.map(members =>
      members.map(node => this.throughputOf(this.nodes[node])));
    return {
      empty: false,
      id: this.id,
      values: byStage,
      min: this.stageMin,
      max: this.stageMax,
      row: this.col,
      col: this.row,
    };
  }

  protected get text(): TextState {
    const node = this.current;
    if (node === null) {
      return {
        main: { label: this.xAxis, value: '' },
        cross: { label: this.yAxis, value: 0 },
        mainAxis: 'x',
        crossAxis: 'y',
      };
    }

    const asides: { label: string; value: string }[] = [];

    const via = this.arrivedVia;
    if (via !== null) {
      // The whole content of the step. A move announcing only where it landed
      // would withhold which ribbon was taken, how big it is, and what share
      // of its source that represents -- which is what the chart draws.
      const source = this.nodes[via.from];
      const target = this.nodes[via.to];
      const basis = source.outTotal;
      const share = basis === 0 ? '' : `, ${asPercent(via.value / basis)} of ${source.name}`;
      asides.push({
        label: 'Along',
        value: `${source.name} to ${target.name}, ${via.value}${share}`,
      });
    }

    if (node.in.length > 0 && node.out.length > 0) {
      // Where the quantity goes once it arrives, which is the split a reader
      // is tracing. A pure source or sink has only one side and the
      // throughput already carries it.
      asides.push({ label: 'In and out', value: `${node.inTotal}, ${node.outTotal}` });
    }

    const branches = node.out.length;
    if (branches > 1) {
      asides.push({ label: 'Splits into', value: String(branches) });
    }

    return {
      main: { label: this.xAxis, value: node.name },
      cross: { label: this.yAxis, value: this.throughputOf(node) },
      mainAxis: 'x',
      crossAxis: 'y',
      ...(asides.length > 0 ? { asides } : {}),
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.grid.length,
      cols: this.stages.length,
    };
  }

  /**
   * Offers the flows on either side of the current node.
   *
   * The arrows follow the largest ribbon, which is the one the chart draws
   * attention to; everything else is here. Withheld where nothing branches,
   * since a mode whose only answer is the move the arrows already make is not
   * worth a keystroke.
   *
   * @returns The flow units alongside whatever else is offered
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const units = [...super.getRotorFilterUnits()];
    if (this.nodes.some(node => node.out.length > 1)) {
      units.push(OUT_ROTOR_UNIT);
    }
    if (this.nodes.some(node => node.in.length > 1)) {
      units.push(IN_ROTOR_UNIT);
    }
    return units;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    const along = key === OUT_ROTOR_UNIT.key
      ? 'out'
      : key === IN_ROTOR_UNIT.key ? 'in' : null;
    if (along === null) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    // Anchored on the node the walk started from, not on wherever the cursor
    // now sits: a step along an edge lands on another node with edges of its
    // own, so deriving the list from the cursor would enumerate a different
    // node's flows on every press.
    const anchor = this.rotorAnchor(along);
    if (anchor === null) {
      this.notifyRotorBounds();
      return false;
    }

    const edges = anchor.node[along];
    // A fresh walk has no position to step from, so it is seeded at whichever
    // end the reader is entering from. A single "before the first element"
    // sentinel only reads correctly rightwards: stepping back from it lands
    // at -2, which is not a position, and the mode reports no flows on a node
    // that plainly has several.
    const index = anchor.index >= 0
      ? anchor.index + (direction === 'right' ? 1 : -1)
      : (direction === 'right' ? 0 : edges.length - 1);
    const edge = edges[index];
    if (edge === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    const to = this.nodes[along === 'out' ? edge.to : edge.from];
    this.flowWalk = { from: anchor.node, along, index, at: { row: to.index, col: to.stage } };
    this.arrivedVia = edge;
    this.movable.moveToIndex(to.index, to.stage);
    this.notifyStateUpdate();
    return true;
  }

  /**
   * The walk in progress: whose flows, in which direction, and how far along.
   *
   * `at` is how the walk notices it has been abandoned -- if the cursor is no
   * longer where the last step left it, the reader moved with the arrows.
   */
  private flowWalk: {
    from: FlowNode;
    along: 'out' | 'in';
    index: number;
    at: Coordinate;
  } | null = null;

  /**
   * The node whose flows the rotor is enumerating, and how far it has got.
   *
   * @param along - Which side is being walked
   * @returns The anchor, or null when the cursor is nowhere
   */
  private rotorAnchor(along: 'out' | 'in'): { node: FlowNode; index: number } | null {
    const walk = this.flowWalk;
    const continuing = walk !== null
      && walk.along === along
      && walk.at.row === this.row
      && walk.at.col === this.col;
    if (continuing && walk !== null) {
      return { node: walk.from, index: walk.index };
    }
    const node = this.current;
    return node === null ? null : { node, index: -1 };
  }

  public get description(): DescriptionState {
    const total = this.nodes
      .filter(node => node.in.length === 0)
      .reduce((sum, node) => sum + node.outTotal, 0);

    const stats: DescriptionState['stats'] = [
      { label: 'Number of nodes', value: this.nodes.length },
      { label: 'Number of flows', value: this.nodes.reduce((n, node) => n + node.out.length, 0) },
      { label: 'Stages', value: this.stages.length },
    ];

    if (total > 0) {
      // What enters the system, which is the number every share is against
      // and the one a walk of the nodes would double-count.
      stats.push({ label: 'Total flow', value: total });
    }

    const biggest = this.nodes
      .flatMap(node => node.out)
      .reduce<Edge | null>((best, edge) =>
        (best === null || edge.value > best.value ? edge : best), null);
    if (biggest !== null) {
      stats.push({
        label: 'Largest flow',
        value: `${this.nodes[biggest.from].name} to ${this.nodes[biggest.to].name}, ${biggest.value}`,
      });
    }

    const path = this.dominantPath();
    if (path.length > 1) {
      // The route the eye takes: start at the biggest source and follow the
      // widest ribbon at every branch. It is the one thing a reader walking
      // node by node cannot assemble, because it is a fact about the
      // succession of choices rather than about any node.
      stats.push({ label: 'Main route', value: path.join(' to ') });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: ['From', 'To', this.yAxis],
        rows: this.nodes.flatMap(node =>
          node.out.map(edge => [
            this.nodes[edge.from].name,
            this.nodes[edge.to].name,
            edge.value,
          ])),
      },
    };
  }

  /**
   * The widest route through the chart, named node by node.
   *
   * Starts at the largest source and takes the biggest branch at each step.
   * Capped, and guarded against revisiting so a cycle terminates.
   *
   * @returns The node names along the route
   */
  private dominantPath(): string[] {
    const sources = this.nodes.filter(node => node.in.length === 0);
    const start = (sources.length > 0 ? sources : this.nodes)
      .reduce<FlowNode | null>((best, node) =>
        (best === null || node.outTotal > best.outTotal ? node : best), null);
    if (start === null) {
      return [];
    }

    const seen = new Set<FlowNode>([start]);
    const path = [start.name];
    let at = start;
    while (path.length < PATH_HOPS) {
      const edge = at.out[0];
      if (edge === undefined) {
        break;
      }
      const next = this.nodes[edge.to];
      if (next === undefined || seen.has(next)) {
        break;
      }
      seen.add(next);
      path.push(next.name);
      at = next;
    }
    return path;
  }

  /**
   * Maps the declared flows onto their drawn ribbons.
   *
   * A selector list is one entry per **flow**, in declared order, because a
   * ribbon is what the chart draws -- the nodes are the gaps between them. The
   * cursor sits on a node, so a node highlights every ribbon it touches, which
   * is what a sighted reader's eye is drawn to when they look at one.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many flows the layer declared
   * @returns Elements in the cursor's own shape, or null
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    declared: number,
  ): SVGElement[][] | null {
    let flat: SVGElement[];
    if (typeof selectors === 'string') {
      flat = Svg.selectAllElements(selectors);
    } else if (Array.isArray(selectors) && selectors.every(one => typeof one === 'string')) {
      flat = selectors.flatMap(one => Svg.selectAllElements(one));
    } else {
      return null;
    }

    if (flat.length !== declared) {
      return null;
    }

    // Indexed by the edge's own declared position. Walking the sorted edge
    // lists to re-derive one would pair a node with whichever ribbon happens
    // to sit at that rank, so a chart whose flows are not authored in
    // descending order highlights one ribbon while announcing another --
    // and nothing about the announcement would look wrong.
    return this.grid.map(row =>
      row.map((node) => {
        if (node === null) {
          return Svg.createEmptyElement();
        }
        const touching = [...node.out, ...node.in]
          .map(edge => flat[edge.at])
          .filter((element): element is SVGElement => element !== undefined);
        return touching[0] ?? Svg.createEmptyElement();
      }));
  }

  protected findNearestPoint(): NearestPoint | null {
    // A ribbon is a curved band rather than a point or a rectangle, and the
    // cursor sits on nodes rather than on the ribbons the pointer would be
    // over. There is nothing here the pointer helpers can measure against.
    return null;
  }
}
