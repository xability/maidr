import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import type { Coordinate, Node } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGraph } from './movable';

/** Rotor unit that steps through the nodes this one is linked to. */
const LINK_ROTOR_UNIT: RotorFilterUnit = {
  key: 'links',
  label: 'Links',
  noun: 'linked nodes',
};

/** How many names the description lists before it stops. */
const NAMED_NODES = 5;

/** One node of the network. */
interface NetworkNode {
  /** What the node is called. */
  name: string;
  /** Indices of the nodes it is linked to, most connected first. */
  links: number[];
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
export class NetworkTrace extends AbstractTrace {
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
   * The link walk in progress: whose links, how far along, and where the last
   * step left the cursor.
   */
  private linkWalk: { from: number; index: number; at: Coordinate } | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

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
   * report a degree the picture does not show. A self-link counts once too,
   * for the same reason.
   *
   * @param links - The declared edges
   * @returns Every node, with its neighbours attached
   */
  private static buildNodes(links: NetworkPoint[]): NetworkNode[] {
    const byName = new Map<string, number>();
    const nodes: NetworkNode[] = [];
    const neighbours: Set<number>[] = [];

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
      nodes.push({ name, links: [], component: 0, index: 0 });
      neighbours.push(new Set<number>());
      return nodes.length - 1;
    }

    for (const link of links) {
      const from = ensure(String(link.source));
      const to = ensure(String(link.target));
      if (from === to) {
        continue;
      }
      neighbours[from].add(to);
      neighbours[to].add(from);
    }

    for (const [index, node] of nodes.entries()) {
      // Most connected first, so the rotor enumerates a node's links in the
      // order the chart draws attention in.
      node.links = [...neighbours[index]]
        .sort((a, b) => neighbours[b].size - neighbours[a].size);
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
        main: { label: this.xAxis, value: '' },
        cross: { label: this.yAxis, value: 0 },
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
      main: { label: this.xAxis, value: node.name },
      cross: { label: this.yAxis, value: links },
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
    const index = (continuing && this.linkWalk !== null ? this.linkWalk.index : -1)
      + (direction === 'right' ? 1 : -1);

    const target = from.links[index];
    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    const to = this.nodes[target];
    const at = { row: to.component, col: to.index };
    this.linkWalk = { from: this.nodes.indexOf(from), index, at };
    this.movable.moveToIndex(at.row, at.col);
    this.notifyStateUpdate();
    return true;
  }

  public get description(): DescriptionState {
    const edges = this.nodes.reduce((n, node) => n + node.links.length, 0) / 2;
    const isolated = this.nodes.filter(node => node.links.length === 0);

    const stats: DescriptionState['stats'] = [
      { label: 'Number of nodes', value: this.nodes.length },
      { label: 'Number of links', value: edges },
      { label: 'Separate groups', value: this.components.length },
    ];

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

    if (this.components.length > 1) {
      // How the chart breaks up, which is structure a reader following links
      // can never discover -- links do not cross between groups, which is
      // what makes them groups.
      stats.push({
        label: 'Group sizes',
        value: this.components.map(members => members.length).join(', '),
      });
    }

    if (isolated.length > 0) {
      stats.push({
        label: 'Unconnected',
        value: `${isolated.length}: ${isolated.slice(0, NAMED_NODES).map(node => node.name).join(', ')}`,
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [this.xAxis, 'Links', 'Linked to'],
        rows: this.nodes.map(node => [
          node.name,
          node.links.length,
          node.links.map(one => this.nodes[one].name).join(', '),
        ]),
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

    return this.grid.map(row => row.map(() => Svg.createEmptyElement()));
  }

  protected findNearestPoint(): NearestPoint | null {
    // The cursor is addressed by component and degree rank, neither of which
    // is where anything is drawn -- and where a force-directed node lands is
    // a fact about the solver rather than about the data.
    return null;
  }
}
