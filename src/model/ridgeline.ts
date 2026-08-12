import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * Trace implementation for ridgeline (joy) plots.
 *
 * One density curve per group along a shared value axis, the curves offset
 * down the page so their shapes can be compared. `ggridges`, Plotly's
 * ridgelines and the seaborn recipes all draw it.
 *
 * **The offset is not data.** A ridgeline's vertical stagger exists so the
 * curves do not sit on top of one another; it says nothing about any group. A
 * layer therefore carries each group's curve on its own terms -- the value it
 * was measured at and the density there -- and never the baseline it happened
 * to be drawn from. This is the same rule the area layer follows: read what
 * the chart is *of*, not where it was put.
 *
 * Two things follow, and they are what make this a type rather than a
 * {@link ViolinKdeTrace} with a different layout.
 *
 * **Every group is pitched against the whole chart.** The violin trace pitches
 * from a reference curve and uses the current group only for volume, which
 * suits a chart drawn to compare each violin against a first one. A ridgeline
 * is drawn so a reader can ask which distribution is tallest, and where --
 * a question that needs one scale across all of them. Scaled per row, every
 * group's own peak would be the highest note it can make and the chart would
 * report a dozen equally tall ridges.
 *
 * **Moving between groups holds the value.** Comparing at a fixed point on the
 * value axis is what the chart is *for*, and it is the comparison a listener
 * cannot make by holding a number in their head across a dozen groups. Groups
 * are not obliged to share a sample grid -- a KDE evaluated over each group's
 * own range does not -- so stepping to the next ridge by *index* lands at a
 * different value, silently: every sample is a real density at a real place,
 * and nothing in the announcement would give it away except the value itself,
 * which is what changed.
 */
export class RidgelineTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly points: ViolinKdePoint[][];
  private readonly densities: number[][];
  private readonly positions: number[][];

  /** Highest density anywhere, so one scale serves every group. */
  private readonly peak: number;

  /**
   * The value the reader is tracking across groups, or null before they start.
   *
   * Groups need not share a sample grid, so an index does not name a place on
   * the value axis. Holding the value the reader chose -- rather than
   * re-deriving it from whichever sample each ridge happened to offer -- is
   * what keeps a walk down the groups a comparison instead of a drift. The
   * hexbin trace holds an x for the same reason; this holds a value.
   */
  private anchor: number | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new ridgeline trace.
   *
   * @param layer - The MAIDR layer carrying one curve per group
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as ViolinKdePoint[][];
    this.densities = this.points.map(row =>
      row.map(point => Number(point.density ?? point.width ?? 0)),
    );
    this.positions = this.points.map(row => row.map(point => Number(point.y)));

    this.peak = MathUtil.safeMax(this.densities.flat().filter(Number.isFinite));

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<ViolinKdePoint>(this.points);
  }

  /**
   * Resolves the layer's selectors to one element per group.
   *
   * A ridgeline is drawn as one filled path per group, not one element per
   * sample, so every sample of a group highlights that group's curve --
   * honest about what was drawn rather than inventing per-sample elements.
   * Withdrawn unless the count matches the number of groups exactly: a list
   * off by one lights a neighbouring ridge for the rest of the chart, and the
   * curves overlap, so which one is lit is not obvious even to a sighted
   * reader looking at it.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped groups x samples, or null when unresolvable
   */
  private mapToSvgElements(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[][] | null {
    if (typeof selectors === 'string') {
      return this.pairWith(Svg.selectAllElements(selectors));
    }
    if (!Array.isArray(selectors)
      || !selectors.every(one => typeof one === 'string')) {
      return null;
    }
    return this.pairWith(selectors.flatMap(one => Svg.selectAllElements(one)));
  }

  /**
   * Pairs resolved elements with the curves, one element per group.
   *
   * @param flat - The elements the selectors resolved to
   * @returns Elements shaped groups x samples, or null on a count mismatch
   */
  private pairWith(flat: SVGElement[]): SVGElement[][] | null {
    if (flat.length !== this.points.length) {
      return null;
    }
    return this.points.map((row, group) => row.map(() => flat[group]));
  }

  protected get values(): number[][] {
    return this.densities;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.points.length,
      cols: this.points.reduce((widest, row) => Math.max(widest, row.length), 0),
    };
  }

  /**
   * Moves the cursor, holding the value when it changes group.
   *
   * Along a curve the index *is* the position, so a horizontal move is the
   * grid's own and ends whatever comparison was in progress. Between groups
   * the index is not a position, because two groups need not share a sample
   * grid -- so the group is stepped and the sample re-chosen as whichever
   * sits nearest the value the reader is holding.
   *
   * @param direction - Which way to move
   * @returns True if the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      const moved = super.moveOnce(direction);
      if (moved) {
        // Choosing a new place on the value axis is what ends a comparison.
        this.anchor = null;
      }
      return moved;
    }

    if (this.isInitialEntry) {
      // The first arrow press enters the grid rather than stepping through it.
      return super.moveOnce(direction);
    }

    const targetGroup = this.row + (direction === 'UPWARD' ? 1 : -1);
    const row = this.positions[targetGroup];
    if (row === undefined || row.length === 0) {
      this.notifyOutOfBounds();
      return false;
    }

    const held = this.anchor ?? this.currentValue();
    if (held === null) {
      this.notifyOutOfBounds();
      return false;
    }

    const moved = this.moveToIndex(targetGroup, RidgelineTrace.nearestTo(row, held));
    if (moved) {
      // Set after the move, since moveToIndex clears it: the value has to
      // survive the whole walk down the groups.
      this.anchor = held;
    }
    return moved;
  }

  /**
   * Jumps to the first or last group, holding the value.
   *
   * A vertical extreme is a vertical move and has the same problem: the base
   * grid carries the *column index* into the far group, and an index is not a
   * place on the value axis when the groups do not share a sample grid. This
   * is reachable from Ctrl+Up and Ctrl+Down, which are bound unconditionally
   * rather than gated on `supportsExtrema` -- that flag gates the statistical
   * extrema menu, not the grid-edge jump.
   *
   * A horizontal extreme is the grid's own -- within a curve the index is the
   * position -- and ends the comparison the same way a horizontal step does.
   *
   * @param direction - Which edge to jump to
   * @returns True if the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      const moved = super.moveToExtreme(direction);
      if (moved) {
        this.anchor = null;
      }
      return moved;
    }

    if (this.isInitialEntry) {
      return super.moveToExtreme(direction);
    }

    const targetGroup = direction === 'UPWARD' ? this.positions.length - 1 : 0;
    const row = this.positions[targetGroup];
    const held = this.anchor ?? this.currentValue();
    if (row === undefined || row.length === 0 || held === null) {
      return super.moveToExtreme(direction);
    }

    const moved = this.moveToIndex(targetGroup, RidgelineTrace.nearestTo(row, held));
    if (moved) {
      // The value survives, as it does across an ordinary step: a jump to the
      // far group is still one comparison, and where it lands is decided by
      // whatever that group happens to have sampled.
      this.anchor = held;
    }
    return moved;
  }

  public override moveToIndex(row: number, col: number): boolean {
    const moved = super.moveToIndex(row, col);
    if (moved) {
      // An explicit jump is a new starting point, not a continuation.
      this.anchor = null;
    }
    return moved;
  }

  /**
   * The value under the cursor.
   *
   * @returns The value, or null when the cursor is not on a sample
   */
  private currentValue(): number | null {
    const value = this.positions[this.row]?.[this.col];
    return value === undefined || !Number.isFinite(value) ? null : value;
  }

  /**
   * The sample in a curve closest to a given value.
   *
   * Ties take the earlier sample, so a reader stepping down and straight back
   * up lands where they started rather than somewhere that depends on the
   * direction of travel.
   *
   * @param row - The curve to search
   * @param value - The value to stay closest to
   * @returns The index of the nearest sample
   */
  private static nearestTo(row: number[], value: number): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < row.length; index++) {
      const distance = Math.abs(row[index] - value);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  /**
   * What a group is called.
   *
   * @param group - Which curve
   * @returns Its name
   */
  private groupNameAt(group: number): string {
    const authored = this.points[group]?.[0]?.x;
    return typeof authored === 'string' && authored !== ''
      ? authored
      : `Group ${group + 1}`;
  }

  protected get audio(): AudioState {
    const density = this.densities[this.row]?.[this.col];

    return {
      freq: {
        // Zero to the chart's peak, not this group's. A ridgeline is drawn to
        // be read across its groups, and a per-group scale would make every
        // ridge's own summit the top of the register -- so a group holding a
        // tenth of another's density would sound exactly as tall.
        min: 0,
        max: this.peak,
        raw: density === undefined ? Number.NaN : density,
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.points.length,
        cols: this.points[this.row]?.length ?? 1,
      },
    };
  }

  protected get braille(): BrailleState {
    // One row per group, every row against the chart's range for the reason
    // the pitch is: a row of full cells should mean a dense group, not merely
    // the densest part of a sparse one.
    return {
      empty: false,
      id: this.id,
      values: this.densities,
      min: this.densities.map(() => 0),
      max: this.densities.map(() => this.peak),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.points[this.row]?.[this.col];
    const density = this.densities[this.row]?.[this.col];

    return {
      main: { label: this.xAxis, value: point === undefined ? Number.NaN : Number(point.y) },
      cross: { label: this.z, value: density === undefined ? Number.NaN : density },
      section: this.groupNameAt(this.row),
    };
  }

  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: 'Number of groups', value: this.points.length },
      { label: 'Groups', value: this.points.map((_, i) => this.groupNameAt(i)).join(', ') },
    ];

    // Where each group peaks, which is the ridgeline's headline finding: the
    // chart is drawn so a reader can see the modes march across the axis, or
    // fail to. Reading it by ear otherwise means walking every sample of
    // every group and holding a dozen maxima in mind.
    const modes = this.points
      .map((_, group) => ({ group, mode: this.modeOf(group) }))
      .filter((entry): entry is { group: number; mode: number } => entry.mode !== null);

    if (modes.length > 0) {
      stats.push({
        label: 'Peak of each group',
        value: modes
          .map(({ group, mode }) => `${this.groupNameAt(group)} at ${mode}`)
          .join(', '),
      });

      // Two groups whose peaks sit at the same place have the same typical
      // value however different their spread, and a reader comparing shapes
      // wants to know which it is.
      const widest = modes.reduce((a, b) => (a.mode > b.mode ? a : b));
      const narrowest = modes.reduce((a, b) => (a.mode < b.mode ? a : b));
      if (widest.mode !== narrowest.mode) {
        stats.push({
          label: 'Peaks span',
          value: `${narrowest.mode} to ${widest.mode}`,
        });
      }
    }

    const headers = [this.z, this.xAxis, 'Density'];
    const rows: (string | number)[][] = this.points.flatMap((row, group) =>
      row.map((point, col) => [
        this.groupNameAt(group),
        Number(point.y),
        this.densities[group][col],
      ]));

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * The value at which a group's density is highest.
   *
   * @param group - Which curve
   * @returns The modal value, or null when the curve carries no density
   */
  private modeOf(group: number): number | null {
    const densities = this.densities[group];
    const positions = this.positions[group];
    if (densities === undefined || densities.length === 0) {
      return null;
    }

    let best: number | null = null;
    let bestDensity = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < densities.length; index++) {
      const density = densities[index];
      if (Number.isFinite(density) && density > bestDensity) {
        bestDensity = density;
        best = positions[index];
      }
    }
    return best === null || !Number.isFinite(best) ? null : best;
  }

  /**
   * Finds the group whose drawn curve is nearest a pointer position.
   *
   * @param x - Horizontal pointer position
   * @param y - Vertical pointer position
   * @returns The nearest sample, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues;
    if (!elements) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let row = 0; row < elements.length; row++) {
      for (let col = 0; col < elements[row].length; col++) {
        const box = elements[row][col].getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const distance = (centerX - x) ** 2 + (centerY - y) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { element: elements[row][col], row, col, centerX, centerY };
        }
      }
    }

    return nearest;
  }
}
