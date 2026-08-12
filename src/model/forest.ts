import type { ForestPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import { ErrorBarTrace } from './errorBar';

/**
 * Formats a weight as a percentage, to one decimal place.
 *
 * @param weight - A fraction of one
 * @returns The percentage, as text
 */
function asPercent(weight: number): string {
  return `${(weight * 100).toFixed(1)}%`;
}

/**
 * Trace implementation for forest plots -- the standard figure of a
 * meta-analysis.
 *
 * One effect estimate with its confidence interval per study, laid out on a
 * categorical row axis against a shared null line, with a pooled summary at
 * the foot. Structurally that is the error bar trace, so the sections, the
 * navigation and the braille all transfer, and this adds only what the
 * figure is actually read for.
 *
 * **Whether an interval crosses the null is the result for that study.** A
 * sighted reader takes it from the drawing in one glance -- the interval
 * either touches the line or it does not -- and it is the single fact a
 * meta-analysis is scanned for. Left to the reader, it means holding two
 * bounds in mind and comparing both against a number that appears nowhere in
 * the announcement.
 *
 * **The weight is a third magnitude that is otherwise lost.** A forest plot
 * encodes it as marker *area*, and nothing in an error bar's reading carries
 * it: two studies whose intervals sound alike can contribute wholly
 * differently to the pooled result, and a reader with no weight has no way
 * to tell which.
 *
 * **The pooled row is not a study.** It is what the studies came to, and
 * announcing it as one more of them invites a reader to count it among the
 * evidence.
 */
export class ForestTrace extends ErrorBarTrace {
  /**
   * The value that means no effect, when the layer declares one.
   *
   * There is deliberately no default. A ratio measure is null at 1 and a
   * difference at 0, and guessing wrong is not a degraded reading: assuming
   * 0 on an odds-ratio chart would report every study as not crossing --
   * odds ratios are all positive -- which is a confident wrong answer handed
   * to every row of the figure. A layer that stays quiet gets the estimate,
   * the interval and the weight, and no claim about significance.
   */
  private readonly nullValue: number | null;

  /**
   * Creates a new forest trace.
   *
   * @param layer - The MAIDR layer carrying the studies
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const declared = layer.forestOptions?.nullValue;
    this.nullValue = typeof declared === 'number' && Number.isFinite(declared)
      ? declared
      : null;
  }

  /** The studies and the pooled row, as this trace reads them. */
  private get studies(): ForestPoint[] {
    return this.points as ForestPoint[];
  }

  /**
   * Whether a study's interval spans the null.
   *
   * A one-sided interval is answered on the bound it has: an estimate above
   * the null whose lower bound is also above it does not cross, whatever its
   * missing upper bound would have been. Answers null when the layer declared
   * no null value, or when the point has no bounds to compare.
   *
   * @param point - The study
   * @returns True when it crosses, false when it does not, null when unknown
   */
  private crossesNull(point: ForestPoint): boolean | null {
    if (this.nullValue === null) {
      return null;
    }

    const low = Number.isFinite(point.yMin) ? Number(point.yMin) : null;
    const high = Number.isFinite(point.yMax) ? Number(point.yMax) : null;
    if (low === null && high === null) {
      return null;
    }

    // An interval crosses when the null lies inside it. With one bound
    // missing the interval is unbounded that way, so the bound it does have
    // decides on its own.
    const aboveLow = low === null || this.nullValue >= low;
    const belowHigh = high === null || this.nullValue <= high;
    return aboveLow && belowHigh;
  }

  protected override get text(): TextState {
    const base = super.text;
    const point = this.studies[this.col];
    if (point === undefined) {
      return base;
    }

    const isEstimateRow = base.section === 'value';
    if (!isEstimateRow) {
      // On a bound row the reader is reading the bound. Repeating the verdict
      // and the weight at every one of a study's three rows would bury the
      // number they navigated to.
      return point.pooled === true
        ? { ...base, section: `pooled ${base.section}` }
        : base;
    }

    const crosses = this.crossesNull(point);
    const kind = point.pooled === true ? 'pooled estimate' : 'estimate';
    const verdict = crosses === null
      ? ''
      : crosses ? ', crosses the null' : ', does not cross the null';

    const state: TextState = { ...base, section: `${kind}${verdict}` };

    if (typeof point.weight === 'number' && Number.isFinite(point.weight)) {
      state.z = { label: 'Weight', value: asPercent(point.weight) };
    }

    return state;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    const pooled = this.studies.find(point => point.pooled === true);
    if (pooled !== undefined) {
      const crosses = this.crossesNull(pooled);
      stats.push({
        label: 'Pooled estimate',
        value: crosses === null
          ? `${pooled.x}, ${pooled.y}`
          : `${pooled.x}, ${pooled.y}, ${crosses ? 'crosses' : 'does not cross'} the null`,
      });
    }

    if (this.nullValue !== null) {
      // How many studies individually reached significance is the shape of
      // the evidence, and a reader cannot count it without walking every row
      // and comparing two bounds against a number at each one.
      const evidence = this.studies.filter(point => point.pooled !== true);
      const crossing = evidence.filter(point => this.crossesNull(point) === true);
      stats.push({
        label: 'Studies crossing the null',
        value: `${crossing.length} of ${evidence.length}`,
      });
    }

    const heaviest = this.heaviestStudy();
    if (heaviest !== null) {
      // Which study the pooled result mostly reflects. A meta-analysis whose
      // weight sits in one trial is a different object from one where it is
      // spread, and the announcement gives a weight per row without ever
      // saying where the mass is.
      stats.push({
        label: 'Heaviest study',
        value: `${heaviest.x}, ${asPercent(Number(heaviest.weight))}`,
      });
    }

    return { ...base, stats };
  }

  /**
   * The study contributing the most weight, excluding the pooled row.
   *
   * @returns The heaviest study, or null when none declares a weight
   */
  private heaviestStudy(): ForestPoint | null {
    let best: ForestPoint | null = null;
    for (const point of this.studies) {
      if (point.pooled === true || typeof point.weight !== 'number'
        || !Number.isFinite(point.weight)) {
        continue;
      }
      if (best === null || point.weight > Number(best.weight)) {
        best = point;
      }
    }
    return best;
  }
}
