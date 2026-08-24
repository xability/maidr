import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, DescriptionState, TraceState } from '@type/state';
import { MathUtil } from '@util/math';
import { LineTrace } from './line';

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
  /** Per-axis extent, indexed by column rather than by row. */
  private readonly axisMin: number[];
  private readonly axisMax: number[];

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

    const columns = this.lineValues.reduce(
      (widest, row) => Math.max(widest, row.length),
      0,
    );

    const perColumn = Array.from({ length: columns }, (_, column) =>
      this.lineValues
        .map(row => row[column])
        .filter(value => value !== undefined));

    this.axisMin = perColumn.map(values => MathUtil.safeMin(values));
    this.axisMax = perColumn.map(values => MathUtil.safeMax(values));

    this.normalized = this.lineValues.map(row =>
      row.map((value, column) => this.positionOnAxis(value, column)));
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
   * @param column - Which axis it belongs to
   * @returns Its position on that axis
   */
  private positionOnAxis(value: number, column: number): number {
    const min = this.axisMin[column];
    const max = this.axisMax[column];
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      return 0.5;
    }
    return (value - min) / (max - min);
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
        min: this.axisMin[this.col],
        max: this.axisMax[this.col],
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

    const axisNames = this.axisNames();
    if (axisNames.length > 0) {
      // The order is part of the chart: which variables sit next to each other
      // decides which crossings are visible at all, and it is a choice the
      // author made rather than a property of the data.
      stats.push({ label: 'Axes, in order', value: axisNames.join(', ') });

      for (const [column, name] of axisNames.entries()) {
        stats.push({
          label: name,
          value: MathUtil.spanned(this.axisMin[column], this.axisMax[column]),
        });
      }
    }

    return { ...base, stats };
  }

  /**
   * The axis names, in the order the chart draws them.
   *
   * Read from the longest observation rather than the first, so a chart whose
   * rows run to different lengths still names every column a cursor can reach.
   *
   * @returns One name per axis
   */
  private axisNames(): string[] {
    const widest = this.points.reduce(
      (best: LinePoint[], row) => (row.length > best.length ? row : best),
      [] as LinePoint[],
    );
    return widest.map(point => String(point.x));
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
