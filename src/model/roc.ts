import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, RocPoint } from '@type/grammar';
import type { AudioState, DescriptionState, TextState, TraceState } from '@type/state';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { isMeasured, missingText } from './bar';
import { extremumAt } from './extremaTarget';
import { LineTrace } from './line';

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
 * Structurally a multi-line layer, so navigation, braille, intersections and
 * highlighting transfer. What is different is that **both axes are rates on
 * the unit interval, and the chart is read against a diagonal it does not
 * draw as data.** Read as a line, four things go wrong, and each is the
 * difference between a chart that informs and one that sounds confident
 * while saying nothing.
 *
 * **The pitch is on the unit interval, for every curve.** A line scales each
 * series' pitch to its own range, and every complete ROC curve runs from
 * (0, 0) to (1, 1), so two classifiers -- one excellent, one barely better
 * than chance -- were given the same sweep from the lowest note to the
 * highest. Here the register is the rate itself, so a curve that climbs to
 * 0.9 by a false positive rate of 0.1 is heard doing so.
 *
 * **The pan follows the false positive rate.** A curve is sampled wherever
 * its thresholds fall, and `roc_curve` puts most of them where the curve
 * bends, so panning by column index put the whole left half of the chart in
 * the left tenth of the stereo field. The pan is the position on the x axis,
 * the idiom the rug and the pie use.
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
export class RocTrace extends LineTrace {
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

  /** The register the pitch is read against; see {@link RocTrace.audio}. */
  private readonly rateMin: number;
  private readonly rateMax: number;

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

    // Both axes are rates, so the register is the unit interval and two
    // curves are comparable by ear. A producer that emitted percentages
    // rather than fractions would put every point above the top of that
    // register, so the register grows to hold the data rather than clipping
    // it; it never shrinks, because a curve that stops short of (1, 1) is
    // still a curve on the unit square.
    const measured = this.lineValues.flat().filter(isMeasured);
    this.rateMin = Math.min(0, MathUtil.safeMin(measured));
    this.rateMax = Math.max(1, MathUtil.safeMax(measured));
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
    const measured: Array<{ x: number; y: number }> = [];
    for (const [col, point] of curve.entries()) {
      const x = Number(point?.x);
      const y = rates[col];
      if (Number.isFinite(x) && isMeasured(y)) {
        measured.push({ x, y });
      }
    }
    if (measured.length < 2) {
      return Number.NaN;
    }
    measured.sort((a, b) => a.x - b.x || a.y - b.y);

    let area = 0;
    for (let i = 1; i < measured.length; i++) {
      area += (measured[i].x - measured[i - 1].x) * (measured[i].y + measured[i - 1].y) / 2;
    }
    return area;
  }

  /**
   * The threshold a point was scored at, or undefined when it has none.
   *
   * @param point - The operating point
   * @returns The threshold as a finite number
   */
  private static thresholdOf(point: RocPoint | undefined): number | undefined {
    const threshold = point?.threshold;
    return typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : undefined;
  }

  protected override get audio(): AudioState {
    const base = super.audio;
    const fpr = Number(this.rocPoints[this.row]?.[this.col]?.x);
    const span = this.rateMax - this.rateMin;
    const fraction = Number.isFinite(fpr) && span > 0
      ? MathUtil.clamp((fpr - this.rateMin) / span, 0, 1)
      : 0.5;

    return {
      ...base,
      freq: { ...base.freq, min: this.rateMin, max: this.rateMax },
      // `cols: 2` with a fraction in `x` is the idiom the rug and the pie use
      // to pan by position rather than by index.
      panning: { x: fraction, y: this.row, rows: this.lineValues.length, cols: 2 },
    };
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

  protected override get groupFallbackLabel(): string {
    // Announced beside the curve's own name on every move, so inheriting the
    // line's "Group" puts two words for one referent in one sentence.
    return t('model.nounCurve');
  }

  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: t('model.statNumberOfCurves'),
      perSeries: t('model.statOperatingPointsPerCurve'),
      names: t('model.statCurveNames'),
      column: t('model.nounCurve'),
    };
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

    // The threshold is what the table is read to look up -- "which cutoff
    // gives me this rate" -- and the line's table has no column for it. Added
    // only when some point carries one, so a curve of rates alone keeps the
    // line's table.
    const hasThreshold = this.rocPoints.some(curve =>
      curve.some(point => RocTrace.thresholdOf(point) !== undefined));
    if (!hasThreshold) {
      return { ...base, stats };
    }

    const thresholdCell = (point: RocPoint): string | number =>
      RocTrace.thresholdOf(point) ?? '';
    const headers = isMultiCurve
      ? [this.xAxis, this.yAxis, t('model.tableThreshold'), t('model.nounCurve')]
      : [this.xAxis, this.yAxis, t('model.tableThreshold')];
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = isMultiCurve
      ? ['x', 'y', undefined, 'z']
      : ['x', 'y', undefined];
    const allRows = this.rocPoints.flatMap((curve, row) => {
      const name = this.groupNameAt(row);
      return curve.map(point => isMultiCurve
        ? [point.x, point.y ?? '', thresholdCell(point), name]
        : [point.x, point.y ?? '', thresholdCell(point)]);
    });
    // The same cap the line applies, whose "first N of M" stat the base
    // description already pushed for the same row count.
    const rows = allRows.slice(0, base.dataTable.rows.length);

    return { ...base, stats, dataTable: { headers, columnAxes, rows } };
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
