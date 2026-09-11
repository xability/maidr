import type { ForestPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { ErrorBarTrace, intervalWidth } from './errorBar';

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

    const isEstimateRow = base.section === t('model.errorBarSectionValue');
    if (!isEstimateRow) {
      // On a bound row the reader is reading the bound. Repeating the verdict
      // and the weight at every one of a study's three rows would bury the
      // number they navigated to.
      return point.pooled === true
        ? { ...base, section: t('model.forestPooledSection', { section: base.section }) }
        : base;
    }

    const crosses = this.crossesNull(point);
    const kind = t(point.pooled === true ? 'model.forestPooledEstimate' : 'model.forestEstimate');
    const verdict = crosses === null
      ? ''
      : t(crosses ? 'model.forestCrossesNull' : 'model.forestDoesNotCrossNull');

    const state: TextState = { ...base, section: t('model.forestSection', { kind, verdict }) };

    if (typeof point.weight === 'number' && Number.isFinite(point.weight)) {
      state.z = { label: t('model.asideWeight'), value: asPercent(point.weight) };
    }

    return state;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const evidence = this.studies.filter(point => point.pooled !== true);

    // Interval widths. A pooled interval is typically the tightest on the
    // figure -- that is what pooling is for -- so `Narrowest interval` would
    // routinely report it, and a reader comparing the precision of the
    // studies would be handed the summary instead.
    const widths = evidence
      .map(intervalWidth)
      .filter(Number.isFinite)
      .map(width => Number(width.toPrecision(12)));

    // The inherited stats count every row, and a forest plot has one that is
    // not evidence. Left alone the description says `Number of points is 5`
    // beside `Studies crossing the null is 2 of 4` -- two counts of the same
    // thing that disagree, in one paragraph, with nothing to say which is
    // right. So the study count is restated over the evidence and named for
    // what it counts.
    const stats = base.stats
      // On a figure where only the pooled row carries bounds there is no
      // study width to report at all, and the inherited pair -- measured
      // over every row, the summary included -- would then be left standing
      // as a description of the summary alone, with nothing saying so. That
      // is the leak the override exists to stop, at its most complete.
      .filter(stat => widths.length > 0
        || (stat.label !== t('model.statNarrowestInterval')
          && stat.label !== t('model.statWidestInterval')))
      // Copied, so the rewrites below reach only this array and not the one
      // the parent built.
      .map(stat => (stat.label === t('model.statNumberOfPoints')
        ? { label: t('model.statNumberOfStudies'), value: evidence.length }
        : { ...stat }));

    for (const stat of stats) {
      if (stat.label === t('model.statNarrowestInterval')) {
        stat.value = MathUtil.safeMin(widths);
      } else if (stat.label === t('model.statWidestInterval')) {
        stat.value = MathUtil.safeMax(widths);
      }
    }

    // `Min value`, `Max value` and `Estimate range` are left counting every
    // row on purpose: they describe the extent of the axis the figure is
    // drawn on, and the pooled estimate sits on that axis like anything else.
    // The same reason the extrema navigation is not overridden -- jumping to
    // the largest value should reach whatever is largest, and the pooled row
    // announces itself as pooled on arrival.

    const pooled = this.studies.find(point => point.pooled === true);
    if (pooled !== undefined) {
      const crosses = this.crossesNull(pooled);
      // The pooled estimate *with* its interval is the headline result of a
      // meta-analysis; the estimate alone is half of it, and a reader told
      // that it clears the null is not told how near it came. Formatted here
      // rather than left to the service, which rounds numbers and not numbers
      // inside a string -- a producer emitting 1.2799999999999998 otherwise
      // has all seventeen digits read out.
      const interval = Number.isFinite(pooled.yMin) && Number.isFinite(pooled.yMax)
        ? t('model.forestInterval', {
            min: defaultFormat(Number(pooled.yMin)),
            max: defaultFormat(Number(pooled.yMax)),
          })
        : '';
      const verdict = crosses === null
        ? ''
        : t(crosses ? 'model.forestCrossesNull' : 'model.forestDoesNotCrossNull');
      stats.push({
        label: t('model.statPooledEstimate'),
        value: t('model.forestPooledValue', {
          name: pooled.x,
          value: defaultFormat(pooled.y),
          interval,
          verdict,
        }),
      });
    }

    if (this.nullValue !== null) {
      // The verdicts above and below are judged against a number the
      // description otherwise never states. Told that an interval crosses,
      // a reader cannot tell whether an estimate of 1.28 is a 28% increase
      // over a null of 1 or a large effect over a null of 0 -- and so cannot
      // check a single one of them.
      stats.push({ label: t('model.statNoEffectValue'), value: this.nullValue });

      // How many studies individually reached significance is the shape of
      // the evidence, and a reader cannot count it without walking every row
      // and comparing two bounds against a number at each one.
      //
      // A study with neither bound is undecidable, and leaving it in the
      // denominator reads `1 of 4` -- indistinguishable from three studies
      // that definitely did not cross. `text` omits the verdict on such a row
      // rather than guess at it, and the count is owed the same restraint.
      //
      // Withheld entirely where nothing is decidable: `0 of 0` is that same
      // guess made about the whole figure, and a reader hearing it is told
      // that no study crossed rather than that none of them could be asked.
      const decided = evidence.filter(point => this.crossesNull(point) !== null);
      const crossing = decided.filter(point => this.crossesNull(point) === true);
      if (decided.length > 0) {
        stats.push({
          label: t('model.statStudiesCrossingNull'),
          value: t('model.countOfTotal', { count: crossing.length, total: decided.length }),
        });
      }
    }

    const heaviest = this.heaviestStudy();
    if (heaviest !== null) {
      // Which study the pooled result mostly reflects. A meta-analysis whose
      // weight sits in one trial is a different object from one where it is
      // spread, and the announcement gives a weight per row without ever
      // saying where the mass is.
      stats.push({
        label: t('model.statHeaviestStudy'),
        value: t('model.nameWithValue', {
          name: heaviest.x,
          value: asPercent(Number(heaviest.weight)),
        }),
      });
    }

    return { ...base, stats, dataTable: this.tabulated(base.dataTable) };
  }

  /**
   * The inherited table with the two facts a forest plot is read for.
   *
   * The parent tabulates an estimate and its bounds, which is an error bar's
   * reading of the figure. The table is the one surface where the studies are
   * compared side by side, and it is where the weight and the pooled row went
   * missing: a reader hears a weight one row at a time and can never see the
   * distribution, and the summary sits among the studies distinguishable only
   * by whatever the producer happened to call it -- 'Pooled', 'RE Model',
   * 'Overall' -- which is the miscount this class exists to prevent.
   *
   * Each column is gated on the figure having the fact, so a forest plot with
   * no weights and no declared null tabulates exactly what it did before.
   *
   * @param base - The table the error bar built
   * @returns The same table with the forest columns appended
   */
  private tabulated(
    base: DescriptionState['dataTable'],
  ): DescriptionState['dataTable'] {
    const hasWeight = this.studies.some(
      study => typeof study.weight === 'number' && Number.isFinite(study.weight),
    );
    const hasPooled = this.studies.some(study => study.pooled === true);

    const headers = [
      ...base.headers,
      ...(hasWeight ? ['Weight'] : []),
      ...(this.nullValue === null ? [] : ['Crosses null']),
      ...(hasPooled ? ['Row'] : []),
    ];
    // The parent's columns keep the axes it gave them, and the appended three
    // sit on none: the weight is a share of one computed here, the verdict a
    // comparison against the null value, and the row kind a flag -- not
    // readings taken on an axis the figure draws.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = base.columnAxes && [
      ...base.columnAxes,
      ...(hasWeight ? [undefined] : []),
      ...(this.nullValue === null ? [] : [undefined]),
      ...(hasPooled ? [undefined] : []),
    ];
    // Row `index` is study `index`: the parent builds its rows by flattening
    // the same groups `points` -- and so `studies` -- is flattened from.
    const rows = base.rows.map((row, index) => {
      const study = this.studies[index];
      const crosses = this.crossesNull(study);
      return [
        ...row,
        ...(hasWeight
          ? [typeof study.weight === 'number' && Number.isFinite(study.weight)
              ? asPercent(study.weight)
              : '']
          : []),
        ...(this.nullValue === null
          ? []
          : [crosses === null
              ? ''
              : t(crosses ? 'model.forestCrosses' : 'model.forestDoesNotCross')]),
        ...(hasPooled
          ? [t(study.pooled === true ? 'model.forestRowPooled' : 'model.forestRowStudy')]
          : []),
      ];
    });

    return { headers, columnAxes, rows };
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
