import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, DescriptionState } from '@type/state';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { isMeasured } from './bar';
import { LineTrace } from './line';

/**
 * One point of a classifier's curve: two rates at one decision threshold.
 *
 * What the ROC and the precision-recall points share, and all this class
 * reads; each subclass narrows the points to its own type.
 */
export type RateCurvePoint = LinePoint & {
  /** The decision threshold the point was scored at, when the producer gave one. */
  threshold?: number | null;
};

/**
 * Base for the curves a classifier is validated with -- a ROC curve, a
 * precision-recall curve -- where both axes are rates on the unit interval,
 * every point is a decision threshold and every series is a classifier (or
 * one class of one).
 *
 * Structurally a multi-line layer, so navigation, braille, intersections and
 * highlighting come from {@link LineTrace}. What this class changes is what a
 * rate axis changes, and is the same whichever pair of rates is drawn:
 *
 * **The pitch is on the unit interval, for every curve.** A line scales each
 * series' pitch to its own range, so two classifiers -- one excellent, one
 * barely better than chance -- were given the same sweep from the lowest note
 * to the highest. Here the register is the rate itself, so curves are
 * comparable by ear, and a reference drawn at a fixed rate (a baseline) is
 * heard at the same pitch on every curve.
 *
 * **The pan follows the x rate.** A curve is sampled wherever its thresholds
 * fall, and they bunch where the curve bends, so panning by column index put
 * half the chart in a tenth of the stereo field. The pan is the position on
 * the x axis, the idiom the rug and the pie use.
 *
 * **Up and down move to the curve above or below at the cursor's own x.**
 * Each curve is sampled at its own thresholds, so two curves rarely share an
 * x, and the line's exact-x rule refused most moves between them.
 *
 * **The table carries each point's threshold.** It is the one number a
 * reader can act on: the rates without it are a result with no recipe.
 */
export abstract class RateCurveTrace extends LineTrace {
  /** The curves, as the producer listed them. */
  protected readonly curves: RateCurvePoint[][];

  /** The register the pitch is read against; see {@link RateCurveTrace.audio}. */
  protected readonly rateMin: number;
  protected readonly rateMax: number;

  /**
   * Each curve's measured points sorted by x, which is the order the curve
   * is drawn in whatever order the producer listed them; see
   * {@link RateCurveTrace.findVerticalTarget}.
   */
  private readonly sortedCurves: Array<Array<{ x: number; y: number }>>;

  /**
   * Reads the curves and the register their rates are heard in.
   *
   * @param layer - The MAIDR layer carrying one curve per classifier
   */
  protected constructor(layer: MaidrLayer) {
    super(layer);

    this.curves = this.points as RateCurvePoint[][];

    // Both axes are rates, so the register is the unit interval and two
    // curves are comparable by ear. A producer that emitted percentages
    // rather than fractions would put every point above the top of that
    // register, so the register grows to hold the data rather than clipping
    // it; it never shrinks, because a curve that stops short of the far
    // corner is still a curve on the unit square.
    const measured = this.lineValues.flat().filter(isMeasured);
    this.rateMin = Math.min(0, MathUtil.safeMin(measured));
    this.rateMax = Math.max(1, MathUtil.safeMax(measured));

    this.sortedCurves = this.curves.map((curve, row) =>
      RateCurveTrace.measuredByRate(curve, this.lineValues[row]));
  }

  public override dispose(): void {
    this.sortedCurves.length = 0;
    super.dispose();
  }

  /**
   * A curve's measured points in the order they are drawn: by x, and by y
   * within a vertical run.
   *
   * @param curve - The curve's points
   * @param rates - The y rates, `NaN` for a gap
   * @returns The measured points, sorted
   */
  protected static measuredByRate(
    curve: readonly RateCurvePoint[],
    rates: readonly number[],
  ): Array<{ x: number; y: number }> {
    const measured: Array<{ x: number; y: number }> = [];
    for (const [col, point] of curve.entries()) {
      const x = Number(point?.x);
      const y = rates[col];
      if (Number.isFinite(x) && isMeasured(y)) {
        measured.push({ x, y });
      }
    }
    return measured.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  /**
   * The threshold a point was scored at, or undefined when it has none.
   *
   * @param point - The point
   * @returns The threshold as a finite number
   */
  protected static thresholdOf(point: RateCurvePoint | undefined): number | undefined {
    const threshold = point?.threshold;
    return typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : undefined;
  }

  protected override get audio(): AudioState {
    const base = super.audio;
    return {
      ...base,
      freq: { ...base.freq, min: this.rateMin, max: this.rateMax },
    };
  }

  /**
   * The pan for a point: its position on the x axis, so that a chord at a
   * point two curves share arrives from where that point is, as the single
   * tone does.
   *
   * @param row - The curve
   * @param col - The point along it
   * @returns The panning for that point
   */
  protected override panningFor(row: number, col: number): AudioState['panning'] {
    const x = Number(this.curves[row]?.[col]?.x);
    const span = this.rateMax - this.rateMin;
    const fraction = Number.isFinite(x) && span > 0
      ? MathUtil.clamp((x - this.rateMin) / span, 0, 1)
      : 0.5;

    // `cols: 2` with a fraction in `x` is the idiom the rug and the pie use
    // to pan by position rather than by index.
    return { x: fraction, y: row, rows: this.lineValues.length, cols: 2 };
  }

  /**
   * Where an up or down move lands: the curve nearest above or below the
   * cursor at the cursor's own x.
   *
   * The line asks each other series for a point at exactly the cursor's x,
   * and a classifier's curve has none to offer: each is sampled at its own
   * thresholds, so two curves share an x only where they also share a y
   * (a ROC curve's corners), which the line's strict comparison reads as
   * neither above nor below. What a reader means by "the curve above this
   * one" is the curve whose y is higher at this x, and a drawn curve has a y
   * at every x it spans: the straight line between its two neighbouring
   * points, which is what the chart draws. Where a curve runs vertically at
   * that x it has a range of y, and a cursor inside the range is level with
   * it. Curves level with the cursor are stacked in series order, the first
   * curve on top, so a point every curve shares is still a place to move
   * between curves.
   *
   * The landing point is the target curve's sample nearest in x, and nearest
   * in y among samples tied in x, since the interpolated value is not a point
   * a reader can be put on.
   *
   * @param direction - UPWARD for the nearest curve above, DOWNWARD for the nearest below
   * @returns The curve and point to move to, or null when no curve lies that way
   */
  protected override findVerticalTarget(
    direction: 'UPWARD' | 'DOWNWARD',
  ): { row: number; col: number } | null {
    const x = Number(this.curves[this.row]?.[this.col]?.x);
    const y = this.lineValues[this.row]?.[this.col];
    if (!Number.isFinite(x) || !isMeasured(y)) {
      return null;
    }

    let best: { row: number; distance: number } | null = null;
    for (let row = 0; row < this.curves.length; row++) {
      if (row === this.row) {
        continue;
      }
      const span = this.rateSpanAt(row, x);
      if (span === null) {
        continue;
      }
      // Level with the cursor when the cursor's rate is inside the curve's
      // range at this x; otherwise the gap to the nearer end.
      const delta = y < span.lo ? span.lo - y : y > span.hi ? span.hi - y : 0;
      const liesThatWay = direction === 'UPWARD'
        ? delta > 0 || (delta === 0 && row < this.row)
        : delta < 0 || (delta === 0 && row > this.row);
      if (!liesThatWay) {
        continue;
      }
      const distance = Math.abs(delta);
      const closer = best === null
        || distance < best.distance
        || (distance === best.distance
          && Math.abs(row - this.row) < Math.abs(best.row - this.row));
      if (closer) {
        best = { row, distance };
      }
    }

    if (best === null) {
      return null;
    }
    return { row: best.row, col: this.nearestColumn(best.row, x, y) };
  }

  /**
   * The y values a curve is drawn at for one x: a single interpolated value
   * between two points, or the range of a vertical run sampled at exactly
   * that x.
   *
   * @param row - The curve
   * @param x - The x rate
   * @returns The lowest and highest y, or null where the curve is not drawn
   */
  private rateSpanAt(row: number, x: number): { lo: number; hi: number } | null {
    const curve = this.sortedCurves[row];
    if (curve === undefined || curve.length === 0
      || x < curve[0].x || x > curve[curve.length - 1].x) {
      return null;
    }

    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < curve.length; i++) {
      const point = curve[i];
      if (point.x === x) {
        lo = Math.min(lo, point.y);
        hi = Math.max(hi, point.y);
        continue;
      }
      const next = curve[i + 1];
      if (point.x < x && next !== undefined && next.x > x) {
        const y = point.y + (next.y - point.y) * (x - point.x) / (next.x - point.x);
        return { lo: y, hi: y };
      }
    }
    return lo <= hi ? { lo, hi } : null;
  }

  /**
   * The point of a curve nearest to a position: nearest in x, then in y,
   * then the earlier point. A measured point over a gap, since a gap has no
   * value to compare.
   *
   * @param row - The curve
   * @param x - The x rate to land near
   * @param y - The y rate to land near
   * @returns The column of the nearest point
   */
  private nearestColumn(row: number, x: number, y: number): number {
    let bestCol = 0;
    let bestDx = Number.POSITIVE_INFINITY;
    let bestDy = Number.POSITIVE_INFINITY;
    let bestMeasured = false;
    for (const [col, point] of this.curves[row].entries()) {
      const px = Number(point?.x);
      const py = this.lineValues[row][col];
      const measured = Number.isFinite(px) && isMeasured(py);
      if (bestMeasured && !measured) {
        continue;
      }
      const dx = measured ? Math.abs(px - x) : Number.POSITIVE_INFINITY;
      const dy = measured ? Math.abs(py - y) : Number.POSITIVE_INFINITY;
      const closer = (measured && !bestMeasured)
        || dx < bestDx
        || (dx === bestDx && dy < bestDy);
      if (closer) {
        bestCol = col;
        bestDx = dx;
        bestDy = dy;
        bestMeasured = measured;
      }
    }
    return bestCol;
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

  /**
   * The description with the given stats and, when some point carries a
   * threshold, a table that has a column for it.
   *
   * The threshold is what the table is read to look up -- "which cutoff
   * gives me this rate" -- and the line's table has no column for it. Added
   * only when some point carries one, so a curve of rates alone keeps the
   * line's table.
   *
   * @param base - The line's description
   * @param stats - The stats to report in place of the line's
   * @returns The description
   */
  protected withThresholdTable(
    base: DescriptionState,
    stats: DescriptionState['stats'],
  ): DescriptionState {
    const hasThreshold = this.curves.some(curve =>
      curve.some(point => RateCurveTrace.thresholdOf(point) !== undefined));
    if (!hasThreshold) {
      return { ...base, stats };
    }

    const isMultiCurve = this.curves.length > 1;
    const thresholdCell = (point: RateCurvePoint): string | number =>
      RateCurveTrace.thresholdOf(point) ?? '';
    const headers = isMultiCurve
      ? [this.xAxis, this.yAxis, t('model.tableThreshold'), t('model.nounCurve')]
      : [this.xAxis, this.yAxis, t('model.tableThreshold')];
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = isMultiCurve
      ? ['x', 'y', undefined, 'z']
      : ['x', 'y', undefined];
    const allRows = this.curves.flatMap((curve, row) => {
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
}
