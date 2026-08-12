import type { ContourPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import { LineTrace } from './line';

/** Trims binary floating-point noise from a derived magnitude. */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Trace implementation for contour and filled contour plots.
 *
 * A scalar field drawn as curves of constant value. Structurally that is a
 * multi-line layer -- one curve per level -- so navigation, braille and
 * highlighting all transfer from {@link LineTrace}, and walking a row is
 * walking one iso-value curve.
 *
 * **The level is a first-class object, not a colour.** Read as a plain line
 * layer, the level is a series name at best: the curve announces where it runs
 * and never what value it runs at, which is the first thing anyone asks of a
 * contour plot. So it is announced on the `z` axis -- the field's own axis --
 * where the layer's `z` format applies to it, because it is a value of the
 * field rather than a label for the curve.
 *
 * **Spacing is the gradient.** How densely the curves are drawn is the visual
 * cue for how steeply the field changes, and it is the one thing a reader
 * walking a single curve can never assemble: the curve says nothing about its
 * neighbours. So each point announces the distance to the nearest point on the
 * adjacent level, which is exactly the distance an eye measures between two
 * lines -- tight spacing is a cliff, wide spacing is a plateau.
 *
 * The lattice underneath a contour is a heatmap and {@link Heatmap} reads it,
 * which is the fallback the issue calls the cheap one. What is here is the
 * reading that makes the chart legible.
 */
export class ContourTrace extends LineTrace {
  /** Each curve's level, or NaN where the layer declared none. */
  private readonly levels: number[];

  /** The curves as this trace reads them. */
  private readonly curves: ContourPoint[][];

  /**
   * Memoised {@link ContourTrace.steepestPoint}. `undefined` means not yet
   * computed; `null` is a computed answer of "no gap is measurable".
   */
  private steepest?: { distance: number; x: number; y: number } | null;

  /**
   * Creates a new contour trace.
   *
   * @param layer - The MAIDR layer carrying one curve per level
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.curves = layer.data as ContourPoint[][];
    this.levels = this.curves.map(curve => ContourTrace.levelOf(curve));
  }

  /**
   * The level a curve runs at.
   *
   * Read from the first point that declares one rather than from a fixed
   * index: the level belongs to the curve, so every point of it carries the
   * same number, and a producer that put it on one is emitting something
   * sensible.
   *
   * @param curve - One iso-value curve
   * @returns Its level, or NaN when the curve declares none
   */
  private static levelOf(curve: readonly ContourPoint[]): number {
    for (const point of curve) {
      if (typeof point.level === 'number' && Number.isFinite(point.level)) {
        return point.level;
      }
    }
    return Number.NaN;
  }

  protected override get groupFallbackLabel(): string {
    return 'Contour';
  }

  /**
   * The vocabulary the description dialog is rendered with.
   *
   * Inherited, a contour's description opens "Number of lines: 3, Points per
   * line: 40, Line names: Line 1, Line 2, Line 3" and its data table has a
   * `Line` column of `Line 1` -- the reading this class exists to replace,
   * printed in the part of the description a reader consults most.
   *
   * @returns The four labels the description uses
   */
  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: 'Number of levels',
      perSeries: 'Points per level',
      names: 'Levels',
      column: 'Level',
    };
  }

  /**
   * What a curve is called wherever the description names one.
   *
   * The level, because that is what the curve *is*. `Line 2` is an index into
   * the order the producer happened to emit the curves in, and a reader given
   * it in a column headed `Level` would reasonably take it for one.
   *
   * @param row - Which curve
   * @returns Its level, or the best name available for a curve declaring none
   */
  protected override groupNameAt(row: number): string {
    const level = this.levels[row];
    if (Number.isFinite(level)) {
      return String(level);
    }
    // No level: an authored name if the layer carried one, and otherwise a
    // noun that at least does not read as a level.
    return this.authoredGroupNameAt(row) ?? `Curve ${row + 1}`;
  }

  protected override get text(): TextState {
    const base = super.text;
    const level = this.levels[this.row];
    const state: TextState = { ...base };

    if (Number.isFinite(level)) {
      // On the field's own axis, so the layer's `z` format applies. The level
      // is a value OF the field, not a name for the curve -- which is what a
      // plain line layer would have made it.
      state.z = { label: this.z, value: level };
    }

    const spacing = this.spacingAt(this.row, this.col);
    if (spacing !== null) {
      // Off both axes -- it is a distance in the plane, not a position on
      // either -- so it travels as an aside rather than through a field the
      // text service would format with an axis formatter.
      //
      // The neighbour is named in the same clause rather than in a second
      // aside: terse mode drops aside labels, so two numeric asides would read
      // ", 1, 0.1" and the level would arrive looking like a second distance.
      // It is worth naming at all because the gap is taken to whichever side
      // is closer, so which side that is changes as the reader walks the curve.
      state.asides = [{
        label: 'Spacing',
        value: `${spacing.distance} to level ${spacing.to}`,
      }];
    }

    return state;
  }

  /**
   * How far the nearest adjacent level runs from a point.
   *
   * The distance an eye measures between two neighbouring lines, which is the
   * whole of what contour density conveys visually. Taken to whichever
   * neighbour is closer, because a reader looking at a point sees the gap on
   * both sides and takes the tighter one as the gradient there.
   *
   * Measured to the nearest **sampled point** of the neighbouring curve
   * rather than to the nearest place on the segments between its samples.
   * That is an over-estimate bounded by the sampling interval, and it goes
   * to zero as the producer samples more densely -- which contour producers
   * do, since the curve has to look smooth. Pairing by index instead would
   * not be an approximation at all: two curves of a field are not sampled at
   * the same places, so index `n` of one is simply somewhere else than index
   * `n` of the other.
   *
   * @param row - Which curve
   * @param col - Which point along it
   * @returns The distance and the level it was measured to, or null
   */
  private spacingAt(row: number, col: number): { distance: number; to: number } | null {
    const here = this.curves[row]?.[col];
    if (here === null || here === undefined) {
      return null;
    }
    const x = Number(here.x);
    const y = Number(here.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    let best: { distance: number; to: number } | null = null;
    for (const neighbour of [row - 1, row + 1]) {
      const curve = this.curves[neighbour];
      const level = this.levels[neighbour];
      if (curve === undefined || !Number.isFinite(level)) {
        continue;
      }
      for (const point of curve) {
        const dx = Number(point.x) - x;
        const dy = Number(point.y) - y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (best === null || distance < best.distance) {
          best = { distance: withoutFloatNoise(distance), to: level };
        }
      }
    }
    return best;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    // How many levels there are and what they are -- the first two questions
    // a contour plot is read with, and neither answerable by walking a curve,
    // which knows only its own. Both come from the inherited stats now that
    // `seriesLabels` and `groupNameAt` say level where they used to say line;
    // a single-curve layer is the one case the parent stays silent about,
    // since it has no series list to print.
    const declared = this.levels.filter(Number.isFinite);
    if (this.curves.length === 1 && declared.length === 1) {
      stats.push({ label: 'Level', value: declared[0] });
    }

    // Every curve, or none: a step measured across a curve whose level the
    // layer left out is the distance over two gaps announced as one, and the
    // whole point of naming the step is that a reader may rely on it.
    if (declared.length > 1 && declared.length === this.levels.length) {
      const steps = declared
        .slice(1)
        .map((level, i) => withoutFloatNoise(level - declared[i]));
      const uniform = steps.every(step => step === steps[0]);
      if (uniform) {
        // A uniform step is what lets a reader treat spacing as gradient
        // directly: equal value between curves means the distance between
        // them IS the slope. A varying step does not, so it is named as
        // varying rather than averaged into a number that would mislead.
        stats.push({ label: 'Level step', value: steps[0] });
      } else {
        stats.push({ label: 'Level step', value: 'varies' });
      }
    }

    const steepest = this.steepestPoint();
    if (steepest !== null) {
      // Where the field changes fastest, which on the page is where the lines
      // crowd together -- and which a reader walking one curve at a time
      // cannot find, because the finding is about the gap between curves.
      stats.push({
        label: 'Closest approach between levels',
        value: `${steepest.distance} at ${this.xAxis} ${steepest.x}, `
          + `${this.yAxis} ${steepest.y}`,
      });
    }

    return { ...base, stats };
  }

  /**
   * The point at which two adjacent levels run closest together.
   *
   * Every point measured against every point of both neighbouring curves, so
   * this is quadratic in sampling density: a twenty-level contour sampled two
   * thousand times per curve is tens of millions of distances. It is computed
   * on demand -- only when the description dialog is opened -- and the result
   * is cached, because the curves are fixed at construction, so a reader who
   * opens the dialog repeatedly pays for it once.
   *
   * @returns The point and the gap, or null when no gap is measurable
   */
  private steepestPoint(): { distance: number; x: number; y: number } | null {
    if (this.steepest !== undefined) {
      return this.steepest;
    }

    let best: { distance: number; x: number; y: number } | null = null;
    for (const [row, curve] of this.curves.entries()) {
      for (const [col, point] of curve.entries()) {
        const spacing = this.spacingAt(row, col);
        if (spacing === null) {
          continue;
        }
        if (best === null || spacing.distance < best.distance) {
          best = {
            distance: spacing.distance,
            x: Number(point.x),
            y: Number(point.y),
          };
        }
      }
    }
    this.steepest = best;
    return best;
  }
}
