import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { Coordinate, Node } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { TraceType } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGraph } from './movable';

/**
 * One node of the tree, resolved from the declared points.
 *
 * Address is `(depth, index)` -- the coordinate the {@link MovableGraph} and
 * every modality index by -- while `parent` and `children` carry the shape
 * the address cannot: two nodes at the same depth are neighbours in the
 * address space and may sit in entirely different subtrees.
 */
interface TreeNode {
  /** What the node is called, among its siblings. */
  name: string;
  /** How deep it sits, with a top-level node at zero. */
  depth: number;
  /** Its position among every node at that depth, in declared order. */
  index: number;
  /** Its parent's address, or null for a top-level node. */
  parent: Coordinate | null;
  /** Its children's addresses, in declared order. */
  children: Coordinate[];
  /** The magnitude the layer declared for it, or NaN. */
  declared: number;
  /** Its magnitude: the declared one, or its children's total. */
  value: number;
  /** Index into the declared array, for highlight selectors. */
  source: number | null;
}

/** Rotor unit that walks a whole level of the tree, across parents. */
const LEVEL_ROTOR_UNIT: RotorFilterUnit = {
  key: 'level',
  label: 'Level',
  noun: 'nodes on this level',
};

/** Formats a fraction as a percentage, to one decimal place. */
function asPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Trace implementation for treemaps and any other hierarchy laid out as area.
 *
 * A treemap encodes a tree as nested rectangles whose area is a magnitude.
 * Every other trace in MAIDR is a flat grid, and a tree read as one loses the
 * only thing the chart is drawn to show: a list of thirty leaves says nothing
 * about which three of them make up most of Europe.
 *
 * **The tree navigates as a tree, on the arrow keys that already exist.** Up
 * returns to the parent, down enters the first child, left and right walk the
 * siblings -- the file-manager interaction, which is the one a reader already
 * has. No new command, no new keybinding: a node's address is `(depth,
 * index-at-that-depth)`, and {@link MovableGraph} already navigates an
 * arbitrary graph over such addresses. Siblings are linked to each other and
 * nothing else, so left and right stay inside one parent; a cousin is reached
 * by going up, across and back down, which is what the tree structure means.
 *
 * **This is a chart a non-visual reading can do better than a visual one.** A
 * sighted reader compares areas by eye and is poor at it -- that is the
 * standing criticism of the form. A reader given the tree is told each node's
 * exact share of its parent, which is the comparison the rectangles are drawn
 * to support and the one the eye estimates worst.
 *
 * **The hierarchy is declared as a path, never as a parent pointer.** A path
 * is acyclic by construction and cannot be orphaned: a node whose ancestors
 * are named is placed, and there is no id to dangle. Producers all have it --
 * a `d3.hierarchy` walk yields it directly, and Plotly's `labels`/`parents`
 * pair resolves to it -- and it is also the breadcrumb, so the reader is told
 * where they are out of the same field that put them there.
 *
 * Interior nodes need not be declared. A layer that emits only its leaves --
 * which is what a treemap draws -- gets its interior nodes and their totals
 * derived. A layer that declares them keeps the declared numbers, since a
 * parent may carry mass of its own that no child accounts for, and a total
 * that disagrees with the sum of its children is a fact about the data rather
 * than an error to correct.
 */
export class TreemapTrace extends AbstractTrace {
  /**
   * The go-to-extrema **dialog** -- the list of named targets a trace offers
   * under `g` -- which a tree has none of. Every node is already one step
   * from its parent and its siblings, and the largest leaf is named in the
   * description.
   *
   * It has to be false rather than merely unimplemented. `getExtremaTargets`
   * defaults to `[]` while the toggle command gates only on this flag, so a
   * true here switches the reader into the `GO_TO_EXTREMA` scope, renders an
   * empty dialog, and leaves the arrow keys answering to a keymap that is no
   * longer the tree's -- a keyboard trap whose only exit is a binding the
   * help menu does not list. `navigateToExtrema` throws in the same case.
   *
   * Unrelated to `moveToExtreme`, the Ctrl+arrow jump out to the branch root
   * or in to the deepest descendant: that runs through the movable and is
   * unaffected by this flag.
   */
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGraph;

  /** Every node, indexed the way the cursor addresses them. */
  private readonly nodes: (TreeNode | null)[][];

  /** Magnitudes in the same shape, which is what the modalities read. */
  private readonly nodeValues: number[][];

  /** Per-depth extremes, for the pitch range. */
  private readonly depthMin: number[];
  private readonly depthMax: number[];

  /** Every top-level node's total, added up. */
  private readonly grandTotal: number;

  /**
   * Where each node sits around the dial, in radians, shaped as `nodes` is.
   *
   * A sunburst lays a node's children across its own arc in proportion to
   * their values, so the angle is derived from the tree rather than declared:
   * it is the layout, computed the way the chart was drawn. Only a sunburst
   * reads it -- a treemap and an icicle are rectangular and have no dial.
   */
  private readonly midAngles: number[][];

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new treemap trace.
   *
   * @param layer - The MAIDR layer carrying the nodes
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const points = layer.data as TreemapPoint[];
    this.nodes = TreemapTrace.buildTree(points);
    this.nodeValues = this.nodes.map(level =>
      level.map(node => node?.value ?? Number.NaN));
    this.depthMin = this.nodeValues.map(level => MathUtil.safeMin(level));
    this.depthMax = this.nodeValues.map(level => MathUtil.safeMax(level));
    this.grandTotal = (this.nodes[0] ?? []).reduce(
      (total, node) => total + (node?.value ?? 0),
      0,
    );
    this.midAngles = this.layOutAngles();
    this.highlightValues = this.mapToSvgElements(layer.selectors, points.length);
    this.movable = new MovableGraph(this.buildGraph());
  }

  /**
   * Resolves the declared points into a tree addressed by depth and index.
   *
   * Every ancestor named by a path exists whether or not it was declared, so
   * a layer emitting only its leaves is a complete tree. Order within a level
   * is the order the producer declared its nodes in, which is the order the
   * rectangles were drawn and therefore the order the selectors are in.
   *
   * @param points - The declared nodes
   * @returns Every node, indexed by depth then by position within it
   */
  private static buildTree(points: TreemapPoint[]): (TreeNode | null)[][] {
    const levels: TreeNode[][] = [];
    // Keyed by the joined path, which cannot collide the way a string key
    // built from names alone could: the map is nested one level per ancestor.
    const byPath = new Map<string, TreeNode>();

    /**
     * The node at a path, created along with any missing ancestor.
     *
     * @param path - Names from the root down to the node
     * @returns The node
     */
    function ensure(path: readonly (string | number)[]): TreeNode {
      const key = JSON.stringify(path);
      const existing = byPath.get(key);
      if (existing !== undefined) {
        return existing;
      }

      const depth = path.length - 1;
      const parent = depth > 0 ? ensure(path.slice(0, -1)) : null;
      const level = levels[depth] ?? (levels[depth] = []);
      const node: TreeNode = {
        name: String(path[path.length - 1]),
        depth,
        index: level.length,
        parent: parent === null ? null : { row: parent.depth, col: parent.index },
        children: [],
        declared: Number.NaN,
        value: 0,
        source: null,
      };
      level.push(node);
      byPath.set(key, node);
      parent?.children.push({ row: depth, col: node.index });
      return node;
    }

    for (const [source, point] of points.entries()) {
      const path = [...(point.path ?? []), point.x];
      const node = ensure(path);
      node.source = source;
      if (typeof point.y === 'number' && Number.isFinite(point.y)) {
        node.declared = point.y;
      }
    }

    // Deepest first, so a parent's children are already totalled when it is
    // reached. A declared total wins over the derived one: a parent may carry
    // mass no child accounts for, and correcting it would be inventing data.
    for (let depth = levels.length - 1; depth >= 0; depth--) {
      for (const node of levels[depth]) {
        node.value = Number.isFinite(node.declared)
          ? node.declared
          : node.children.reduce(
              (total, child) => total + (levels[child.row][child.col]?.value ?? 0),
              0,
            );
      }
    }

    return levels;
  }

  /**
   * Wires the tree into the graph the cursor walks.
   *
   * `up` is the parent and `down` the first child, so a level of the tree is
   * entered and left the way a folder is. `left` and `right` are **siblings**
   * rather than neighbours at the same depth: two adjacent entries of a level
   * may belong to different parents, and stepping between them would carry
   * the reader into another subtree without saying so.
   *
   * @returns The navigation graph, addressed as the nodes are
   */
  private buildGraph(): (Node | null)[][] {
    return this.nodes.map(level =>
      level.map((node) => {
        if (node === null) {
          return null;
        }
        const siblings = this.siblingsOf(node);
        const at = siblings.findIndex(
          sibling => sibling.row === node.depth && sibling.col === node.index,
        );
        return {
          up: node.parent,
          down: node.children[0] ?? null,
          left: at > 0 ? siblings[at - 1] : null,
          right: at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null,
          // Out to the top of this branch, and in to the end of its first
          // line of descent -- the extremes of the axis these keys move on.
          top: this.rootOf(node),
          bottom: this.deepestOf(node),
          start: siblings[0] ?? null,
          end: siblings[siblings.length - 1] ?? null,
        };
      }));
  }

  /**
   * The addresses of a node's siblings, itself included.
   *
   * @param node - The node to place
   * @returns Its parent's children, or the top-level nodes
   */
  private siblingsOf(node: TreeNode): Coordinate[] {
    if (node.parent === null) {
      return (this.nodes[0] ?? []).map((_, col) => ({ row: 0, col }));
    }
    const parent = this.nodes[node.parent.row]?.[node.parent.col];
    return parent?.children ?? [];
  }

  /**
   * The top-level ancestor of a node, which is its branch of the tree.
   *
   * @param node - The node to trace back from
   * @returns The ancestor's address, or null when the node is already one
   */
  private rootOf(node: TreeNode): Coordinate | null {
    let at = node.parent;
    while (at !== null) {
      const parent = this.nodes[at.row]?.[at.col];
      if (parent?.parent == null) {
        return at;
      }
      at = parent.parent;
    }
    return null;
  }

  /**
   * The end of a node's first line of descent.
   *
   * @param node - The node to descend from
   * @returns The deepest first-child's address, or null for a leaf
   */
  private deepestOf(node: TreeNode): Coordinate | null {
    let at: Coordinate | null = node.children[0] ?? null;
    let deepest: Coordinate | null = at;
    while (at !== null) {
      const child: TreeNode | null = this.nodes[at.row]?.[at.col] ?? null;
      at = child?.children[0] ?? null;
      deepest = at ?? deepest;
    }
    return deepest;
  }

  /** The node the cursor is on, when it is on one. */
  private get current(): TreeNode | null {
    return this.nodes[this.row]?.[this.col] ?? null;
  }

  protected get values(): number[][] {
    return this.nodeValues;
  }

  protected get audio(): AudioState {
    const node = this.current;
    // Scaled within the depth rather than across the whole tree, the way a
    // line's rows each carry their own range. A tree's magnitudes fall by an
    // order of magnitude per level, so a single scale would put every leaf on
    // the floor of the range and make the level a reader is actually walking
    // inaudible.
    return {
      freq: {
        min: this.depthMin[this.row] ?? 0,
        max: this.depthMax[this.row] ?? 0,
        raw: node?.value ?? 0,
      },
      panning: this.panning,
    };
  }

  /**
   * Where the sound sits in the stereo field.
   *
   * A sunburst is drawn around a dial, so the pan follows the node around it
   * rather than tracking an index: sweeping a ring goes out to one side and
   * comes back, which is what distinguishes a circle from a row and is the
   * pie's reasoning applied to a tree. `AudioService` reads the pan as
   * `interpolate(x, 0, cols - 1, -1, 1)`, so `cols: 2` makes the mapping
   * `2x - 1`, and `x = (sin θ + 1) / 2` lands the pan on `sin θ` exactly.
   *
   * A treemap and an icicle are rectangular and pan by position, as they did.
   *
   * @returns The panning state
   */
  private get panning(): AudioState['panning'] {
    if (this.type === TraceType.SUNBURST) {
      const angle = this.midAngles[this.row]?.[this.col];
      if (angle !== undefined && Number.isFinite(angle)) {
        return { x: (Math.sin(angle) + 1) / 2, y: this.row, rows: this.nodes.length, cols: 2 };
      }
    }
    return {
      x: this.col,
      y: this.row,
      rows: this.nodes.length,
      cols: this.nodes[this.row]?.length ?? 1,
    };
  }

  /**
   * Lays the tree out around the dial the way a sunburst is drawn.
   *
   * A node's children divide its own arc in proportion to their values, in
   * declared order, so the angle is the layout rather than a guess at it. The
   * top level divides the whole circle. A node whose children's values do not
   * account for its own -- a parent carrying mass no child names -- leaves
   * the remainder of its arc unclaimed, exactly as the drawn chart does.
   *
   * @returns Each node's mid-angle in radians, shaped as the nodes are
   */
  private layOutAngles(): number[][] {
    const angles: number[][] = this.nodes.map(level => level.map(() => Number.NaN));

    /**
     * Places one node and everything under it.
     *
     * @param at - The node's address
     * @param from - Where its arc begins, in radians
     * @param span - How wide its arc is, in radians
     */
    const place = (at: Coordinate, from: number, span: number): void => {
      const node = this.nodes[at.row]?.[at.col];
      if (node === undefined || node === null) {
        return;
      }
      angles[at.row][at.col] = from + span / 2;

      // Divided by the node's own value, not by its children's total: that is
      // what leaves an unaccounted remainder unclaimed rather than silently
      // inflating the children to fill the arc.
      let cursor = from;
      for (const child of node.children) {
        const value = this.nodes[child.row]?.[child.col]?.value ?? 0;
        const width = node.value === 0 ? 0 : span * (value / node.value);
        place(child, cursor, width);
        cursor += width;
      }
    };

    const roots = this.nodes[0] ?? [];
    let cursor = 0;
    for (const [col, node] of roots.entries()) {
      const width = this.grandTotal === 0
        ? 0
        : 2 * Math.PI * ((node?.value ?? 0) / this.grandTotal);
      place({ row: 0, col }, cursor, width);
      cursor += width;
    }
    return angles;
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.nodeValues,
      min: this.depthMin,
      max: this.depthMax,
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

    // Off both axes -- a share, a count and an ancestry are none of them
    // positions on one -- so they travel as asides, which the text service
    // emits as their own clauses and never runs through an axis formatter.
    const asides: { label: string; value: string }[] = [];

    const ancestors = this.ancestorsOf(node);
    if (ancestors.length > 1) {
      // The breadcrumb, from the second level down. At the first level the
      // parent's name is the whole of the path and the share clause below
      // already carries it.
      asides.push({ label: 'Path', value: ancestors.join(' > ') });
    }

    const parent = node.parent === null
      ? null
      : this.nodes[node.parent.row]?.[node.parent.col] ?? null;
    if (parent !== null && parent.value !== 0) {
      // The comparison the rectangles are drawn to support, and the one a
      // sighted reader estimates worst. The parent is named in the label so
      // terse mode -- which drops aside labels -- still has one clause
      // carrying both, rather than a bare percentage of nothing stated.
      asides.push({
        label: `Share of ${parent.name}`,
        value: asPercent(node.value / parent.value),
      });
    } else if (parent === null && this.grandTotal !== 0) {
      asides.push({
        label: 'Share of total',
        value: asPercent(node.value / this.grandTotal),
      });
    }

    if (node.children.length > 0) {
      // Whether there is anything below, which is the one thing the reader
      // cannot discover without pressing down and being told there is not.
      asides.push({ label: 'Children', value: String(node.children.length) });
    }

    return {
      main: { label: this.xAxis, value: node.name },
      cross: { label: this.yAxis, value: node.value },
      mainAxis: 'x',
      crossAxis: 'y',
      asides,
    };
  }

  /**
   * A node's ancestors, root first, excluding the node itself.
   *
   * @param node - The node to trace back from
   * @returns The names of its ancestors
   */
  private ancestorsOf(node: TreeNode): string[] {
    const names: string[] = [];
    let at = node.parent;
    while (at !== null) {
      const parent: TreeNode | null = this.nodes[at.row]?.[at.col] ?? null;
      if (parent === null) {
        break;
      }
      names.unshift(parent.name);
      at = parent.parent;
    }
    return names;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.nodes.length,
      cols: this.nodes[this.row]?.length ?? 0,
    };
  }

  /**
   * Offers a walk along the whole level, across parents.
   *
   * The arrow keys stay the tree: left and right are siblings, and a step
   * past the last child of a parent is refused rather than landing in a
   * cousin's subtree unannounced. That is the right default and it is what
   * makes this a hierarchy rather than a grid -- but it is not the only
   * reading anyone wants. An icicle is *drawn* as depth-ordered bands, a
   * whole row of blocks per level, and "everything at this depth, in layout
   * order" is a question that reading asks directly.
   *
   * So the band goes on the rotor rather than on the arrows. One data model
   * with two different arrow semantics, chosen by which layout the producer
   * happened to pick, would be worse for a reader who meets both than one
   * semantics plus an explicit mode.
   *
   * Withheld on a level of one, where it could only ever answer "none found".
   *
   * @returns The level unit alongside whatever else is offered
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    const hasBand = this.nodes.some(level => level.length > 1);
    return hasBand ? [...inherited, LEVEL_ROTOR_UNIT] : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== LEVEL_ROTOR_UNIT.key) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const level = this.nodes[this.row] ?? [];
    const step = direction === 'right' ? 1 : -1;
    let target = this.col + step;
    while (target >= 0 && target < level.length && level[target] === null) {
      target += step;
    }

    if (target < 0 || target >= level.length) {
      this.notifyRotorBounds();
      return false;
    }

    this.movable.moveToIndex(this.row, target);
    this.notifyStateUpdate();
    return true;
  }

  public get description(): DescriptionState {
    const every = this.nodes.flat().filter((node): node is TreeNode => node !== null);
    const leaves = every.filter(node => node.children.length === 0);

    const stats: DescriptionState['stats'] = [
      { label: 'Levels', value: this.nodes.length },
      { label: 'Number of nodes', value: every.length },
      { label: 'Number of leaves', value: leaves.length },
      { label: 'Total', value: this.grandTotal },
    ];

    const roots = this.nodes[0] ?? [];
    if (roots.length > 0 && this.grandTotal !== 0) {
      // The top-level breakdown, which is the first thing a sighted reader
      // takes from the layout and the last thing a walk of thirty leaves
      // would assemble.
      stats.push({
        label: 'Top level',
        value: roots
          .filter((node): node is TreeNode => node !== null)
          .map(node => `${node.name} ${asPercent(node.value / this.grandTotal)}`)
          .join(', '),
      });
    }

    const largest = leaves.reduce<TreeNode | null>(
      (best, node) => (best === null || node.value > best.value ? node : best),
      null,
    );
    if (largest !== null) {
      // Named with its ancestry, because a leaf's name alone does not say
      // which branch it is the largest thing in.
      stats.push({
        label: 'Largest leaf',
        value: `${[...this.ancestorsOf(largest), largest.name].join(' > ')}, `
          + `${largest.value}`,
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: ['Path', this.xAxis, this.yAxis, 'Share of total'],
        rows: every.map(node => [
          this.ancestorsOf(node).join(' > '),
          node.name,
          node.value,
          this.grandTotal === 0 ? '' : asPercent(node.value / this.grandTotal),
        ]),
      },
    };
  }

  /**
   * Maps the declared nodes onto their drawn rectangles.
   *
   * A selector list is in the order the nodes were declared, so it is indexed
   * by `source` rather than by address -- a node the layer derived from a
   * path was never drawn and has nothing to highlight, and gets a hidden
   * placeholder so the shape still matches the cursor's.
   *
   * Withdrawn entirely on a count mismatch, the way {@link BoxenTrace} does:
   * a list that has slipped by one highlights a neighbouring rectangle for
   * the rest of the chart, which is worse than not highlighting at all.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many nodes the layer declared
   * @returns One element per node, in the cursor's own shape, or null
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

    return this.nodes.map(level =>
      level.map((node) => {
        const element = node === null || node.source === null
          ? undefined
          : flat[node.source];
        return element ?? Svg.createEmptyElement();
      }));
  }

  protected findNearestPoint(): NearestPoint | null {
    // A treemap's rectangles nest, so a pointer sits inside every ancestor of
    // the leaf it is over at once. Which of them the reader meant is a
    // question the coordinates cannot answer, and guessing the leaf would
    // drop them out of whichever level they were walking.
    return null;
  }
}
