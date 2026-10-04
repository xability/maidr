import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, PrCurvePoint } from '@type/grammar';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { isMeasured, missingText } from './bar';
import { extremumAt } from './extremaTarget';
import { RateCurveTrace } from './rateCurve';

/**
 * Where one curve balances precision and recall best: the point with the
 * highest F1, their harmonic mean.
 */
interface F1Point {
  /** The curve. */
  row: number;
  /** The point along it. */
  col: number;
  /** Its F1 score. */
  f1: number;
}

/**
 * Trace implementation for precision-recall curves -- a classifier's
 * precision against its recall, one point per decision threshold, one curve
 * per classifier, class or run, as scikit-learn's `PrecisionRecallDisplay`
 * and TensorBoard's PR Curves dashboard draw them.
 *
 * Shares {@link RateCurveTrace} with the ROC curve: both axes are rates on
 * the unit interval, so the pitch is the precision itself for every curve,
 * the pan follows the recall, up and down move to the curve above or below
 * at the cursor's recall, and the table carries each point's threshold.
 *
 * What a ROC curve is read against does not carry over, and reading a PR
 * curve as one would mislead:
 *
 * **The baseline is horizontal, at the prevalence.** A classifier that
 * guesses keeps a precision equal to the share of positives in the data, at
 * every recall -- so the reference is a level line whose height depends on
 * the data, not the diagonal. When a curve declares its `prevalence`, each
 * point says how far above or below that baseline its precision sits, and
 * because the pitch is the precision on the unit interval, the baseline is
 * one pitch on every curve.
 *
 * **The summary is the average precision, against the baseline.** The area a
 * ROC curve is quoted by is compared with 0.5; a precision-recall curve's
 * average precision is compared with the prevalence, which can be anything.
 * An average precision of 0.4 is poor on balanced data and strong on data
 * that is 2% positive.
 *
 * **The point of interest is the best F1.** Youden's index measures distance
 * from the diagonal; on these axes the point a reader is looking for is the
 * one that balances the two rates, which is the highest F1.
 *
 * **The curve is not monotone.** Precision rises and falls as recall grows,
 * so nothing here assumes the curve climbs or falls; the extremes it offers
 * are the best F1 points rather than the ends.
 */
export class PrCurveTrace extends RateCurveTrace {
  private readonly prPoints: PrCurvePoint[][];

  /**
   * The average precision of each curve: the producer's number when a point
   * declares one, measured from the points otherwise, `NaN` for a curve with
   * no measured point.
   */
  private readonly averagePrecisions: number[];

  /** The prevalence each curve declared, or undefined where it declared none. */
  private readonly prevalences: (number | undefined)[];

  /** The F1 score of each point, `NaN` where either rate is missing. */
  private readonly f1Scores: number[][];

  /**
   * The best F1 points per curve, empty for a curve with no measured point.
   * Every point tied for best is listed, as the line lists every point tied
   * for its maximum.
   */
  private readonly bestPoints: F1Point[][];

  /**
   * Creates a new precision-recall trace.
   *
   * @param layer - The MAIDR layer carrying one curve per classifier
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.prPoints = this.points as PrCurvePoint[][];

    this.prevalences = this.prPoints.map(curve =>
      PrCurveTrace.declared(curve, point => point?.prevalence));

    this.averagePrecisions = this.prPoints.map((curve, row) =>
      PrCurveTrace.declared(curve, point => point?.ap)
      ?? PrCurveTrace.measuredAveragePrecision(curve, this.lineValues[row]));

    this.f1Scores = this.prPoints.map((curve, row) =>
      curve.map((point, col) =>
        PrCurveTrace.f1(Number(point?.x), this.lineValues[row][col])));

    this.bestPoints = this.f1Scores.map((scores, row) => {
      const best = MathUtil.safeMax(scores.filter(isMeasured));
      if (!isMeasured(best)) {
        return [];
      }
      const points: F1Point[] = [];
      for (const [col, f1] of scores.entries()) {
        if (f1 === best) {
          points.push({ row, col, f1 });
        }
      }
      return points;
    });
  }

  public override dispose(): void {
    this.averagePrecisions.length = 0;
    this.prevalences.length = 0;
    this.f1Scores.length = 0;
    this.bestPoints.length = 0;
    super.dispose();
  }

  /**
   * A per-curve number a producer declared, from the first point that
   * carries one -- the convention `z` follows for the curve's name.
   *
   * @param curve - The curve's points
   * @param field - Reads the field from a point
   * @returns The declared number, or undefined when no point declares one
   */
  private static declared(
    curve: readonly PrCurvePoint[],
    field: (point: PrCurvePoint | undefined) => number | null | undefined,
  ): number | undefined {
    for (const point of curve) {
      const value = field(point);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * The average precision of a curve, measured from its points the way
   * `sklearn.metrics.average_precision_score` computes it: over each rise
   * in recall, the rise times the precision at its top, with no
   * interpolation between points.
   *
   * Over the measured points sorted by recall, whatever order the producer
   * listed them in, and from a recall of 0. Where several points share a
   * recall the step takes the highest precision among them, which is the
   * point `precision_recall_curve` puts next to the rise: of the thresholds
   * that find the same positives, the strictest flags the fewest negatives.
   *
   * @param curve - The curve's points
   * @param precisions - The precisions, `NaN` for a gap
   * @returns The average precision, or `NaN` for a curve with no measured point
   */
  private static measuredAveragePrecision(
    curve: readonly PrCurvePoint[],
    precisions: readonly number[],
  ): number {
    const measured = RateCurveTrace.measuredByRate(curve, precisions);
    if (measured.length === 0) {
      return Number.NaN;
    }

    let sum = 0;
    let previousRecall = 0;
    let i = 0;
    while (i < measured.length) {
      const recall = measured[i].x;
      let precision = measured[i].y;
      while (i < measured.length && measured[i].x === recall) {
        precision = Math.max(precision, measured[i].y);
        i++;
      }
      sum += (recall - previousRecall) * precision;
      previousRecall = recall;
    }
    return sum;
  }

  /**
   * The F1 score of a point: the harmonic mean of precision and recall, 0
   * where both are 0.
   *
   * @param recall - The recall
   * @param precision - The precision, `NaN` for a gap
   * @returns The F1 score, or `NaN` where either rate is missing
   */
  private static f1(recall: number, precision: number): number {
    if (!Number.isFinite(recall) || !isMeasured(precision)) {
      return Number.NaN;
    }
    const sum = precision + recall;
    return sum === 0 ? 0 : (2 * precision * recall) / sum;
  }

  protected override get text(): TextState {
    const base = super.text;
    const point = this.prPoints[this.row]?.[this.col];
    if (point === undefined) {
      return base;
    }

    // Asides rather than `stack`, for the reason the ROC curve gives: neither
    // number sits on an axis, so neither should be formatted with an axis
    // formatter.
    const asides: { label: string; value: string }[] = [];

    const threshold = RateCurveTrace.thresholdOf(point);
    if (threshold !== undefined) {
      asides.push({ label: t('model.asideThreshold'), value: defaultFormat(threshold) });
    }

    // The precision against the curve's baseline, named by direction rather
    // than signed, as the ROC curve names a point against chance. Silent on a
    // curve that declared no prevalence: the baseline is not on the chart's
    // data, and guessing it would put a number in the reader's ear that the
    // producer never gave.
    const prevalence = this.prevalences[this.row];
    const precision = this.lineValues[this.row]?.[this.col];
    if (prevalence !== undefined && isMeasured(precision)) {
      const gap = precision - prevalence;
      asides.push({
        label: t(gap < 0 ? 'model.asideBelowBaseline' : 'model.asideAboveBaseline'),
        value: defaultFormat(Math.abs(gap)),
      });
    }

    return asides.length > 0 ? { ...base, asides } : base;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const isMultiCurve = this.prPoints.length > 1;

    // The line's min and max are the ends of the curve -- a precision of 1 at
    // the strictest threshold and the prevalence at the loosest -- and say
    // nothing a reader would quote. The average precision and the best F1
    // are what a precision-recall curve is quoted by.
    const stats = base.stats.filter(
      stat => stat.label !== t('model.statMinValue')
        && stat.label !== t('model.statMaxValue'),
    );

    // Three decimals, as `PrecisionRecallDisplay` prints "AP = 0.76".
    const apText = (row: number): string => {
      const ap = this.averagePrecisions[row];
      return isMeasured(ap) ? ap.toFixed(3) : missingText();
    };
    const perCurve = (value: (row: number) => string): string => isMultiCurve
      ? this.prPoints
          .map((_curve, row) => t('model.nameWithValue', { name: this.groupNameAt(row), value: value(row) }))
          .join(', ')
      : value(0);

    stats.push({ label: t('model.statAveragePrecision'), value: perCurve(apText) });

    if (isMultiCurve) {
      // Ties take the first, as the ROC curve's highest area does.
      let best: number | null = null;
      for (const [row, ap] of this.averagePrecisions.entries()) {
        if (isMeasured(ap) && (best === null || ap > this.averagePrecisions[best])) {
          best = row;
        }
      }
      if (best !== null) {
        stats.push({
          label: t('model.statHighestAveragePrecision'),
          value: t('model.nameWithValue', { name: this.groupNameAt(best), value: apText(best) }),
        });
      }
    }

    this.pushBaselineStats(stats, perCurve);

    const best = this.bestF1Point();
    if (best !== null) {
      stats.push({ label: t('model.statBestF1'), value: this.describeF1Point(best) });
    }

    return this.withThresholdTable(base, stats);
  }

  /**
   * The baseline each curve is read against and where its average precision
   * stands against it. Silent on a chart where no curve declared a
   * prevalence, the way the line's interval stats are silent on a chart with
   * no band.
   *
   * @param stats - The stats to add to
   * @param perCurve - Joins a per-curve value the way the other stats do
   */
  private pushBaselineStats(
    stats: DescriptionState['stats'],
    perCurve: (value: (row: number) => string) => string,
  ): void {
    if (this.prevalences.every(prevalence => prevalence === undefined)) {
      return;
    }

    // One number when every curve was scored on the same data, which is the
    // usual chart: several classifiers, one test set.
    const first = this.prevalences[0];
    const shared = first !== undefined && this.prevalences.every(prevalence => prevalence === first);
    const prevalenceText = (row: number): string => {
      const prevalence = this.prevalences[row];
      return prevalence === undefined ? missingText() : defaultFormat(prevalence);
    };
    stats.push({
      label: t('model.statBaselinePrecision'),
      value: shared ? defaultFormat(first) : perCurve(prevalenceText),
    });

    const gapText = (row: number): string => {
      const prevalence = this.prevalences[row];
      const ap = this.averagePrecisions[row];
      if (prevalence === undefined || !isMeasured(ap)) {
        return missingText();
      }
      const gap = ap - prevalence;
      return t(gap < 0 ? 'model.prBelowBaseline' : 'model.prAboveBaseline', {
        gap: Math.abs(gap).toFixed(3),
      });
    };
    stats.push({ label: t('model.statAveragePrecisionAgainstBaseline'), value: perCurve(gapText) });

    // A curve under its baseline is worse than guessing, which a reader
    // scanning the averages for the largest can miss.
    const below = this.averagePrecisions.filter((ap, row) => {
      const prevalence = this.prevalences[row];
      return prevalence !== undefined && isMeasured(ap) && ap < prevalence;
    }).length;
    if (below > 0) {
      stats.push({ label: t('model.statCurvesBelowBaseline'), value: below });
    }
  }

  /**
   * The point with the highest F1 on the whole chart, across every curve for
   * the reason the ROC curve's best operating point is: the description
   * describes the chart. Ties take the earlier curve, then the earlier point.
   *
   * @returns The best F1 point, or null when no point is measured
   */
  private bestF1Point(): F1Point | null {
    let best: F1Point | null = null;
    for (const points of this.bestPoints) {
      const first = points[0];
      if (first !== undefined && (best === null || first.f1 > best.f1)) {
        best = first;
      }
    }
    return best;
  }

  /**
   * A best F1 point as the description states it: its curve when there is
   * more than one, both rates against their axis names, the F1, and the
   * threshold when it has one.
   *
   * @param point - The point
   * @returns The display text
   */
  private describeF1Point(point: F1Point): string {
    const source = this.prPoints[point.row][point.col];
    const rates = t('model.prF1Point', {
      x: this.xAxis,
      recall: defaultFormat(Number(source.x)),
      y: this.yAxis,
      precision: defaultFormat(this.lineValues[point.row][point.col]),
      f1: point.f1.toFixed(3),
    });
    const threshold = RateCurveTrace.thresholdOf(source);
    const where = threshold === undefined
      ? rates
      : t('model.rocOperatingPointAtThreshold', { point: rates, threshold: defaultFormat(threshold) });
    return this.prPoints.length > 1
      ? t('model.nameWithValue', { name: this.groupNameAt(point.row), value: where })
      : where;
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }
    // `LineTrace` says "line" or "multiline", and the type is one of the few
    // places a reader learns what they are looking at.
    return { ...base, plotType: t('model.plotTypePrCurveSpoken') };
  }

  /**
   * The best F1 point of the current curve, and the intersections the line
   * already finds.
   *
   * The line's own targets are its minimum and maximum, which on a
   * precision-recall curve are the loosest threshold (the prevalence) and the
   * strictest (a precision of 1 at almost no recall) -- the two ends every
   * curve shares in kind. A reader asking for the extreme of a PR curve
   * means the threshold that balances the two rates.
   *
   * @returns The targets, the best F1 point first
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const intersections = super.getExtremaTargets().filter(target => target.type === 'intersection');
    const best = this.bestPoints[this.row] ?? [];

    const targets: ExtremaTarget[] = best.map(point => ({
      ...extremumAt(t('model.extremaBestF1'), this.prPoints[point.row][point.col].x),
      value: this.lineValues[point.row][point.col],
      pointIndex: point.col,
      segment: 'line',
      type: 'max',
      navigationType: 'point',
      xValue: this.prPoints[point.row][point.col].x,
    }));

    return [...targets, ...intersections];
  }
}
