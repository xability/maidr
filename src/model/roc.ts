import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, RocPoint } from '@type/grammar';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { isMeasured, missingText } from './bar';
import { extremumAt } from './extremaTarget';
import { RateCurveTrace } from './rateCurve';

/**
 * Where one curve is best read at: the point furthest above the chance
 * diagonal, which is the operating point Youden's index picks.
 */
interface OperatingPoint {
  /** The curve. */
  row: number;
  /** The point along it. */
  col: number;
  /** Its true positive rate less its false positive rate. */
  aboveChance: number;
}

/**
 * The area under a chance classifier's curve. A curve whose area is below it
 * is worse than guessing, which is a finding rather than a low score.
 */
const CHANCE_AREA = 0.5;

/**
 * Trace implementation for ROC curves -- a classifier's true positive rate
 * against its false positive rate, one point per decision threshold, one
 * curve per classifier.
 *
 * Structurally a multi-line layer whose axes are both rates on the unit
 * interval; {@link RateCurveTrace} holds what that changes -- the pitch on
 * the unit interval for every curve (every complete ROC curve runs from
 * (0, 0) to (1, 1), so a line's per-series scaling made an excellent
 * classifier and a guessing one sound alike), the pan by false positive
 * rate, the moves between curves at the cursor's own rate and the threshold
 * column. What is ROC's own is that **the chart is read against a diagonal
 * it does not draw as data.**
 *
 * **Each point says where it stands against chance, and at what threshold.**
 * A sighted reader takes in a point's height above the diagonal at a glance;
 * a listener hearing a rate and then another rate has to subtract them, for
 * every point, while navigating. The threshold is the one number a reader
 * can act on, and the rates without it are a result with no recipe.
 *
 * **The description gives the numbers the chart is quoted by.** The area
 * under each curve -- declared by the producer or measured from the points
 * -- and the best operating point, rather than a min and max that are 0 and
 * 1 on every ROC curve ever drawn.
 */
export class RocTrace extends RateCurveTrace {
  private readonly rocPoints: RocPoint[][];

  /**
   * The area under each curve: the producer's number when a point declares
   * one, the trapezoid rule over the curve's own points otherwise, and `NaN`
   * for a curve with fewer than two measured points.
   */
  private readonly areas: number[];

  /**
   * The true positive rate less the false positive rate, per point -- the
   * height above the chance diagonal. `NaN` where either rate is missing.
   */
  private readonly aboveChance: number[][];

  /**
   * The best operating point per curve, or `null` for a curve with no
   * measured point. Every point tied for best is listed, as the line lists
   * every point tied for its maximum.
   */
  private readonly bestPoints: OperatingPoint[][];

  /**
   * Creates a new ROC trace.
   *
   * @param layer - The MAIDR layer carrying one curve per classifier
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.rocPoints = this.points as RocPoint[][];

    this.aboveChance = this.rocPoints.map((curve, row) =>
      curve.map((point, col) => {
        const fpr = Number(point?.x);
        const tpr = this.lineValues[row][col];
        return isMeasured(tpr) && Number.isFinite(fpr) ? tpr - fpr : Number.NaN;
      }));

    this.areas = this.rocPoints.map((curve, row) =>
      RocTrace.declaredArea(curve) ?? RocTrace.trapezoidArea(curve, this.lineValues[row]));

    this.bestPoints = this.aboveChance.map((heights, row) => {
      const best = MathUtil.safeMax(heights.filter(isMeasured));
      if (!isMeasured(best)) {
        return [];
      }
      const points: OperatingPoint[] = [];
      for (const [col, height] of heights.entries()) {
        if (height === best) {
          points.push({ row, col, aboveChance: height });
        }
      }
      return points;
    });
  }

  public override dispose(): void {
    this.areas.length = 0;
    this.aboveChance.length = 0;
    this.bestPoints.length = 0;
    super.dispose();
  }

  /**
   * The area a producer declared for a curve, from the first point that
   * carries one -- the convention `z` follows for the curve's name.
   *
   * @param curve - The curve's points
   * @returns The declared area, or undefined when no point declares one
   */
  private static declaredArea(curve: readonly RocPoint[]): number | undefined {
    for (const point of curve) {
      const auc = point?.auc;
      if (typeof auc === 'number' && Number.isFinite(auc)) {
        return auc;
      }
    }
    return undefined;
  }

  /**
   * The area under a curve by the trapezoid rule, which is what
   * `sklearn.metrics.auc` and `pROC::auc` compute.
   *
   * Over the measured points sorted by false positive rate, whatever order
   * the producer listed them in: a curve emitted from (1, 1) down to (0, 0)
   * -- which is the order the thresholds come out in -- has the same area as
   * one emitted the other way. Ties on x are sorted by y so a vertical run
   * contributes nothing, which is what a vertical run's area is.
   *
   * @param curve - The curve's points
   * @param rates - The true positive rates, `NaN` for a gap
   * @returns The area, or `NaN` for fewer than two measured points
   */
  private static trapezoidArea(curve: readonly RocPoint[], rates: readonly number[]): number {
    const measured = RocTrace.measuredByRate(curve, rates);
    if (measured.length < 2) {
      return Number.NaN;
    }

    let area = 0;
    for (let i = 1; i < measured.length; i++) {
      area += (measured[i].x - measured[i - 1].x) * (measured[i].y + measured[i - 1].y) / 2;
    }
    return area;
  }

  protected override get text(): TextState {
    const base = super.text;
    const point = this.rocPoints[this.row]?.[this.col];
    if (point === undefined) {
      return base;
    }

    // Asides rather than `stack`: neither number is a running total, and
    // neither sits on an axis, so neither should be formatted with an axis
    // formatter. A `percent` format declared for the rates would otherwise
    // announce a threshold of 0.62 as "62.0%".
    const asides: { label: string; value: string }[] = [];

    const threshold = RocTrace.thresholdOf(point);
    if (threshold !== undefined) {
      asides.push({ label: t('model.asideThreshold'), value: defaultFormat(threshold) });
    }

    const height = this.aboveChance[this.row]?.[this.col];
    if (isMeasured(height)) {
      // Named by direction rather than signed, for the reason the bump chart
      // gives: "Below chance, 0.1" needs no interpretation, and "-0.1" asks
      // the reader to hear a minus sign and work out which way it points.
      asides.push({
        label: t(height < 0 ? 'model.asideBelowChance' : 'model.asideAboveChance'),
        value: defaultFormat(Math.abs(height)),
      });
    }

    return asides.length > 0 ? { ...base, asides } : base;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const isMultiCurve = this.rocPoints.length > 1;

    // `LineTrace` reports Min value and Max value, which on a complete ROC
    // curve are 0 and 1 -- true of every one ever drawn, and so worth
    // nothing. The area and the best operating point are what a ROC curve is
    // quoted by, and what dropping those two leaves room for.
    const stats = base.stats.filter(
      stat => stat.label !== t('model.statMinValue')
        && stat.label !== t('model.statMaxValue'),
    );

    // Three decimals, which is how an area is quoted -- `RocCurveDisplay`
    // and `pROC` both print it so -- where the dialog's own rounding would
    // give two and turn 0.896 into 0.9.
    const areaText = (row: number): string =>
      isMeasured(this.areas[row]) ? this.areas[row].toFixed(3) : missingText();

    if (isMultiCurve) {
      stats.push({
        label: t('model.statAreaUnderCurve'),
        value: this.rocPoints
          .map((_curve, row) => t('model.nameWithValue', {
            name: this.groupNameAt(row),
            value: areaText(row),
          }))
          .join(', '),
      });

      // Which classifier to prefer, which is the question a chart of several
      // curves is drawn to answer. Ties take the first, as the bump chart's
      // furthest climber does: somebody has to be named, and the earlier row
      // is at least stable across renders.
      let best: number | null = null;
      for (const [row, area] of this.areas.entries()) {
        if (isMeasured(area) && (best === null || area > this.areas[best])) {
          best = row;
        }
      }
      if (best !== null) {
        stats.push({
          label: t('model.statHighestArea'),
          value: t('model.nameWithValue', {
            name: this.groupNameAt(best),
            value: areaText(best),
          }),
        });
      }
    } else {
      stats.push({ label: t('model.statAreaUnderCurve'), value: areaText(0) });
    }

    // A curve under the diagonal is worse than guessing, which a reader
    // scanning a list of areas for the largest can miss. Silent on a chart
    // where no curve is, the way the line's interval stats are silent on a
    // chart with no band.
    const belowChance = this.areas.filter(area => isMeasured(area) && area < CHANCE_AREA).length;
    if (belowChance > 0) {
      stats.push({ label: t('model.statCurvesBelowChance'), value: belowChance });
    }

    const best = this.bestOperatingPoint();
    if (best !== null) {
      stats.push({ label: t('model.statBestOperatingPoint'), value: this.describeOperatingPoint(best) });
    }

    return this.withThresholdTable(base, stats);
  }

  /**
   * The point furthest above chance on the whole chart.
   *
   * Across every curve rather than the current one, because the description
   * describes the chart: a reader asking which classifier to deploy, and at
   * what cutoff, wants one answer. Ties take the earlier curve and then the
   * earlier point, for the reason {@link RocTrace.description} gives.
   *
   * @returns The best operating point, or null when no point is measured
   */
  private bestOperatingPoint(): OperatingPoint | null {
    let best: OperatingPoint | null = null;
    for (const points of this.bestPoints) {
      const first = points[0];
      if (first !== undefined && (best === null || first.aboveChance > best.aboveChance)) {
        best = first;
      }
    }
    return best;
  }

  /**
   * An operating point as the description states it: its curve when there
   * is more than one, both rates against their axis names, and the threshold
   * when it has one.
   *
   * @param point - The operating point
   * @returns The display text
   */
  private describeOperatingPoint(point: OperatingPoint): string {
    const source = this.rocPoints[point.row][point.col];
    const rates = t('model.rocOperatingPoint', {
      x: this.xAxis,
      fpr: defaultFormat(Number(source.x)),
      y: this.yAxis,
      tpr: defaultFormat(this.lineValues[point.row][point.col]),
    });
    const threshold = RocTrace.thresholdOf(source);
    const where = threshold === undefined
      ? rates
      : t('model.rocOperatingPointAtThreshold', { point: rates, threshold: defaultFormat(threshold) });
    return this.rocPoints.length > 1
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
    return { ...base, plotType: t('model.plotTypeRoc') };
  }

  /**
   * The best operating point of the current curve, and the intersections
   * the line already finds.
   *
   * The line's own targets are its minimum and maximum, which on a ROC curve
   * are the two ends -- (0, 0) and (1, 1) -- and a reader who asks to be
   * taken to the extreme of a ROC curve means the point furthest above
   * chance, not the corner every curve shares.
   *
   * @returns The targets, the best operating point first
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const intersections = super.getExtremaTargets().filter(target => target.type === 'intersection');
    const best = this.bestPoints[this.row] ?? [];

    const targets: ExtremaTarget[] = best.map(point => ({
      ...extremumAt(t('model.extremaBestOperatingPoint'), this.rocPoints[point.row][point.col].x),
      value: this.lineValues[point.row][point.col],
      pointIndex: point.col,
      segment: 'line',
      type: 'max',
      navigationType: 'point',
      xValue: this.rocPoints[point.row][point.col].x,
    }));

    return [...targets, ...intersections];
  }
}
