import type { MaidrLayer, SurvivalPoint } from '@type/grammar';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import type { RotorFilterUnit } from './abstract';
import { StepTrace } from './step';

/** Rotor unit that restricts navigation to the censored times. */
const CENSOR_ROTOR_UNIT: RotorFilterUnit = {
  key: 'censored',
  label: 'Censored',
  noun: 'censored times',
};

/** How a censored time announces itself. */
const CENSORED = 'censored';

/**
 * Trace implementation for Kaplan-Meier survival curves.
 *
 * The curve is a step function -- survival holds until an event drops it --
 * so {@link StepTrace} covers the shape, the navigation and the sonification
 * unchanged. What a survival figure carries that a step chart does not is two
 * things, and both are what the figure is actually read for.
 *
 * **Median survival is the number most readers came for.** It is the time at
 * which the curve first reaches half, and it is the single figure a survival
 * analysis is quoted by. A reader without it has to walk the curve holding
 * every probability in mind until one crosses 0.5 -- and on a curve that
 * never gets there, has to walk the whole thing to learn that no median
 * exists, which is itself a result worth stating outright.
 *
 * **Censoring is not an event.** A censored time is a subject who left the
 * study without the event happening; the curve does not step there. It is
 * drawn as a tick precisely because it changes not the estimate but how much
 * of the estimate is still supported by data -- a flat tail backed by two
 * hundred subjects and one backed by three look identical and mean entirely
 * different things. A reader who cannot tell them apart is reading the wrong
 * chart.
 *
 * The risk table printed under the axis is deliberately out of scope. It is
 * a second set of numbers on a second axis, which the issue that asked for
 * this correctly describes as a companion layer rather than something to fold
 * into the curve.
 */
export class SurvivalTrace extends StepTrace {
  private readonly survivalPoints: SurvivalPoint[][];

  /**
   * Column indices, per arm, at which a subject was censored. Computed once,
   * because the rotor service asks twice per keystroke and the data is fixed
   * at construction -- the candlestick's reasoning.
   */
  private readonly censoredIndices: number[][];

  /**
   * Creates a new survival trace.
   *
   * @param layer - The MAIDR layer carrying one curve per arm
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.survivalPoints = layer.data as SurvivalPoint[][];
    this.censoredIndices = this.survivalPoints.map((arm) => {
      const indices = new Array<number>();
      for (let col = 0; col < arm.length; col++) {
        if (arm[col].censored === true) {
          indices.push(col);
        }
      }
      return indices;
    });
  }

  public override get state(): TraceState {
    const base = super.state;
    // StepTrace forces `plotType` to 'step' so a step chart does not announce
    // itself by its raw layer type. A survival curve is a step chart, but it
    // is not *a* step chart to a reader, and the type is one of the few places
    // they learn what they are looking at.
    return base.empty ? base : { ...base, plotType: 'survival' };
  }

  protected override get text(): TextState {
    const base = super.text;
    const point = this.survivalPoints[this.row]?.[this.col];
    if (point === undefined) {
      return base;
    }

    const state: TextState = { ...base };

    if (point.censored === true) {
      // The curve does not step here, so nothing else in the announcement
      // distinguishes this time from the one before it.
      state.section = CENSORED;
    }

    const low = Number(point.yMin);
    const high = Number(point.yMax);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      // The band, alongside the estimate rather than instead of it. How wide
      // the interval is at a time is how much the curve is worth there, and
      // it is the comparison a reader makes when two arms look separated.
      state.crossRange = { min: low, max: high };
    }

    return state;
  }

  /**
   * Offers the censored times when the chart has any.
   *
   * A survival curve routinely carries hundreds of times, most of them
   * uneventful. Censoring is sparse and consequential, so jumping between
   * censored times is navigation this chart calls for -- and a mode whose
   * only possible answer is "none found" is worse than not offering it, so
   * it is withheld on a curve where nobody was censored.
   *
   * @returns The censored unit and whatever the step chart already offers
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    const hasCensored = this.censoredIndices.some(indices => indices.length > 0);
    return hasCensored ? [...inherited, CENSOR_ROTOR_UNIT] : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== CENSOR_ROTOR_UNIT.key) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const indices = this.censoredIndices[this.row] ?? [];
    let target: number | undefined;
    if (direction === 'right') {
      target = indices.find(index => index > this.col);
    } else {
      for (let i = indices.length - 1; i >= 0; i--) {
        if (indices[i] < this.col) {
          target = indices[i];
          break;
        }
      }
    }

    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    this.col = target;
    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    const medians = this.survivalPoints.map((_, arm) => ({
      arm,
      median: this.medianSurvivalOf(arm),
    }));

    // Named per arm, and named as *not reached* rather than omitted when the
    // curve never falls to half. "No median" is a finding -- more than half
    // the subjects were still alive at the end of follow-up -- and leaving
    // the arm out of the list would read as a chart that forgot it.
    stats.push({
      label: 'Median survival',
      value: medians
        .map(({ arm, median }) =>
          `${this.armNameAt(arm)}: ${median === null ? 'not reached' : median}`)
        .join(', '),
    });

    const censored = this.censoredIndices.reduce(
      (total, indices) => total + indices.length,
      0,
    );
    if (censored > 0) {
      // How much of the curve rests on subjects who left rather than on
      // events. A tail carrying many censored times is a tail to read
      // cautiously, and nothing else in the chart says so.
      stats.push({ label: 'Censored times', value: censored });
    }

    const separation = this.separationAtEnd();
    if (separation !== null) {
      // Whether the arms end apart, which is what a two-arm survival figure
      // is drawn to show and what a reader cannot assemble by ear without
      // holding one curve's last value while walking the other. The time is
      // named, because it is the end of the *shorter* arm's follow-up rather
      // than the end of the chart, and a reader told only a number would
      // reasonably assume otherwise.
      stats.push({
        label: 'Separation at the end of shared follow-up',
        value: `${separation.gap} at ${separation.at}`,
      });
    }

    return { ...base, stats };
  }

  /**
   * What an arm is called.
   *
   * @param arm - Which curve
   * @returns Its name
   */
  private armNameAt(arm: number): string {
    const authored = this.survivalPoints[arm]?.[0]?.z;
    return typeof authored === 'string' && authored !== ''
      ? authored
      : `Arm ${arm + 1}`;
  }

  /**
   * The time at which an arm's survival first reaches half.
   *
   * Read forwards and taken at the first time the curve is at or below 0.5,
   * which is the convention: survival is a non-increasing step function, so
   * the first such time is the smallest time whose survival is not greater
   * than a half.
   *
   * @param arm - Which curve
   * @returns The median survival time, or null when the curve never reaches it
   */
  private medianSurvivalOf(arm: number): number | string | null {
    const curve = this.survivalPoints[arm] ?? [];
    for (const point of curve) {
      // A gap is not a crossing: the curve has no value there to compare
      // against a half. `Number.isFinite(null)` was already false.
      const survival = point.y;
      if (survival !== null && Number.isFinite(survival) && survival <= 0.5) {
        return point.x;
      }
    }
    return null;
  }

  /**
   * The gap between the highest and lowest arm at the end of shared
   * follow-up.
   *
   * The time is the earliest last-observation across the arms: past it, one
   * arm has no curve, so there is nothing to compare. Each arm's survival
   * there is read the way a step function is read -- the value carried
   * forward from its last point at or before that time -- rather than by
   * lining the arms up by index.
   *
   * Index alignment is what this did first, and it is wrong for the ordinary
   * case rather than an exotic one: independently fitted arms land on
   * different event and censoring grids, so `arm[i]` of one is simply a
   * different time from `arm[i]` of the other. It reported a gap measured
   * across two different months under a label saying it was one.
   *
   * @returns The separation and the time it was measured at, or null when
   *   there is none to report
   */
  private separationAtEnd(): { gap: number; at: number } | null {
    if (this.survivalPoints.length < 2) {
      return null;
    }

    // A time axis a survival curve can be read along has to be ordered, so a
    // categorical x is answered with silence rather than a guess.
    const lasts = this.survivalPoints.map((arm) => {
      const times = arm.map(point => Number(point.x)).filter(Number.isFinite);
      return times.length === arm.length && times.length > 0
        ? Math.max(...times)
        : null;
    });
    if (lasts.includes(null)) {
      return null;
    }

    const at = Math.min(...(lasts as number[]));
    const atEnd = this.survivalPoints
      .map(arm => SurvivalTrace.survivalAt(arm, at))
      .filter((value): value is number => value !== null);
    if (atEnd.length < 2) {
      return null;
    }

    // Trimmed, because the gap is a subtraction: 0.82 - 0.61 is
    // 0.20999999999999996 in IEEE 754, and announcing that spells out
    // sixteen digits of an artifact the chart does not contain.
    const gap = Number((Math.max(...atEnd) - Math.min(...atEnd)).toPrecision(12));
    return { gap, at };
  }

  /**
   * An arm's survival at a time, read as a step function.
   *
   * The curve holds its value between points, so the survival at a time is
   * the one carried forward from the last point at or before it -- which is
   * what makes two arms comparable at a time neither of them sampled.
   *
   * @param arm - The curve to read
   * @param time - The time to read it at
   * @returns The survival, or null when the curve starts after that time
   */
  private static survivalAt(arm: readonly SurvivalPoint[], time: number): number | null {
    let held: number | null = null;
    for (const point of arm) {
      const x = Number(point.x);
      if (!Number.isFinite(x) || x > time) {
        break;
      }
      if (Number.isFinite(point.y)) {
        held = point.y;
      }
    }
    return held;
  }
}
