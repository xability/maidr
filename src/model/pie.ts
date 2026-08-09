import type { MaidrLayer, PiePoint } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { isMeasured } from './bar';
import { MovableGrid } from './movable';

/** Label the percentage rides under in text and in the data table. */
const PERCENTAGE_LABEL = 'Percentage';

/** How a gap is named wherever a slice has no measurement to report. */
const MISSING_TEXT = 'missing';

/**
 * Reads one slice's magnitude, keeping a gap distinguishable from a zero.
 *
 * {@link PiePoint.y} is declared numeric, but it arrives from parsed JSON: a
 * producer with no measurement for a slice emits `null`, and `Number(null)` is
 * `0`. A zero slice is a real measurement — it counts toward the total and can
 * be the minimum — so an absent one must not collapse into it. `NaN` keeps it
 * absent, which is what {@link isMeasured} and the text layer already read as
 * a gap. Mirrors `toBarValue` in `bar.ts`, for the same reasons.
 *
 * A negative slice is read as a gap too. {@link PiePoint.y} documents that a
 * negative value is not meaningful in a pie, and nothing upstream is obliged to
 * enforce that: left in, it subtracts from the total every other slice's share
 * is divided by, so a pie of 60, -40 and 30 announces its first slice as 120%
 * and the percentages stop summing to anything. Reading it as a gap is the
 * treatment this trace already has for a slice with nothing to report — out of
 * the total, out of the range, announced as missing — which tells the reader
 * about the one bad slice instead of quietly corrupting every other one.
 *
 * @param raw - The value from the slice
 * @returns The magnitude, or `NaN` when the slice is a gap
 */
function toSliceValue(raw: number | string | null | undefined): number {
  if (raw === null || raw === undefined) {
    return Number.NaN;
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return Number.NaN;
  }
  const value = Number(raw);
  // `NaN < 0` is false, so an unparseable value falls through unchanged.
  return value < 0 ? Number.NaN : value;
}

/**
 * Formats one slice's share of the whole.
 *
 * A gap has no share to report, so it reads the way its value does. A total of
 * zero has no share to divide by either: `0 / 0` is `NaN`, and "NaN percent" is
 * the one thing this must never announce. It reports an exact zero rather than
 * the one-decimal form used for real ratios, because nothing was rounded to
 * get there.
 *
 * @param value - The slice's magnitude, `NaN` when it is a gap
 * @param total - The sum of every measured slice
 * @returns The percentage as display text, e.g. `33.3%`
 */
function toPercentage(value: number, total: number): string {
  if (!isMeasured(value)) {
    return MISSING_TEXT;
  }
  if (total === 0) {
    return '0%';
  }
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * Whether a screen-space point falls inside an element's filled geometry.
 *
 * `isPointInFill` works in the element's own user space, so the point has to be
 * pushed back through the screen transform first. Both that transform and the
 * method itself are absent on a non-geometry element (a producer whose selector
 * resolves to the `<g>` wrapping each wedge) and in non-rendering environments;
 * there the slice simply cannot be hit-tested, which costs pointer guidance and
 * nothing else.
 *
 * @param element - The candidate wedge
 * @param x - Screen-space x position of the pointer
 * @param y - Screen-space y position of the pointer
 * @returns True when the pointer is inside the wedge
 */
function containsScreenPoint(element: SVGElement, x: number, y: number): boolean {
  const geometry = element as SVGGeometryElement;
  if (
    typeof geometry.isPointInFill !== 'function'
    || typeof geometry.getScreenCTM !== 'function'
  ) {
    return false;
  }

  const screenToUser = geometry.getScreenCTM()?.inverse();
  if (!screenToUser) {
    return false;
  }

  return geometry.isPointInFill(new DOMPoint(x, y).matrixTransform(screenToUser));
}

/**
 * A pie chart: N slices read as one row, left and right.
 *
 * Extends {@link AbstractTrace} directly rather than `AbstractBarPlot`, which
 * bakes an orientation into its bar values, audio panning, text axes and
 * description. A pie has no orientation — its slices are arranged around a
 * circle, not along an axis — so every one of those derived values would have
 * to be undone again here.
 *
 * The slices are wrapped in a single row so {@link MovableGrid} navigates
 * them: with one row, up and down are out of bounds by its own bounds checks,
 * which is exactly the navigation a pie wants.
 */
export class PieTrace extends AbstractTrace {
  protected readonly movable: Movable;

  protected readonly points: PiePoint[][];
  protected readonly highlightValues: SVGElement[][] | null;

  /** Slice magnitudes, in the same single-row shape as {@link points}. */
  private readonly sliceValues: number[][];
  /** Each slice's share of the whole, as display text. */
  private readonly percentages: string[];

  private readonly min: number;
  private readonly max: number;
  private readonly total: number;

  protected readonly supportsExtrema = false;

  /**
   * Constructs a new PieTrace instance.
   * @param layer - The MAIDR layer configuration
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = [layer.data as PiePoint[]];

    const values = this.points[0].map(point => toSliceValue(point.y));
    this.sliceValues = [values];

    // A gap is not a measurement, so it must take part in neither the range
    // every slice's pitch is scaled against nor the total the percentages are
    // shares of — a missing slice that silently counted as zero would still
    // shrink every other slice's reported share.
    const measured = values.filter(isMeasured);
    this.min = MathUtil.safeMin(measured);
    this.max = MathUtil.safeMax(measured);
    this.total = measured.reduce((sum, value) => sum + value, 0);

    // Derived once here, not per state read: the state getters are called on
    // every navigation step (and again by getStateAt for monitor mode), and
    // they must stay cheap and side-effect free.
    this.percentages = values.map(value => toPercentage(value, this.total));

    this.highlightValues = this.mapToSvgElements(layer.selectors as string);
    this.movable = new MovableGrid<PiePoint>(this.points);
  }

  /**
   * Cleans up pie resources including points and percentages.
   *
   * {@link sliceValues} is deliberately left alone: {@link dimension} reads it,
   * and a disposed trace can still be asked for an out-of-bounds state.
   */
  public override dispose(): void {
    this.points.length = 0;
    this.percentages.length = 0;

    super.dispose();
  }

  protected get audio(): AudioState {
    // Pitch maps the raw magnitude, not the percentage. The two are a monotone
    // rescale of each other, so the pitch ordering is identical either way, and
    // the raw value keeps audio agreeing with braille and the reported stats.
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.sliceValues[this.row][this.col],
      },
      panning: {
        x: this.col,
        y: 0,
        rows: 1,
        cols: this.sliceValues[this.row].length,
      },
    };
  }

  protected get braille(): BrailleState {
    // The bar encoding, over a single row: each cell's height is the slice's
    // magnitude within the range of the pie's slices.
    return {
      empty: false,
      id: this.id,
      values: this.sliceValues,
      min: [this.min],
      max: [this.max],
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.points[this.row][this.col];

    // The percentage rides the optional z slot, which the text service renders
    // as ", Percentage is 33.3%" after the label and the value.
    return {
      main: { label: this.xAxis, value: point.x },
      cross: { label: this.yAxis, value: this.sliceValues[this.row][this.col] },
      z: { label: PERCENTAGE_LABEL, value: this.percentages[this.col] },
      mainAxis: 'x',
      crossAxis: 'y',
    };
  }

  /**
   * Gets the description state for the pie trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    // A pie of nothing but gaps has no range and nothing to add up, and
    // safeMin/safeMax answer an empty set with ±Infinity. Report all three the
    // way every other modality reports an absent value, rather than announcing
    // an infinity or a total of zero that was never measured.
    const hasMeasured = isMeasured(this.min);
    const stats: DescriptionState['stats'] = [
      { label: 'Number of slices', value: this.points[0].length },
      { label: 'Min value', value: hasMeasured ? this.min : MISSING_TEXT },
      { label: 'Max value', value: hasMeasured ? this.max : MISSING_TEXT },
      { label: 'Total', value: hasMeasured ? this.total : MISSING_TEXT },
    ];

    const headers = [this.xAxis, this.yAxis, PERCENTAGE_LABEL];
    // A gap is spelled out rather than left as the NaN the dialog would blank:
    // a blank cell and a cell nobody filled in read the same way to a screen
    // reader walking the table, and the percentage column has to say something
    // in any case.
    const rows: (string | number)[][] = this.points[0].map((point, col) => [
      point.x,
      isMeasured(this.sliceValues[0][col]) ? this.sliceValues[0][col] : MISSING_TEXT,
      this.percentages[col],
    ]);

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: 1,
      cols: this.sliceValues[this.row].length,
    };
  }

  protected get values(): number[][] {
    return this.sliceValues;
  }

  /**
   * Resolves the layer's selector to one SVG element per slice.
   *
   * The contract is exactly N elements in slice order, so data index k and
   * element k are the same slice. A different count means the selector is
   * addressing something other than the wedges, and index-aligning it anyway
   * would highlight the wrong slice — better to report no highlight for this
   * layer than a confidently wrong one.
   *
   * @param selector - The layer's CSS selector, when it declares one
   * @returns The single row of wedge elements, or null when unresolvable
   */
  private mapToSvgElements(selector?: string): SVGElement[][] | null {
    if (!selector) {
      return null;
    }

    const wedges = Svg.selectAllElements(selector);
    if (wedges.length !== this.points[0].length) {
      // Discard the just-inserted hidden clones so they don't leak into the
      // DOM (dispose only removes elements reachable via highlightValues).
      wedges.forEach(wedge => wedge.remove());
      return null;
    }

    return [wedges];
  }

  /**
   * Finds the slice under the specified coordinates.
   *
   * Hit-tests the wedge geometry itself rather than its bounding box, which is
   * what the bar and box traces can get away with: a wedge's box covers a whole
   * quadrant of the circle and overlaps its neighbours', so a box test would
   * routinely report a slice the pointer is nowhere near.
   *
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @returns The slice under the pointer, or null when it is between slices
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    if (!this.highlightValues) {
      return null;
    }

    const wedges = this.highlightValues[0];
    for (let col = 0; col < wedges.length; col++) {
      const wedge = wedges[col];
      if (!containsScreenPoint(wedge, x, y)) {
        continue;
      }

      const box = wedge.getBoundingClientRect();
      return {
        element: wedge,
        row: 0,
        col,
        centerX: box.x + box.width / 2,
        centerY: box.y + box.height / 2,
      };
    }

    return null;
  }

  /**
   * Moves to the next slice that matches the comparison criteria in rotor mode.
   *
   * A gap loses every comparison — `NaN < x` and `NaN > x` are both false — so
   * an unmeasured slice is stepped over rather than being offered as the next
   * larger or smaller one.
   *
   * @param direction - The direction to move (left or right)
   * @param type - The comparison type (lower or higher)
   * @returns True if a matching slice was found, false otherwise
   */
  public override moveToNextCompareValue(
    direction: 'left' | 'right',
    type: 'lower' | 'higher',
  ): boolean {
    const values = this.sliceValues[this.row];
    const current = this.col;
    const step = direction === 'right' ? 1 : -1;

    for (let i = current + step; i >= 0 && i < values.length; i += step) {
      if (this.compare(values[i], values[current], type)) {
        this.col = i;
        this.notifyStateUpdate();
        return true;
      }
    }

    this.notifyRotorBounds();
    return false;
  }
}
