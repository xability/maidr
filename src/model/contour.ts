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
      state.asides = [{ label: 'Spacing', value: String(spacing.distance) }];
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

    const declared = this.levels.filter(Number.isFinite);
    if (declared.length > 0) {
      // How many levels there are and what they are -- the first two
      // questions a contour plot is read with, and neither is answerable by
      // walking a curve, which knows only its own.
      stats.push({ label: 'Number of levels', value: declared.length });
      stats.push({ label: 'Levels', value: declared.join(', ') });

      const steps = declared
        .slice(1)
        .map((level, i) => withoutFloatNoise(level - declared[i]));
      const uniform = steps.length > 0
        && steps.every(step => step === steps[0]);
      if (uniform) {
        // A uniform step is what lets a reader treat spacing as gradient
        // directly: equal value between curves means the distance between
        // them IS the slope. A varying step does not, so it is named as
        // varying rather than averaged into a number that would mislead.
        stats.push({ label: 'Level step', value: steps[0] });
      } else if (steps.length > 0) {
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
   * @returns The point and the gap, or null when no gap is measurable
   */
  private steepestPoint(): { distance: number; x: number; y: number } | null {
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
    return best;
  }
}
