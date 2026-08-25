import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, DescriptionState, TraceState } from '@type/state';
import { MathUtil } from '@util/math';
import { isMeasured } from './bar';
import { LineTrace } from './line';

/**
 * The axis names, in the order the chart draws them.
 *
 * The widest observation is the spine: whenever any observation carries a
 * reading on every variable, its points are the chart's axes left to right.
 * A name that observation lacks is appended rather than guessed into place --
 * an axis only gappy observations reach has no neighbour the payload names,
 * and putting it somewhere would assert a drawing order nobody wrote down.
 *
 * @param points - The observations the layer carries
 * @param seen - Every axis name the layer used, in first-seen order
 * @returns One name per axis
 */
function axisOrder(points: LinePoint[][], seen: Iterable<string>): string[] {
  const widest = points.reduce(
    (best: LinePoint[], row) => (row.length > best.length ? row : best),
    [] as LinePoint[],
  );

  const order = widest.map(point => String(point.x));
  const placed = new Set(order);
  for (const axis of seen) {
    if (!placed.has(axis)) {
      order.push(axis);
      placed.add(axis);
    }
  }
  return order;
}

/**
 * Trace implementation for parallel coordinates plots.
 *
 * The data is a multi-line layer's: each observation is a row and each axis a
 * column, so navigation, text and highlighting transfer unchanged. What is new
 * is that **the columns are not one scale**. A line chart's columns are
 * samples of one quantity; a parallel coordinates plot's columns are different
 * quantities entirely -- miles per gallon beside horsepower beside weight --
 * and nothing about them is comparable except each value's position within its
 * own axis.
 *
 * That is the whole chart, and it is what the pitch has to carry. Sonifying
 * against one range for the layer would put every axis measured in small
 * numbers at the bottom of the register and every axis measured in large ones
 * at the top, so a reader would hear the units rather than the data: a car
 * with the best economy and the worst power would sound the same as a car with
 * the worst of both.
 *
 * Scaled per axis, the pitch says where a value sits **on its own axis**, and
 * the pattern the chart is drawn for becomes audible. A reader arrowing along
 * one observation hears it high here and low there; arrowing down a column
 * hears the observations ranked on that variable; and two observations whose
 * pitches swap between adjacent axes are the crossing lines that mean negative
 * correlation -- which is instantly visible and, until now, entirely
 * inaudible.
 */
export class ParallelTrace extends LineTrace {
  /**
   * Each axis's extent, keyed by the name its points carry.
   *
   * Keyed rather than indexed because a column position is not an axis. An
   * observation with no reading on one variable is one point shorter, so from
   * that gap onwards its values sit a column to the left of the axis they
   * belong to -- and an extent taken by position would then be a horsepower
   * range with a car's weight at the top of it, which is the exact mixing of
   * units this class exists to prevent (#1182). Every point already names its
   * own axis in `x`, so nothing has to be inferred from where it sits.
   */
  private readonly axisExtent: Map<string, { min: number; max: number }>;

  /**
   * The axis names, in the order the chart draws them.
   *
   * Taken from the widest observation, which is the chart's axes in order
   * whenever any observation reaches all of them. A name no widest-row
   * observation carries is appended: the payload says the axis exists but
   * gives nothing that would place it between two others, and inventing a
   * position would be a claim about the drawing that was never made.
   */
  private readonly axisOrder: string[];

  /**
   * Each value's position on its own axis, from 0 to 1.
   *
   * Held rather than recomputed because braille reads the whole grid on every
   * move, and the extents it is computed from are fixed at construction.
   */
  private readonly normalized: number[][];

  /**
   * Creates a new parallel coordinates trace.
   *
   * @param layer - The MAIDR layer carrying the observations
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const perAxis = new Map<string, number[]>();
    this.points.forEach((row, index) => {
      row.forEach((point, column) => {
        const axis = String(point.x);
        // Registered even when every one of its readings is a gap, so an axis
        // a cursor can still reach is still named rather than disappearing
        // from the dialog.
        const collected = perAxis.get(axis) ?? [];
        perAxis.set(axis, collected);
        // Gaps are filtered out of the extent rather than filtered in, for the
        // reason `LineTrace` gives: `Math.min` of anything holding `NaN` is
        // `NaN`, which would leave every value on the axis with a non-finite
        // range and silence the whole variable rather than the one gap.
        const value = this.lineValues[index][column];
        if (isMeasured(value))
          collected.push(value);
      });
    });

    this.axisOrder = axisOrder(this.points, perAxis.keys());
    this.axisExtent = new Map(
      [...perAxis].map(([axis, values]) => [
        axis,
        { min: MathUtil.safeMin(values), max: MathUtil.safeMax(values) },
      ]),
    );

    this.normalized = this.points.map((row, index) =>
      row.map((point, column) =>
        this.positionOnAxis(this.lineValues[index][column], String(point.x))));
  }

  /**
   * Places a value within its own axis, from 0 (lowest) to 1 (highest).
   *
   * An axis whose observations all share one value has no spread to place
   * anything within, so every value sits at the midpoint rather than at an
   * end: 0 and 1 both claim an extreme the data does not have, and the
   * midpoint is the honest reading of "nothing distinguishes these".
   *
   * @param value - The raw value
   * @param axis - The name of the axis it belongs to
   * @returns Its position on that axis
   */
  private positionOnAxis(value: number, axis: string): number {
    const { min, max } = this.extentOf(axis);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      return 0.5;
    }
    return (value - min) / (max - min);
  }

  /**
   * One axis's extent, by name.
   *
   * The fallback is unreachable through either caller: both ask with a name
   * taken from a point of this layer, and every point registered its own name
   * when the extents were built. It is here so that a name from anywhere else
   * degrades to "no spread" -- the midpoint -- rather than borrowing a range
   * measured in another variable's units, which is the failure this whole
   * class is arranged against.
   *
   * @param axis - The axis name a point carries
   * @returns Its extent, or a non-finite pair for a name the layer never used
   */
  private extentOf(axis: string): { min: number; max: number } {
    return this.axisExtent.get(axis) ?? { min: Number.NaN, max: Number.NaN };
  }

  /** The axis the cursor is on, by the name the point under it carries. */
  private get axisAtCursor(): string {
    return String(this.points[this.row]?.[this.col]?.x ?? '');
  }

  protected override get audio(): AudioState {
    const base = super.audio;

    // `LineTrace` scales against the CURRENT ROW's extent, which is right for
    // a series sampling one quantity and wrong here: a row spans every axis,
    // so its extent is the range of a horsepower figure and a fuel-economy
    // figure taken together, which is not a range of anything.
    return {
      ...base,
      freq: {
        ...base.freq,
        ...this.extentOf(this.axisAtCursor),
      },
    };
  }

  protected override get braille(): BrailleState {
    const base = super.braille;
    if (base.empty) {
      return base;
    }

    // The normalized grid, scaled 0 to 1 for every row, rather than the raw
    // values. `LineBrailleEncoder` scales each row against that row's own
    // extent, and a row here holds one observation across every axis -- so a
    // car's economy would be scaled against its horsepower, and the cell
    // heights would encode which axis happens to use bigger numbers.
    //
    // Normalizing first makes each cell its value's position on its own axis,
    // which is what the pitch plays and what the chart draws. A row of the
    // display is then one observation's profile across the variables, and two
    // rows can be compared cell by cell.
    return {
      ...base,
      values: this.normalized,
      min: this.normalized.map(() => 0),
      max: this.normalized.map(() => 1),
    };
  }

  protected override get groupFallbackLabel(): string {
    // Announced beside the series' own name on every move, so inheriting the
    // line's "Group" puts two words for one referent in one sentence --
    // "Observation 1 of 4, Group is Honda Civic".
    return 'Observation';
  }

  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    // Rendered literally by the description dialog, so the line's wording
    // tells a reader they are on a chart with "lines" and "points per line".
    return {
      count: 'Number of observations',
      perSeries: 'Axes per observation',
      names: 'Observation names',
      column: 'Observation',
    };
  }

  public override get description(): DescriptionState {
    const base = super.description;

    // `LineTrace` reports one Min value and one Max value for the layer. Here
    // those are the smallest and largest numbers anywhere in the chart, taken
    // across axes that measure different things -- a figure with no referent,
    // and the dialog is where a reader goes to learn what the axes are.
    const stats = base.stats.filter(
      stat => stat.label !== 'Min value' && stat.label !== 'Max value',
    );

    if (this.axisOrder.length > 0) {
      // The order is part of the chart: which variables sit next to each other
      // decides which crossings are visible at all, and it is a choice the
      // author made rather than a property of the data.
      stats.push({ label: 'Axes, in order', value: this.axisOrder.join(', ') });

      for (const name of this.axisOrder) {
        const { min, max } = this.extentOf(name);
        stats.push({ label: name, value: MathUtil.spanned(min, max) });
      }
    }

    return { ...base, stats };
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    // `LineTrace` reports itself as a 'single line' or 'multiline' plot, which
    // is what the instruction text and the layer-switch cue announce.
    return { ...base, plotType: 'parallel coordinates' };
  }
}
