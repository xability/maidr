import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import type { Coordinate, Node } from '@type/movable';
import type { PointCloudHighlightable } from '@type/navigation';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace, named } from './abstract';
import { MovableGraph } from './movable';

/** Rotor unit that steps through the nodes this one is linked to. */
const LINK_ROTOR_UNIT: RotorFilterUnit = {
  key: 'links',
  label: 'Links',
  noun: 'linked nodes',
};

/** How many names the description lists before it stops. */
const NAMED_NODES = 5;

/** What a node-link diagram calls its nodes when the layer names no x axis. */
const NODE_AXIS = 'Node';

/** And what it calls a node's degree when the layer names no y axis. */
const LINK_AXIS = 'Links';

/** One node of the network. */
interface NetworkNode {
  /** Its own position in the node list, so nothing has to search for it. */
  id: number;
  /** What the node is called. */
  name: string;
  /** Indices of the nodes it is linked to, most connected first. */
  links: number[];
  /**
   * Where each of those links sat in the declared array, in the same order.
   *
   * Carried because a selector list is one entry per link in **declared**
   * order while `links` is sorted by degree: pairing by rank would highlight
   * whichever line happens to sit at that position.
   */
  linkAt: number[];
  /** Which connected component it belongs to. */
  component: number;
  /** Its position within that component. */
  index: number;
}

/**
 * Trace implementation for network and node-link diagrams.
 *
 * The same graph cursor a {@link FlowTrace} carries, with the constraints
 * relaxed: the edges are undirected and there are no stages, because a force
 * layout has no columns and nothing to lay them out along.
 *
 * **Layout position is emergent and carries no meaning, so it is not in the
 * schema at all.** Where a force-directed node lands is a fact about the
 * solver's random seed, and announcing "upper left" as though it were data
 * would be inventing a finding. The type has no `x` or `y` to be tempted by;
 * highlighting goes through selectors, as everywhere else.
 *
 * **What replaces position is the structure that is actually there.** A node's
 * **degree** is primary information on this chart -- the hub is the finding --
 * so it is announced on every move, and the nodes of a component are ordered
 * by it, which puts the hubs where a reader arrives first.
 *
 * **A reader must never be stuck in one component.** Following edges reaches
 * only the component you are in, and a graph with several would leave the rest
 * unreachable and unannounced. So the arrows do not follow edges:
 *
 * - **left and right** walk the nodes of this component, most connected first;
 * - **up and down** move to another component entirely.
 *
 * Between them they reach every node of the chart, which is the guarantee that
 * matters. Following an edge -- the graph traversal itself -- is the rotor,
 * which is also where it belongs on an undirected graph: a node's neighbours
 * have equal status, so there is no "the" edge for an arrow to take, unlike a
 * sankey where the widest ribbon is the one an eye follows.
 */
export class NetworkTrace extends AbstractTrace implements PointCloudHighlightable {
  /**
   * No go-to-extrema dialog. The arrows already reach every node, and the
   * most connected are named in the description; see `extremaContract`.
   */
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGraph;

  /** Every node, in declared order. */
  private readonly nodes: NetworkNode[];

  /** Node indices per component, most connected first. */
  private readonly components: number[][];

  /** The address grid: `[component][positionWithinIt]`. */
  private readonly grid: (NetworkNode | null)[][];

  /** Degrees in the same shape, which is what the modalities read. */
  private readonly degrees: number[][];

  private readonly minDegree: number;
  private readonly maxDegree: number;

  /**
   * How many nodes the chart drew a loop on.
   *
   * A self-link is kept out of every degree -- a node linked only to itself
   * is linked to nobody -- but the chart drew a line for it all the same, and
   * `mapToSvgElements` requires one selector per declared link including
   * these. Counted here so the description can say so rather than leave the
   * link count short of what is on the page.
   */
  private readonly selfLinks: number;

  /**
   * The link walk in progress: whose links, how far along, and where the last
   * step left the cursor.
   */
  private linkWalk: { from: number; index: number; at: Coordinate } | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Every line clone the selectors resolved to, in declared link order. The
   * highlight covers one line per node, so this is what `dispose()` walks to
   * remove the rest.
   */
  private lines: SVGElement[] = [];

  /**
   * Creates a new network trace.
   *
   * @param layer - The MAIDR layer carrying the links
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const links = layer.data as NetworkPoint[];
    this.nodes = NetworkTrace.buildNodes(links);
    this.components = this.findComponents();
    for (const [component, members] of this.components.entries()) {
      for (const [index, node] of members.entries()) {
        this.nodes[node].component = component;
        this.nodes[node].index = index;
      }
    }

    this.grid = this.components.map(members => members.map(node => this.nodes[node]));
    this.degrees = this.grid.map(row => row.map(node => node?.links.length ?? Number.NaN));
    const flat = this.degrees.flat();
    this.minDegree = MathUtil.safeMin(flat);
    this.maxDegree = MathUtil.safeMax(flat);

    // Counted by node rather than by declaration, the way a pair declared
    // twice counts once: what the reader is told about is the loop on a node.
    this.selfLinks = new Set(
      links
        .filter(link => String(link.source) === String(link.target))
        .map(link => String(link.source)),
    ).size;

    this.highlightValues = this.mapToSvgElements(layer.selectors, links.length);
    this.movable = new MovableGraph(this.buildGraph());
  }

  /**
   * Resolves the declared links into nodes.
   *
   * Undirected, so each link is recorded on both of its ends: on this chart a
   * link between two nodes is a fact about the pair rather than a direction,
   * and treating it as one-way would halve every degree on the chart.
   *
   * A link a producer declares twice, once each way, counts once -- that is
   * how several libraries emit an undirected edge, and counting it twice would
   * report a degree the picture does not show. A self-link is dropped from
   * every degree instead: a node linked only to itself is linked to nobody,
   * and counting the loop would put it in a group of one and call it
   * connected. The chart still draws the loop, so {@link NetworkTrace.description}
   * reports those separately.
   *
   * @param links - The declared edges
   * @returns Every node, with its neighbours attached
   */
  private static buildNodes(links: NetworkPoint[]): NetworkNode[] {
    const byName = new Map<string, number>();
    const nodes: NetworkNode[] = [];
    const neighbours: Set<number>[] = [];
    // Which declared link first joined a pair, so a node can find the line
    // that was drawn for each of its neighbours.
    const drawnBy: Map<number, number>[] = [];

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
      nodes.push({ id: nodes.length, name, links: [], linkAt: [], component: 0, index: 0 });
      neighbours.push(new Set<number>());
      drawnBy.push(new Map<number, number>());
      return nodes.length - 1;
    }

    for (const [at, link] of links.entries()) {
      const from = ensure(String(link.source));
      const to = ensure(String(link.target));
      if (from === to) {
        continue;
      }
      neighbours[from].add(to);
      neighbours[to].add(from);
      // First declaration wins, so a pair emitted twice -- once each way, as
      // several libraries do -- names the line that was drawn for it once.
      if (!drawnBy[from].has(to)) {
        drawnBy[from].set(to, at);
      }
      if (!drawnBy[to].has(from)) {
        drawnBy[to].set(from, at);
      }
    }

    for (const [index, node] of nodes.entries()) {
      // Most connected first, so the rotor enumerates a node's links in the
      // order the chart draws attention in.
      node.links = [...neighbours[index]]
        .sort((a, b) => neighbours[b].size - neighbours[a].size);
      node.linkAt = node.links.map(one => drawnBy[index].get(one) ?? -1);
    }
    return nodes;
  }

  /**
   * Groups the nodes into the pieces the graph actually falls into.
   *
   * A component is real structure, unlike where the solver happened to put a
   * node, and it is what decides whether a reader can get anywhere: following
   * links never leaves the one you are in.
   *
   * Ordered largest component first, and within a component by degree, so the
   * reader arrives on the biggest hub of the biggest piece.
   *
   * @returns Node indices per component
   */
  private findComponents(): number[][] {
    const seen = new Set<number>();
    const found: number[][] = [];

    for (const [start] of this.nodes.entries()) {
      if (seen.has(start)) {
        continue;
      }
      const members: number[] = [];
      const queue = [start];
      seen.add(start);
      while (queue.length > 0) {
        const at = queue.pop() as number;
        members.push(at);
        for (const link of this.nodes[at].links) {
          if (!seen.has(link)) {
            seen.add(link);
            queue.push(link);
          }
        }
      }
      members.sort((a, b) =>
        (this.nodes[b].links.length - this.nodes[a].links.length) || (a - b));
      found.push(members);
    }

    return found.sort((a, b) => b.length - a.length);
  }

  /**
   * Wires the grid the cursor walks.
   *
   * Left and right stay in the component; up and down leave it. Between them
   * every node of the chart is reachable, which is the point -- an arrow that
   * followed edges would strand every component but the first.
   *
   * @returns The navigation graph
   */
  private buildGraph(): (Node | null)[][] {
    return this.grid.map((row, component) =>
      row.map((node, index) => {
        if (node === null) {
          return null;
        }
        const above = this.components[component - 1];
        const below = this.components[component + 1];
        return {
          left: index > 0 ? { row: component, col: index - 1 } : null,
          right: index < row.length - 1 ? { row: component, col: index + 1 } : null,
          // Clamped to the neighbouring component's first node rather than to
          // the same column, which may not exist there.
          up: below === undefined ? null : { row: component + 1, col: 0 },
          down: above === undefined ? null : { row: component - 1, col: 0 },
          start: { row: component, col: 0 },
          end: { row: component, col: row.length - 1 },
          top: { row: this.grid.length - 1, col: 0 },
          bottom: { row: 0, col: 0 },
        };
      }));
  }

  /** The node the cursor is on, when it is on one. */
  private get current(): NetworkNode | null {
    return this.grid[this.row]?.[this.col] ?? null;
  }

  /**
   * What this chart calls a node.
   *
   * A force layout has no scales, so a producer that names no x axis is being
   * accurate. `xAxis` falls back to the literal `'X'` for that layer, and
   * while {@link AbstractTrace.getDescriptionAxes} keeps the placeholder out
   * of the dialog's Axes block, the table header and every move announcement
   * printed it -- a column of people's names headed `X`.
   */
  private get nodeLabel(): string {
    return named(this.layer.axes?.x?.label, NODE_AXIS);
  }

  /**
   * What this chart calls a node's degree.
   *
   * The announcement's cross value and the table's second column carry the
   * same number, so they take the same noun. Only the column had one, and
   * hard-coded: the cross kept `yAxis`, which is the literal `'Y'` on a layer
   * that names no axes -- what the echarts binder emits -- so a network read
   * "Node is Ada, Y is 4" beside a column headed `Links`. The fallback is the
   * label the amCharts, Chart.js and Highcharts binders already author here,
   * and reading both through the layer keeps a chart that renames it from
   * renaming only half.
   */
  private get linkLabel(): string {
    return named(this.layer.axes?.y?.label, LINK_AXIS);
  }

  protected get values(): number[][] {
    return this.degrees;
  }

  protected get audio(): AudioState {
    const node = this.current;
    // One scale for the whole chart: degree is comparable everywhere, and a
    // per-component scale would make a hub of three sound like a hub of
    // thirty, which is the comparison this chart exists for.
    return {
      freq: {
        min: this.minDegree,
        max: this.maxDegree,
        raw: node?.links.length ?? 0,
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.grid.length,
        cols: Math.max(2, this.grid[this.row]?.length ?? 1),
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
    const node = this.current;
    if (node === null) {
      return {
        main: { label: this.nodeLabel, value: '' },
        cross: { label: this.linkLabel, value: 0 },
        mainAxis: 'x',
        crossAxis: 'y',
      };
    }

    const asides: { label: string; value: string }[] = [];

    const links = node.links.length;
    if (links === 0) {
      // An isolated node is a finding rather than an absence: it is drawn
      // sitting apart, and "no links" is what the picture shows.
      asides.push({ label: 'Links', value: 'none' });
    } else {
      // The degree, which is primary information on this chart -- the hub is
      // usually the whole point of drawing it.
      asides.push({
        label: 'Links',
        value: `${links}, to ${node.links.slice(0, 3).map(one => this.nodes[one].name).join(', ')}${
          links > 3 ? ` and ${links - 3} more` : ''}`,
      });
    }

    if (this.components.length > 1) {
      // Which piece of the chart the reader is in, and how big it is. Without
      // it a reader walking one component has no way to tell whether the
      // chart is that component or one of several.
      asides.push({
        label: 'Group',
        value: `${this.row + 1} of ${this.components.length}, ${this.grid[this.row].length} nodes`,
      });
    }

    return {
      main: { label: this.nodeLabel, value: node.name },
      cross: { label: this.linkLabel, value: links },
      mainAxis: 'x',
      crossAxis: 'y',
      asides,
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.grid.length,
      cols: this.grid[this.row]?.length ?? 0,
    };
  }

  /**
   * Offers a walk along the current node's links.
   *
   * The arrows deliberately do not follow edges -- that would strand every
   * component but the first -- so this is where the graph traversal lives. It
   * is also where it belongs on an undirected graph: a node's neighbours have
   * equal status, so there is no single edge for an arrow to take.
   *
   * Withheld on a chart where nothing is linked to anything.
   *
   * @returns The link unit alongside whatever else is offered
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    const linked = this.nodes.some(node => node.links.length > 0);
    return linked ? [...inherited, LINK_ROTOR_UNIT] : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== LINK_ROTOR_UNIT.key) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const node = this.current;
    if (node === null) {
      this.notifyRotorBounds();
      return false;
    }

    // Anchored on the node the walk started from: a step along a link lands
    // on another node with links of its own, so deriving the list from the
    // cursor would enumerate a different node's neighbours on every press.
    const continuing = this.linkWalk !== null
      && this.linkWalk.at.row === this.row
      && this.linkWalk.at.col === this.col;
    const from = continuing && this.linkWalk !== null
      ? this.nodes[this.linkWalk.from]
      : node;
    // A fresh walk has no position to step from, so it is seeded at whichever
    // end the reader is entering from. A single "before the first element"
    // sentinel only reads correctly rightwards: stepping back from it lands
    // at -2, which is not a position, and the mode reports no links on a node
    // that plainly has several.
    const index = continuing && this.linkWalk !== null
      ? this.linkWalk.index + (direction === 'right' ? 1 : -1)
      : (direction === 'right' ? 0 : from.links.length - 1);

    const target = from.links[index];
    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    const to = this.nodes[target];
    const at = { row: to.component, col: to.index };
    this.linkWalk = { from: from.id, index, at };
    this.movable.moveToIndex(at.row, at.col);
    this.notifyStateUpdate();
    return true;
  }

  public get description(): DescriptionState {
    const edges = this.nodes.reduce((n, node) => n + node.links.length, 0) / 2;
    const isolated = this.nodes.filter(node => node.links.length === 0);
    const grouped = this.components.length > 1;

    const stats: DescriptionState['stats'] = [
      { label: 'Number of nodes', value: this.nodes.length },
      { label: 'Number of links', value: edges },
    ];

    if (this.selfLinks > 0) {
      // Kept out of every degree on purpose, so the count above is short of
      // the lines the chart drew and a reader comparing the two would find
      // one missing with nothing to explain it.
      stats.push({ label: 'Self links', value: this.selfLinks });
    }

    stats.push({ label: 'Separate groups', value: this.components.length });

    // The range the pitch is scaled against, so a reader hearing degree knows
    // what the two ends of the register mean. `Most connected` names the top
    // of it and nothing named the bottom, which leaves "Ada 4" with nothing
    // to be read against short of walking every node.
    stats.push({
      label: 'Links per node',
      value: MathUtil.spannedOrMissing(this.minDegree, this.maxDegree),
    });

    const hubs = [...this.nodes]
      .filter(node => node.links.length > 0)
      .sort((a, b) => b.links.length - a.links.length)
      .slice(0, NAMED_NODES);
    if (hubs.length > 0) {
      // The hub is usually the whole reason the chart was drawn, and it is
      // the one thing a reader walking node by node would have to hold every
      // degree in mind to find.
      stats.push({
        label: 'Most connected',
        value: hubs.map(node => `${node.name} ${node.links.length}`).join(', '),
      });
    }

    // Only the components that are groups. Every isolated node is a component
    // of its own, so a chart with fifty of them listed `1` fifty times here
    // and then named them again under `Unconnected` -- the same fact twice,
    // at length. Capped for the reason every other list in the dialog is.
    const clusters = this.components.filter(members => members.length > 1);
    if (clusters.length > 1 || (clusters.length > 0 && isolated.length > 0)) {
      // How the chart breaks up, which is structure a reader following links
      // can never discover -- links do not cross between groups, which is
      // what makes them groups.
      const shown = clusters.slice(0, NAMED_NODES).map(members => members.length).join(', ');
      stats.push({
        label: 'Group sizes',
        value: clusters.length > NAMED_NODES
          ? `${shown}, and ${clusters.length - NAMED_NODES} more`
          : shown,
      });
    }

    if (isolated.length > 0) {
      // The count and then the names, which stop where every other list in
      // MAIDR stops. Cut silently, `50: Ada, Bo, Cy, Di, Ed` read as a list
      // of fifty that had lost forty-five of its names.
      const shown = isolated.slice(0, NAMED_NODES).map(node => node.name).join(', ');
      stats.push({
        label: 'Unconnected',
        value: isolated.length > NAMED_NODES
          ? `${isolated.length}: ${shown}, and ${isolated.length - NAMED_NODES} more`
          : `${isolated.length}: ${shown}`,
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [this.nodeLabel, this.linkLabel, ...(grouped ? ['Group'] : []), 'Linked to'],
        // Walked component by component, most connected first, which is the
        // order the arrows take a reader through the chart and the order the
        // group sizes above are in. `this.nodes` is the order the producer
        // declared its links in, which is nothing a reader ever sees -- and
        // the group a node is in, which every move announces, was not in the
        // table at all.
        rows: this.components.flatMap((members, component) =>
          members.map((at) => {
            const node = this.nodes[at];
            return [
              node.name,
              node.links.length,
              ...(grouped ? [`${component + 1} of ${this.components.length}`] : []),
              node.links.map(one => this.nodes[one].name).join(', '),
            ];
          })),
      },
    };
  }

  /**
   * Maps the declared links onto their drawn lines.
   *
   * A selector list is one entry per **link**, in declared order, because a
   * line is what the chart draws between two nodes. The cursor sits on a
   * node, so a node highlights a line it touches.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many links the layer declared
   * @returns Elements in the cursor's own shape, or null
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    declared: number,
  ): SVGElement[][] | null {
    // Resolved live first and cloned only once the count fits. A clone is
    // inserted beside its original the moment it is made, so declining after
    // cloning left every copy in the chart for `dispose()` never to reach --
    // and the next resolution matched the copies too.
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
    this.lines = flat;

    // The line drawn for the node's most connected neighbour, which is also
    // the rotor's first step from here -- so the highlight agrees with where
    // the next keystroke goes. An isolated node has no line to point at and
    // gets a hidden placeholder, which is the honest answer rather than a
    // line belonging to somebody else.
    return this.grid.map(row =>
      row.map((node) => {
        const at = NetworkTrace.lineOf(node);
        const element = at === undefined ? undefined : flat[at];
        return element ?? Svg.createEmptyElement();
      }));
  }

  /**
   * Removes every line clone, not only the ones the highlight covers.
   *
   * `AbstractTrace.dispose()` walks `highlightValues`, which holds one line
   * per node; a line that is nobody's first step is referenced only from
   * {@link lines}, and left in the chart it accumulated on every focus cycle
   * and live-data rebuild.
   */
  public override dispose(): void {
    for (const line of this.lines) {
      if (Svg.isOwned(line)) {
        line.remove();
      }
    }
    this.lines = [];
    super.dispose();
  }

  /**
   * The one line a node's highlight covers, as its position in the declared
   * link array.
   *
   * **This is the single expression both highlight channels read.** A node
   * touches every link on it, but the chart is not asked to outline all of
   * them: `mapToSvgElements` takes one element per cell, and
   * {@link highlightedPointIndices} names one index. Writing the rule twice is
   * how the two would come to disagree -- an adapter publishing every link
   * while the SVG path outlined `linkAt[0]` puts a canvas highlight and an SVG
   * highlight on different lines for the same trace at the same cursor
   * position, which reads as correct and is not.
   *
   * `linkAt` runs parallel to `links`, which is sorted most-connected first, so
   * this is the line to the node's biggest neighbour -- and the line the
   * rotor's first step from here travels. A `-1` marks a neighbour no declared
   * link was found for, and an isolated node has no entry at all; both mean
   * "no line", which is honest rather than pointing at somebody else's.
   *
   * @param node - The node under the cursor, or null where the grid is empty
   * @returns Its line's index into the declared links, or undefined when the
   *   node has no line drawn for it
   */
  private static lineOf(node: NetworkNode | null): number | undefined {
    const at = node?.linkAt[0];
    return at === undefined || at < 0 ? undefined : at;
  }

  /**
   * The line the highlight currently covers, as an index into this layer's
   * `data` array.
   *
   * This is `highlight` answered in a renderer-neutral currency. A network
   * drawn on a canvas has no SVG elements for `selectors` to reach, and an
   * adapter that rebuilt the component walk to find the node itself would drift
   * from {@link findComponents} silently -- so the trace names the line by the
   * position it occupies in the link array the adapter supplied, and the
   * adapter inverts that against its own extraction walk.
   *
   * Derived from {@link lineOf}, the same expression `mapToSvgElements` indexes
   * its elements with, so the canvas highlight and the SVG highlight cannot
   * name different lines.
   *
   * Deliberately not gated on SVG availability: a canvas chart has no elements
   * by definition, and that is the case this exists to serve.
   *
   * @returns One index into `layer.data`, or nothing when the cursor is on no
   *   node or on an isolated one.
   */
  public get highlightedPointIndices(): readonly number[] {
    if (this.isInitialEntry) {
      // The inherited `highlight` reports out of bounds until the cursor has
      // entered the trace; an empty array is how this channel says the same
      // thing, so the two agree at every position including this one.
      return [];
    }
    const at = NetworkTrace.lineOf(this.current);
    return at === undefined ? [] : [at];
  }

  protected findNearestPoint(): NearestPoint | null {
    // The cursor is addressed by component and degree rank, neither of which
    // is where anything is drawn -- and where a force-directed node lands is
    // a fact about the solver rather than about the data.
    return null;
  }
}
