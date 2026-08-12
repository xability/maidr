import type { HexbinPoint, MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * Trace implementation for hexbin (hexagonal binning) plots.
 *
 * Hexagonal binning is the standard answer to an overplotted scatter: bin the
 * points into hexagons and encode the count as fill. Read as a lattice of
 * cells each carrying a count, that is a heatmap -- and the navigation,
 * braille and pitch all transfer on those terms.
 *
 * **The one real difference is that the rows are offset.** A hex lattice
 * staggers alternate rows by half a cell, which is what lets the hexagons
 * tessellate, and it means a column index does not identify a position: bin 3
 * of one row and bin 3 of the next sit at different x. Moving left or right is
 * unaffected, but moving up or down lands *between* two bins, and something
 * has to decide which one takes focus.
 *
 * This trace picks the bin whose centre is nearest in x. Nearest to *where the
 * reader started*, though, not to the bin they are leaving: a stagger means
 * the two candidates above any bin are exactly equidistant, so choosing
 * relative to the current one means choosing the same way every time, and half
 * a cell of drift per row accumulates into the very slide this is meant to
 * prevent. See {@link HexbinTrace.anchorX}.
 *
 * Getting it wrong is silent, which is why it is worth the mechanism: a cursor
 * walking off the feature it was following announces a real bin with a real
 * count at every step, and a column index -- the one thing that would give it
 * away -- is exactly what this trace does not announce.
 *
 * So the announcement gives the bin's **centre**, not its indices. On a
 * staggered lattice "row 4, column 3" is not a location a reader can hold on
 * to or compare with anything.
 */
export class HexbinTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly bins: HexbinPoint[][];
  private readonly counts: number[][];

  private readonly min: number;
  private readonly max: number;

  /**
   * The x the reader is tracking down a column, or null before they start.
   *
   * A hex lattice offsets alternate rows by half a cell, so a bin has no
   * neighbour directly above it -- it has two, equidistant. Choosing between
   * them relative to the *current* bin means choosing the same way every
   * time, and half a cell of drift per row accumulates into exactly the slide
   * off the feature this navigation exists to prevent: from x = 2 a walk up
   * two rows lands on x = 0.
   *
   * So the choice is made against where the reader *was* when they started
   * moving vertically, and reset the moment they move sideways. This is the
   * "desired column" a text editor keeps while arrowing past short lines, for
   * the same reason and with the same effect.
   */
  private anchorX: number | null = null;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new hexbin trace.
   *
   * @param layer - The MAIDR layer carrying the lattice
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.bins = layer.data as HexbinPoint[][];
    this.counts = this.bins.map(row => row.map(bin => Number(bin.count)));

    const bounds = MathUtil.minMax(this.counts.flat().filter(Number.isFinite));
    this.min = bounds.min;
    this.max = bounds.max;

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<number>(this.counts);
  }

  /**
   * Resolves the layer's selectors to one element per bin.
   *
   * Withdrawn unless the count matches exactly. A hexbin routinely omits the
   * empty cells from the DOM -- there is nothing to draw -- so a selector
   * list that has slipped by one highlights a neighbouring bin for the rest
   * of the lattice, which on a staggered grid is not even a neighbour in the
   * direction a reader would guess.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped rows x bins, or null when unresolvable
   */
  private mapToSvgElements(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[][] | null {
    if (typeof selectors !== 'string' && !Array.isArray(selectors)) {
      return null;
    }

    const flat = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one));

    if (flat.length !== this.bins.flat().length) {
      return null;
    }

    let taken = 0;
    return this.bins.map(row => flat.slice(taken, taken += row.length));
  }

  protected get values(): number[][] {
    return this.counts;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.counts.length,
      cols: this.counts.reduce((widest, row) => Math.max(widest, row.length), 0),
    };
  }

  /**
   * Moves the cursor, keeping a vertical move over the same x.
   *
   * A horizontal move is the grid's own: within a row, the index is the
   * position. A vertical one is not, because the rows are staggered -- so the
   * row is stepped and the column re-chosen as whichever bin's centre is
   * nearest the one being left.
   *
   * @param direction - Which way to move
   * @returns True if the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      // A sideways move is where the reader chooses a new column to track.
      const moved = super.moveOnce(direction);
      if (moved) {
        this.anchorX = null;
      }
      return moved;
    }

    if (this.isInitialEntry) {
      // The first arrow press enters the grid rather than stepping through
      // it, and that convention lives in MovableGrid. Skipping it made the
      // very first keypress either report out of bounds (DOWNWARD off row 0)
      // or skip row 0 entirely (UPWARD), and seed the anchor from a bin the
      // reader was never told about.
      return super.moveOnce(direction);
    }

    const targetRow = this.row + (direction === 'UPWARD' ? 1 : -1);
    const row = this.bins[targetRow];
    if (row === undefined || row.length === 0) {
      this.notifyOutOfBounds();
      return false;
    }

    const anchor = this.anchorX ?? this.currentX();
    if (anchor === null) {
      this.notifyOutOfBounds();
      return false;
    }

    const moved = this.moveToIndex(targetRow, HexbinTrace.nearestByX(row, anchor));
    if (moved) {
      // Set after the move, since moveToIndex clears it: the anchor has to
      // survive the whole vertical walk, and only a sideways move ends it.
      this.anchorX = anchor;
    }
    return moved;
  }

  /**
   * Jumps to the far row, staying over the x the cursor is on.
   *
   * A vertical extreme is a vertical move, so it has the same problem: the
   * base grid carries the *column index* into the far row, and on a stagger
   * an index is not a position. On a sparse lattice -- and a hexbin is
   * sparse, since an empty bin is not drawn -- the rows do not even hold the
   * same number of bins, so the index lands wherever the clamp puts it.
   *
   * This is reachable from Ctrl+Up and Ctrl+Down, which are bound
   * unconditionally rather than gated on `supportsExtrema`: that flag gates
   * the statistical extrema menu, not the grid-edge jump.
   *
   * A horizontal extreme is the grid's own -- within a row, the index is the
   * position -- and ends the vertical walk the same way a horizontal step
   * does.
   *
   * @param direction - Which edge to jump to
   * @returns True if the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      const moved = super.moveToExtreme(direction);
      if (moved) {
        this.anchorX = null;
      }
      return moved;
    }

    if (this.isInitialEntry) {
      return super.moveToExtreme(direction);
    }

    const targetRow = direction === 'UPWARD' ? this.bins.length - 1 : 0;
    const row = this.bins[targetRow];
    const anchor = this.anchorX ?? this.currentX();
    if (row === undefined || row.length === 0 || anchor === null) {
      return super.moveToExtreme(direction);
    }

    const moved = this.moveToIndex(targetRow, HexbinTrace.nearestByX(row, anchor));
    if (moved) {
      // The anchor survives, as it does across an ordinary vertical step. A
      // jump to the far row is still part of one vertical excursion, and the
      // column the reader chose is still the one they chose -- where they
      // land is forced by whatever the far row happens to hold, which on a
      // sparse lattice can be most of the field away. Dropping the anchor
      // here would make the next step resume from a bin the lattice picked
      // rather than from the one they did.
      this.anchorX = anchor;
    }
    return moved;
  }

  public override moveToIndex(row: number, col: number): boolean {
    const moved = super.moveToIndex(row, col);
    if (moved) {
      // An explicit jump is a new starting point, not a continuation of a
      // vertical walk.
      this.anchorX = null;
    }
    return moved;
  }

  /**
   * The x centre of the bin under the cursor.
   *
   * @returns The centre, or null when the cursor is not on a bin
   */
  private currentX(): number | null {
    const x = this.bins[this.row]?.[this.col]?.x;
    return x === undefined ? null : Number(x);
  }

  /**
   * The bin in a row whose centre is closest to a given x.
   *
   * Ties take the earlier bin. A reader stepping up and then straight back
   * down has to land where they started, and a tie broken by "whichever the
   * scan reached last" would depend on the direction of travel.
   *
   * @param row - The row to search
   * @param x - The x centre to stay closest to
   * @returns The index of the nearest bin
   */
  private static nearestByX(row: HexbinPoint[], x: number): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < row.length; index++) {
      const distance = Math.abs(Number(row[index].x) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.counts[this.row]?.[this.col] ?? Number.NaN,
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.counts.length,
        cols: this.counts[this.row]?.length ?? 1,
      },
    };
  }

  protected get braille(): BrailleState {
    // The counts, one row per lattice row -- the heatmap encoding, which is
    // what this is. The stagger has no representation here and needs none: a
    // display is a line of cells and half a cell of offset has nowhere to go
    // in it, while the density pattern the chart is drawn for survives
    // intact.
    return {
      empty: false,
      id: this.id,
      values: this.counts,
      min: this.counts.map(() => this.min),
      max: this.counts.map(() => this.max),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const bin = this.bins[this.row]?.[this.col];

    return {
      // The bin's centre, not its indices. On a staggered lattice a column
      // index is not a location: bin 3 of one row and bin 3 of the next sit
      // at different x, so "column 3" is not something a reader can hold on
      // to or compare between rows.
      main: { label: this.xAxis, value: bin?.x ?? Number.NaN },
      cross: { label: this.yAxis, value: bin?.y ?? Number.NaN },
      z: { label: this.z, value: this.counts[this.row]?.[this.col] ?? Number.NaN },
    };
  }

  public get description(): DescriptionState {
    const flat = this.counts.flat().filter(Number.isFinite);
    const occupied = flat.filter(count => count > 0);
    const total = occupied.reduce((sum, count) => sum + count, 0);

    const stats: DescriptionState['stats'] = [
      { label: 'Number of bins', value: flat.length },
      // How many bins hold anything is the shape of the cloud: a scatter
      // spread evenly fills most of its lattice, and a tight one leaves most
      // of it empty. That is not recoverable from the counts alone without
      // walking every cell.
      { label: 'Occupied bins', value: occupied.length },
      { label: 'Total points', value: total },
    ];

    if (occupied.length > 0) {
      stats.push(
        { label: 'Min count', value: MathUtil.safeMin(occupied) },
        { label: 'Max count', value: this.max },
      );

      const densest = this.densestBin();
      if (densest !== null) {
        stats.push({
          label: 'Densest bin',
          value: `${this.xAxis} ${densest.x}, ${this.yAxis} ${densest.y}`,
        });
      }
    }

    const headers = [this.xAxis, this.yAxis, this.z];
    const rows: (string | number)[][] = this.bins.flatMap((row, y) =>
      row.map((bin, x) => [bin.x, bin.y, this.counts[y][x]]));

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * The centre of the bin holding the most points.
   *
   * Named by its coordinates rather than its indices, for the reason the
   * announcement is: on a staggered lattice the indices do not locate it.
   *
   * @returns The densest bin's centre, or null when the lattice is empty
   */
  private densestBin(): { x: number | string; y: number | string } | null {
    let best: HexbinPoint | null = null;
    for (const [y, row] of this.bins.entries()) {
      for (const [x, bin] of row.entries()) {
        const count = this.counts[y][x];
        if (!Number.isFinite(count)) {
          continue;
        }
        if (best === null || count > Number(best.count)) {
          best = bin;
        }
      }
    }
    return best === null ? null : { x: best.x, y: best.y };
  }

  /**
   * Finds the bin whose drawn hexagon is nearest a pointer position.
   *
   * @param x - Horizontal pointer position
   * @param y - Vertical pointer position
   * @returns The nearest bin, or null when nothing is resolvable
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
