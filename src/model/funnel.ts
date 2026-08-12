import type { MaidrLayer } from '@type/grammar';
import type { AudioState, DescriptionState, TextState, TraceState } from '@type/state';
import { BarTrace, isMeasured } from './bar';

/**
 * Formats a fraction as a percentage, to one decimal place.
 *
 * One decimal because a funnel's interesting numbers are often small: a stage
 * converting at 0.4% and one converting at 0.9% are more than twice apart, and
 * rounding both to "0%" would report them as identical.
 *
 * @param fraction - A fraction, where 1 is everything
 * @returns The percentage, as text
 */
function asPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Trace implementation for funnel charts -- a population shrinking across
 * ordered stages.
 *
 * Structurally a bar chart whose order is meaningful, so navigation, braille
 * and highlighting transfer. What is different is that **the number a reader
 * wants is not the one the chart plots.** A funnel is read for its drop-offs:
 * which stage loses people, and how badly. That is a ratio between adjacent
 * bars, and a listener cannot take a ratio by ear from two heights heard one
 * at a time.
 *
 * So the pitch carries the **retention** -- what fraction of the previous
 * stage survived -- rather than the count. On a raw scale the worst stage in a
 * funnel is routinely not the biggest fall: going from 10,000 to 2,400 drops
 * three quarters of the range and keeps 24%, while 2,300 to 100 drops only a
 * fifth of the range and keeps **4%**. The second is the catastrophe and the
 * first is the ordinary top of a funnel, and a reader listening to absolute
 * heights hears them the other way round.
 *
 * The count is not lost -- it is announced, alongside the retention and the
 * share of the population that entered. Ratios are what the ear is given,
 * because ratios are what it cannot compute.
 */
export class FunnelTrace extends BarTrace {
  /** Each stage's count, in the order the funnel is walked. */
  private readonly counts: number[];

  /**
   * What fraction of the previous stage reached each one.
   *
   * The first stage is 1: nothing converted into it, and it kept all of
   * itself. That is an artifact of there being no previous stage rather than a
   * measurement, which is why the announcement says "first stage" there
   * instead of "100% retained" -- a reader told the latter would hear a
   * perfect conversion the chart never claimed.
   */
  private readonly retention: number[];

  /** What fraction of the first stage reached each one. */
  private readonly share: number[];

  /**
   * Creates a new funnel trace.
   *
   * @param layer - The MAIDR layer carrying the stages
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.counts = this.barValues[0] ?? [];

    const entered = this.counts[0];
    this.share = this.counts.map(count =>
      FunnelTrace.ratio(count, entered));
    this.retention = this.counts.map((count, stage) =>
      (stage === 0 ? 1 : FunnelTrace.ratio(count, this.counts[stage - 1])));
  }

  /**
   * One count against another, guarded.
   *
   * A stage that measured nothing has no ratio to report, and a stage
   * following an empty one has nothing to be a fraction of -- dividing would
   * hand the audio a non-finite frequency and the announcement an infinity.
   * Both answer `NaN`, which is how this codebase already says a value is
   * absent: the pitch sounds it as a gap and the text reads it as "missing".
   *
   * @param count - The stage's own count
   * @param against - The count it is measured against
   * @returns The fraction, or NaN when there is none
   */
  private static ratio(count: number, against: number): number {
    if (!isMeasured(count) || !isMeasured(against) || against === 0) {
      return Number.NaN;
    }
    return count / against;
  }

  protected override get audio(): AudioState {
    const base = super.audio;

    // Zero to one, and the retention against it. The parent pitches the count
    // against the chart's own range, where the top of a funnel dominates and
    // every later stage is squeezed into the bottom of the register -- so the
    // stages a reader is listening for are the ones the scale flattens.
    return {
      ...base,
      freq: { min: 0, max: 1, raw: this.retention[this.col] },
    };
  }

  protected override get text(): TextState {
    const base = super.text;
    const stage = this.col;

    if (stage === 0) {
      // The entry stage carries neither. Nothing converted into it, so a
      // retention would report a conversion the chart never claimed; and it
      // IS the population that entered, so "Entered is 10000, 100.0% of it"
      // says the same number twice and calls one of them a share.
      //
      // Saying nothing is also the signal: every other stage announces a
      // retention, so the stage that does not is the one the funnel starts
      // at. The description names it too, for a reader who arrived by rotor
      // rather than by walking.
      return base;
    }

    return {
      ...base,
      // What fraction of the previous stage got here.
      z: { label: 'Retained', value: asPercent(this.retention[stage]) },
      // The population that entered, with this stage's share of it. Renders as
      // ", Entered is 10000, 24.0% of it" -- the cumulative view, which the
      // per-stage retention does not give and which a reader would otherwise
      // have to multiply out across every stage they had passed.
      stack: {
        label: 'Entered',
        value: this.counts[0],
        share: this.share[stage],
      },
    };
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    const entry = this.points[0]?.[0]?.x;
    if (entry !== undefined) {
      stats.push({ label: 'Entry stage', value: entry });
    }

    if (this.counts.length > 1) {
      const overall = this.share[this.share.length - 1];
      if (Number.isFinite(overall)) {
        stats.push({ label: 'Overall conversion', value: asPercent(overall) });
      }

      const worst = this.worstStage();
      if (worst !== null) {
        // The finding. A funnel is drawn to locate the stage that loses
        // people, and it is the one thing a reader cannot assemble from a
        // sequence of counts without dividing each by the one before it.
        stats.push({
          label: 'Steepest drop',
          value: `${this.points[0][worst].x}, ${asPercent(this.retention[worst])} retained`,
        });
      }
    }

    return { ...base, stats };
  }

  /**
   * The stage that kept the smallest share of the one before it.
   *
   * Skips the first, which has no previous stage to have lost anyone from.
   *
   * @returns The stage index, or null when no stage has a measured retention
   */
  private worstStage(): number | null {
    let worst: number | null = null;
    for (let stage = 1; stage < this.retention.length; stage++) {
      if (!Number.isFinite(this.retention[stage])) {
        continue;
      }
      if (worst === null || this.retention[stage] < this.retention[worst]) {
        worst = stage;
      }
    }
    return worst;
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    return { ...base, plotType: 'funnel' };
  }
}
