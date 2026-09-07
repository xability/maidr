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

    // The band travels as the `interval` the line trace already read off
    // `yMin`/`yMax`: the text service speaks it after the estimate. Setting
    // `crossRange` from the same bounds would *replace* the estimate with the
    // band, so the survival probability -- the number the curve is read
    // for -- would never be spoken, and the band would be read twice.
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

  protected override get groupFallbackLabel(): string {
    return 'Arm';
  }

  /**
   * The vocabulary the description dialog is rendered with.
   *
   * Inherited, a survival figure opened "Number of lines: 2, Points per line:
   * 5, Line names: Control, Treatment" with a data-table column headed `Line`,
   * and then named the same two curves `Control` and `Treatment` again -- or,
   * on a layer authoring no z, `Arm 1` and `Arm 2` -- in the statistics
   * directly below. Two nouns for one referent in one dialog, and `Line` is
   * the wrong one for a clinical figure in the part of it a reader consults
   * most. The same override {@link ContourTrace} makes, for the same reason.
   *
   * The column noun is also what the inherited resolver builds a positional
   * name from ({@link LineTrace.groupNameAt}), so an unnamed curve is `Arm 2`
   * here and `Arm 2` in every statistic below, and the two cannot drift.
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
      count: 'Number of arms',
      perSeries: 'Times per arm',
      names: 'Arm names',
      column: 'Arm',
    };
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    const medians = this.survivalPoints.map((_, arm) => ({
      arm,
      median: this.medianSurvivalOf(arm),
    }));
    // Named as *not reached* rather than omitted when the curve never falls to
    // half. "No median" is a finding -- more than half the subjects were still
    // alive at the end of follow-up -- and leaving the arm out of the list
    // would read as a chart that forgot it.
    const reads = (median: number | string | null): number | string =>
      median === null ? 'not reached' : median;

    stats.push({
      label: 'Median survival',
      // Per arm on a comparison, and bare on a single curve. Prefixed there
      // too, a lone curve authoring no name was told its median belonged to
      // "Arm 1" -- a name nothing else in the figure uses, and one that
      // implies a second arm the reader can go looking for. Every sibling
      // gates its per-series naming on there being more than one series.
      value: medians.length === 1
        ? reads(medians[0].median)
        : medians
            .map(({ arm, median }) => `${this.groupNameAt(arm)}: ${reads(median)}`)
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
      //
      // Split by arm on a comparison, because the argument this class exists
      // to serve is comparative: fourteen censored times split 13 to 1 and
      // split 7 to 7 say entirely different things about which tail to trust,
      // and one summed figure answers neither. It is also the shape the
      // censored-time rotor walks -- it steps through the current arm alone,
      // so a reader on `Treatment` counting one could not reconcile it with a
      // total across both.
      stats.push({
        label: 'Censored times',
        value: this.censoredIndices.length > 1
          ? this.censoredIndices
              .map((indices, arm) => `${this.groupNameAt(arm)}: ${indices.length}`)
              .join(', ')
          : censored,
      });
    }

    const separation = this.separationAtEnd();
    if (separation !== null) {
      // Whether the arms end apart, which is what a two-arm survival figure
      // is drawn to show and what a reader cannot assemble by ear without
      // holding one curve's last value while walking the other. The time is
      // named, because it is the end of the *shorter* arm's follow-up rather
      // than the end of the chart, and a reader told only a number would
      // reasonably assume otherwise.
      //
      // So are the two arms it was measured between: the gap is a maximum over
      // every arm, so on the three-arm figure a dose comparison draws it could
      // belong to any of three pairs. Omitted when the arms are level, where
      // there is no "above" to report.
      const between = separation.high === separation.low
        ? ''
        : `, ${this.groupNameAt(separation.high)} above `
          + `${this.groupNameAt(separation.low)}`;
      stats.push({
        label: 'Separation at the end of shared follow-up',
        value: `${separation.gap} at ${separation.at}${between}`,
      });
    }

    // The fact this class exists to convey, in the one place a reader reviews
    // the whole curve at once. It is announced as a section while navigating
    // and counted in the statistics above, but the inherited table -- times,
    // estimates and the arm -- has nowhere to say that a time was a subject
    // leaving rather than an event, which is exactly the distinction between
    // a tail backed by two hundred subjects and one backed by three.
    //
    // Appended to the inherited rows rather than rebuilt from the points, so
    // the ordinal labels, the blank cells for a gap and the row cap all still
    // apply; the rows are `points.flat()` in order, so the flat index lines up
    // and a truncated table keeps its prefix.
    const hasCensored = this.censoredIndices.some(indices => indices.length > 0);
    if (!hasCensored) {
      return { ...base, stats };
    }

    const flags = this.survivalPoints
      .flat()
      // Blank rather than "no", so the column can be scanned for the times
      // that carry something.
      .map(point => (point.censored === true ? CENSORED : ''));
    return {
      ...base,
      stats,
      dataTable: {
        headers: [...base.dataTable.headers, 'Censored'],
        rows: base.dataTable.rows.map((row, index) => [...row, flags[index] ?? '']),
      },
    };
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
   * @returns The separation, the time it was measured at and the arms it runs
   *   between, or null when there is none to report
   */
  private separationAtEnd():
    | { gap: number; at: number; high: number; low: number }
    | null {
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
    // Carried with the arm each reading came from: the gap alone says how far
    // apart the curves end and not which of them is on top, which is the half
    // of the comparison a survival figure is drawn for.
    const atEnd = this.survivalPoints
      .map((arm, index) => ({ index, survival: SurvivalTrace.survivalAt(arm, at) }))
      .filter(
        (entry): entry is { index: number; survival: number } =>
          entry.survival !== null,
      );
    if (atEnd.length < 2) {
      return null;
    }

    const high = atEnd.reduce((a, b) => (b.survival > a.survival ? b : a));
    const low = atEnd.reduce((a, b) => (b.survival < a.survival ? b : a));
    // Trimmed, because the gap is a subtraction: 0.82 - 0.61 is
    // 0.20999999999999996 in IEEE 754, and announcing that spells out
    // sixteen digits of an artifact the chart does not contain.
    const gap = Number((high.survival - low.survival).toPrecision(12));
    return { gap, at, high: high.index, low: low.index };
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
