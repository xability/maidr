import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import type { Coordinate, Node } from '@type/movable';
import type { PointCloudHighlightable } from '@type/navigation';
import type {
  ChartObject,
  ChartObjectList,
  ObjectFilterOption,
  ObjectMeasure,
  ObjectSortOption,
} from '@type/objectList';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Centrality } from '@util/graphCentrality';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { centrality, withinCentralityBudget } from '@util/graphCentrality';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
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

/** The rotor unit's key, which the trace recognises a move request by. */
const LINK_ROTOR_KEY = 'links';

/**
 * Rotor unit that steps through the nodes this one is linked to.
 *
 * Built per call rather than held as a constant, because its words are
 * translated and the trace outlives a language change.
 *
 * @returns The unit, named in the active language
 */
function linkRotorUnit(): RotorFilterUnit {
  return {
    key: LINK_ROTOR_KEY,
    label: t('model.rotorUnitLinks'),
    noun: t('model.rotorNounLinkedNodes'),
  };
}

/** How many names the description lists before it stops. */
const NAMED_NODES = 5;

/**
 * How many groups the object list offers a filter for, largest first. Past
 * ten, stepping through the filters would take longer than walking the
 * groups with the arrows.
 */
const FILTERED_GROUPS = 10;

/** The object list's filter for the neighbours of the node under the cursor. */
const LINKED_TO_CURRENT = 'linked-to-current';

/** And its filter for the nodes linked to nobody. */
const UNLINKED = 'unlinked';

/**
 * The object list's filter id for one group.
 *
 * @param component - The group's position among the components
 * @returns The id
 */
function groupFilterId(component: number): string {
  return `group-${component + 1}`;
}

/**
 * What a node-link diagram calls its nodes when the layer names no x axis.
 *
 * @returns The label in the active language
 */
function nodeAxis(): string {
  return t('model.tableNode');
}

/**
 * And what it calls a node's degree when the layer names no y axis.
 *
 * @returns The label in the active language
 */
function linkAxis(): string {
  return t('model.networkLinkAxis');
}

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

  /**
   * Betweenness and closeness per node, in the object list's order, once a
   * sort has asked for either.
   *
   * A walk from every node, so it is paid for on the press that chooses one of
   * those sorts rather than on every `o`. The links never change under a trace
   * -- a live-data rebuild makes a new one -- so it is worked out once.
   */
  private centralityByObject: Centrality | null = null;

  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null;

  /**
   * Every line clone the selectors resolved to, in declared link order, each
   * once. The highlight lists a line under both of its ends and never a
   * loop, so this is what `dispose()` walks to remove them and what the
   * tactile view draws.
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
    return named(this.layer.axes?.x?.label, nodeAxis());
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
    return named(this.layer.axes?.y?.label, linkAxis());
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

    // The degree is the cross value, so the aside names the neighbours and
    // leaves the count to it: repeating it read "Links is 3, Links is 3, to
    // Ana, Ben, Dev". An isolated node is announced by its cross value of 0,
    // and has nobody to name.
    const links = node.links.length;
    if (links > 0) {
      asides.push({
        label: t('model.tableLinkedTo'),
        value: node.links.slice(0, 3).map(one => this.nodes[one].name).join(', ')
          + (links > 3 ? t('model.networkAndMore', { count: links - 3 }) : ''),
      });
    }

    if (this.components.length > 1) {
      // Which piece of the chart the reader is in, and how big it is. Without
      // it a reader walking one component has no way to tell whether the
      // chart is that component or one of several.
      asides.push({
        label: t('model.nounGroup'),
        value: t('model.networkGroupPosition', {
          index: this.row + 1,
          total: this.components.length,
          size: this.grid[this.row].length,
        }),
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
    return linked ? [...inherited, linkRotorUnit()] : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== LINK_ROTOR_KEY) {
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

  /**
   * Ends any link walk before a jump.
   *
   * A jump from the object list can land on the very node a walk last stepped
   * to, and the walk would then carry on through the neighbours of the node it
   * started from rather than of the one the reader chose. The walk's own steps
   * move the cursor directly, so they are not affected.
   *
   * @param row - The group to move to
   * @param col - The node's position within it
   * @returns True when the cursor moved
   */
  public override moveToIndex(row: number, col: number): boolean {
    this.linkWalk = null;
    return super.moveToIndex(row, col);
  }

  /**
   * Every node, for the `o` list, in the order the arrows walk them: group by
   * group, most connected first.
   *
   * It opens on the alphabet rather than on that order. The arrows already
   * give the walk, and what a reader opening a list of people wants is to find
   * one by name. Each node is listed with its degree, the number every move
   * announces; betweenness and closeness -- how much of a bridge a node is,
   * and how near it sits to everyone else -- are what neither the walk nor the
   * degree shows, and are worked out only when a sort asks for them.
   *
   * @returns The list, or null on a chart with no nodes
   */
  public override getObjectList(): ChartObjectList | null {
    if (this.nodes.length === 0) {
      return null;
    }

    const grouped = this.components.length > 1;
    const linkLabel = this.linkLabel;
    // Only once the reader is on a node: before that the cursor's (0, 0) is
    // where the walk will start, not anything they chose.
    const current = this.isInitialEntry ? null : this.current;
    const linkedToCurrent = new Set(current?.links ?? []);

    const objects: ChartObject[] = this.components.flatMap((members, component) =>
      members.map((at, index): ChartObject => {
        const node = this.nodes[at];
        const groups: string[] = [];
        if (linkedToCurrent.has(at)) {
          groups.push(LINKED_TO_CURRENT);
        }
        if (members.length > 1 && component < FILTERED_GROUPS) {
          groups.push(groupFilterId(component));
        }
        if (node.links.length === 0) {
          groups.push(UNLINKED);
        }
        return {
          key: node.name,
          label: node.name,
          value: { label: linkLabel, value: node.links.length, axis: 'y' },
          // The group every move announces, isolated nodes included, and only
          // where the announcement says it.
          ...(grouped ? { detail: t('model.objectFilterGroup', { index: component + 1 }) } : {}),
          row: component,
          col: index,
          measures: { degree: node.links.length },
          groups,
        };
      }));

    const degree: ObjectMeasure = { id: 'degree', label: linkLabel, spoken: true };
    const betweenness: ObjectMeasure = {
      id: 'betweenness',
      label: t('model.objectMeasureBetweenness'),
      spoken: false,
    };
    const closeness: ObjectMeasure = {
      id: 'closeness',
      label: t('model.objectMeasureCloseness'),
      spoken: false,
    };
    // Every degree alike -- a ring, a set of pairs -- and a sort by it would
    // only repeat another order under a new name.
    const byDegree = measureVaries(objects, degree.id);
    // A node is between two others only in a group of three or more that is
    // not linked all to all: pairs, triangles and isolated nodes would score
    // every node alike, and a sort by that would only repeat another order.
    const central = this.components.some(members => members.length >= 3
      && members.reduce((links, at) => links + this.nodes[at].links.length, 0) / 2
      < (members.length * (members.length - 1)) / 2)
    && withinCentralityBudget(this.nodes.map(node => node.links));

    const sorts: ObjectSortOption[] = [
      nameSort(),
      ...(byDegree ? [measureSort(degree, 'descending'), measureSort(degree, 'ascending')] : []),
      ...(central
        ? [measureSort(betweenness, 'descending'), measureSort(closeness, 'descending')]
        : []),
      chartOrderSort(t('model.objectOrderGroups')),
    ];

    const candidates: ObjectFilterOption[] = [];
    if (current !== null && current.links.length > 0) {
      candidates.push({
        id: LINKED_TO_CURRENT,
        label: t('model.objectFilterLinkedTo', { name: current.name }),
      });
    }
    // The groups that are groups, largest first. A single one is offered only
    // beside unlinked nodes, where it is the linked part of the chart; alone,
    // it is the whole chart, and `offerFilters` drops it as such.
    this.components.slice(0, FILTERED_GROUPS).forEach((members, component) => {
      if (members.length > 1) {
        candidates.push({
          id: groupFilterId(component),
          label: t('model.objectFilterGroup', { index: component + 1 }),
        });
      }
    });
    candidates.push({ id: UNLINKED, label: t('model.objectFilterUnlinked') });

    return {
      title: t('model.objectsNodes'),
      count: counter('model.objectNodesOne', 'model.objectNodesMany'),
      objects,
      measures: [...(byDegree ? [degree] : []), ...(central ? [betweenness, closeness] : [])],
      sorts,
      filters: offerFilters(objects, candidates),
      ...(central
        ? {
            deferred: {
              betweenness: () => this.centralityInListOrder().betweenness,
              closeness: () => this.centralityInListOrder().closeness,
            },
          }
        : {}),
    };
  }

  /**
   * Betweenness and closeness for every node, in the object list's order,
   * worked out on the first call and kept.
   *
   * The links are undirected, deduplicated and free of loops, which is the
   * adjacency {@link centrality} asks for.
   *
   * @returns Both measures, one value per listed node
   */
  private centralityInListOrder(): Centrality {
    if (this.centralityByObject === null) {
      const { betweenness, closeness } = centrality(this.nodes.map(node => node.links));
      const listed = this.components.flat();
      this.centralityByObject = {
        betweenness: listed.map(at => betweenness[at]),
        closeness: listed.map(at => closeness[at]),
      };
    }
    return this.centralityByObject;
  }

  public get description(): DescriptionState {
    const edges = this.nodes.reduce((n, node) => n + node.links.length, 0) / 2;
    const isolated = this.nodes.filter(node => node.links.length === 0);
    const grouped = this.components.length > 1;

    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfNodes'), value: this.nodes.length },
      { label: t('model.statNumberOfLinks'), value: edges },
    ];

    if (this.selfLinks > 0) {
      // Kept out of every degree on purpose, so the count above is short of
      // the lines the chart drew and a reader comparing the two would find
      // one missing with nothing to explain it.
      stats.push({ label: t('model.statSelfLinks'), value: this.selfLinks });
    }

    stats.push({ label: t('model.statSeparateGroups'), value: this.components.length });

    // The range the pitch is scaled against, so a reader hearing degree knows
    // what the two ends of the register mean. `Most connected` names the top
    // of it and nothing named the bottom, which leaves "Ada 4" with nothing
    // to be read against short of walking every node.
    stats.push({
      label: t('model.statLinksPerNode'),
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
        label: t('model.statMostConnected'),
        value: hubs
          .map(node => t('model.networkNodeDegree', {
            name: node.name,
            count: node.links.length,
          }))
          .join(', '),
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
        // "Linked", because the count two lines up includes every isolated
        // node as a component of its own while this lists only the groups. A
        // bare "Group sizes: 5, 2" under "Separate groups: 3" reads as a third
        // size having been dropped, and a reader should not have to reconcile
        // it against the `Unconnected` line below to hear that it was not.
        label: t('model.statLinkedGroupSizes'),
        value: clusters.length > NAMED_NODES
          ? t('model.networkAndMoreList', {
              shown,
              count: clusters.length - NAMED_NODES,
            })
          : shown,
      });
    }

    if (isolated.length > 0) {
      // The count and then the names, which stop where every other list in
      // MAIDR stops. Cut silently, `50: Ada, Bo, Cy, Di, Ed` read as a list
      // of fifty that had lost forty-five of its names.
      const shown = isolated.slice(0, NAMED_NODES).map(node => node.name).join(', ');
      stats.push({
        label: t('model.statUnconnected'),
        value: isolated.length > NAMED_NODES
          ? t('model.networkIsolatedListMore', {
              count: isolated.length,
              shown,
              more: isolated.length - NAMED_NODES,
            })
          : t('model.networkIsolatedList', { count: isolated.length, shown }),
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [
          this.nodeLabel,
          this.linkLabel,
          ...(grouped ? [t('model.nounGroup')] : []),
          t('model.tableLinkedTo'),
        ],
        // The node sits on x and its degree on y, as `text` announces them.
        // `Group` is a position among the components and `Linked to` is
        // several names joined into one cell rather than one x reading, so
        // neither takes an axis. Built on `grouped`, like the headers above.
        columnAxes: ['x', 'y', ...(grouped ? [undefined] : []), undefined],
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
              ...(grouped
                ? [t('model.networkGroupCell', {
                    index: component + 1,
                    total: this.components.length,
                  })]
                : []),
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
   * node, so a node highlights every line it touches.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many links the layer declared
   * @returns Elements in the cursor's own shape, or null
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    declared: number,
  ): (SVGElement[] | SVGElement)[][] | null {
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

    // Every line drawn to the node, so the node is where the outlined lines
    // meet. A line has two ends, and one line alone was the same highlight
    // on both of them. An isolated node has no line to point at and gets a
    // hidden placeholder, which is the honest answer rather than a line
    // belonging to somebody else.
    return this.grid.map(row =>
      row.map((node) => {
        const lines = NetworkTrace.linesOf(node)
          .map(at => flat[at])
          .filter((line): line is SVGElement => line !== undefined);
        return lines.length > 0 ? lines : Svg.createEmptyElement();
      }));
  }

  /**
   * Every line the selectors resolved to, each once.
   *
   * The inherited walk over `highlightValues` would list each line twice,
   * once under each of its ends, and the tactile view would draw it twice.
   *
   * @returns The line clones, in declared link order
   */
  public override getAllHighlightElements(): SVGElement[] {
    return [...this.lines];
  }

  /**
   * Removes every line clone, not only the ones the highlight covers.
   *
   * `AbstractTrace.dispose()` walks `highlightValues`, which holds no loop; a
   * loop is referenced only from {@link lines}, and left in the chart it
   * accumulated on every focus cycle and live-data rebuild.
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
   * The lines a node's highlight covers, as their positions in the declared
   * link array.
   *
   * **This is the single expression both highlight channels read.**
   * `mapToSvgElements` outlines these lines and {@link highlightedPointIndices}
   * names them. Writing the rule twice is how the two would come to disagree
   * -- an adapter publishing one link while the SVG path outlined another
   * puts a canvas highlight and an SVG highlight on different lines for the
   * same trace at the same cursor position, which reads as correct and is not.
   *
   * Every line the node touches, so the node is where they meet: one line
   * alone, the one to its most connected neighbour, was the same highlight
   * on Ana and on Chloe when each was the other's. Two nodes still share one
   * when they are a group of two by themselves, which a line between them
   * cannot tell apart. `linkAt` runs parallel to `links`, which is sorted
   * most-connected first, so the line the rotor's first step from here
   * travels comes first. A `-1` marks a neighbour no declared link was found
   * for, and an isolated node has no entry at all; both mean "no line",
   * which is honest rather than pointing at somebody else's.
   *
   * @param node - The node under the cursor, or null where the grid is empty
   * @returns Its lines' indices into the declared links, none when the node
   *   has no line drawn for it
   */
  private static linesOf(node: NetworkNode | null): number[] {
    return node === null ? [] : node.linkAt.filter(at => at >= 0);
  }

  /**
   * The lines the highlight currently covers, as indices into this layer's
   * `data` array.
   *
   * This is `highlight` answered in a renderer-neutral currency. A network
   * drawn on a canvas has no SVG elements for `selectors` to reach, and an
   * adapter that rebuilt the component walk to find the node itself would drift
   * from {@link findComponents} silently -- so the trace names the line by the
   * position it occupies in the link array the adapter supplied, and the
   * adapter inverts that against its own extraction walk.
   *
   * Derived from {@link linesOf}, the same expression `mapToSvgElements` indexes
   * its elements with, so the canvas highlight and the SVG highlight cannot
   * name different lines.
   *
   * Deliberately not gated on SVG availability: a canvas chart has no elements
   * by definition, and that is the case this exists to serve.
   *
   * @returns Indices into `layer.data`, or nothing when the cursor is on no
   *   node or on an isolated one.
   */
  public get highlightedPointIndices(): readonly number[] {
    if (this.isInitialEntry) {
      // The inherited `highlight` reports out of bounds until the cursor has
      // entered the trace; an empty array is how this channel says the same
      // thing, so the two agree at every position including this one.
      return [];
    }
    return NetworkTrace.linesOf(this.current);
  }

  protected findNearestPoint(): NearestPoint | null {
    // The cursor is addressed by component and degree rank, neither of which
    // is where anything is drawn -- and where a force-directed node lands is
    // a fact about the solver rather than about the data.
    return null;
  }
}
