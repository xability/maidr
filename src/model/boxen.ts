import type { BoxenPoint, LetterValueLevel, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * One navigable position on a boxen: a value and what that value is.
 *
 * Held rather than derived on each move because the ladder is walked in value
 * order while the data arrives as pairs, so the flattening happens once.
 */
interface Rung {
  value: number;
  /** What the announcement calls it. */
  label: string;
}

/**
 * Names a quantile by its percentile, which is the number a reader can place.
 *
 * Trailing zeros are trimmed rather than fixed, so the common rungs read as
 * "25th" and "75th" rather than "25.0th" while a deep one still reads as
 * "0.39th" instead of rounding to "0th" -- and rounding a deep rung to zero
 * would name several different rungs identically, which is exactly the part
 * of the distribution a letter-value plot exists to separate.
 *
 * @param fraction - A quantile, from 0 to 1
 * @returns Its percentile, as text
 */
function percentileLabel(fraction: number): string {
  const percent = fraction * 100;
  const text = Number(percent.toPrecision(3)).toString();
  return t('model.boxenPercentile', { percent: text });
}

/**
 * Trace implementation for boxen (letter-value) plots.
 *
 * A box plot's five-number summary is a letter-value ladder with exactly one
 * rung, and that fixed depth is why {@link BoxTrace} cannot express this: the
 * whole point of a boxen is that a large sample gets *more* rungs, so its
 * tails stay legible instead of collapsing into one whisker and a scatter of
 * dots.
 *
 * So the ladder is variable-depth, and it is navigated in **value order** --
 * deepest lower quantile, inward to the median, outward again to the deepest
 * upper one. That is the box plot's own arrangement generalised, and it means
 * left and right move monotonically through the distribution: a reader
 * arrowing across hears the pitch rise without exception, and the *rate* it
 * rises at is where the sample is thin. On a heavy-tailed distribution that
 * jump at the ends is the finding, and it is the thing a box plot's fixed
 * whisker flattens into a single number.
 *
 * Each position announces the percentile it actually is rather than a rung
 * number, because "the 12.5th percentile" is a number a reader can place and
 * "level 3" is one they have to count back from.
 */
export class BoxenTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly points: BoxenPoint[];
  private readonly orientation: Orientation;

  /** The ladders, one per distribution, in value order. */
  private readonly rungs: Rung[][];
  private readonly rungValues: number[][];

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new boxen trace.
   *
   * @param layer - The MAIDR layer carrying the distributions
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as BoxenPoint[];
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.rungs = this.points.map(point => BoxenTrace.ladderOf(point));
    this.rungValues = this.rungs.map(ladder => ladder.map(rung => rung.value));

    // One scale for the chart rather than one per distribution: a boxen is
    // drawn to compare distributions, and per-row bounds would put every
    // category's own median in the middle of the register whatever it
    // measured.
    const bounds = MathUtil.minMax(this.rungValues.flat().filter(Number.isFinite));
    this.min = bounds.min;
    this.max = bounds.max;

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<number>(this.rungValues);
  }

  /**
   * Flattens one distribution's ladder into the order it is walked.
   *
   * Sorted outward from the median by tail probability rather than trusting
   * the order the rungs arrive in: a producer emitting them inward-first
   * would otherwise be navigated backwards, and nothing about the payload
   * says which way round they came.
   *
   * @param point - One distribution
   * @returns Its positions, from the deepest lower quantile upward
   */
  private static ladderOf(point: BoxenPoint): Rung[] {
    const levels = [...(point.levels ?? [])]
      // A rung is a tail, so its probability lies strictly between nothing
      // and the median's own 0.5. A producer sending 0.5 would put two rungs
      // labelled `50th percentile` either side of the rung already called
      // `median` -- three names for one place, and the label is the whole of
      // what tells a reader where on the distribution they are.
      .filter(level => Number.isFinite(level.p) && level.p > 0 && level.p < 0.5)
      .sort((a: LetterValueLevel, b: LetterValueLevel) => a.p - b.p);

    const lower = levels.map(level => ({
      value: Number(level.lo),
      label: percentileLabel(level.p),
    }));
    const upper = [...levels].reverse().map(level => ({
      value: Number(level.hi),
      label: percentileLabel(1 - level.p),
    }));

    return [
      ...lower,
      { value: Number(point.median), label: t('model.boxenMedianRung') },
      ...upper,
    ];
  }

  /**
   * Resolves the layer's selectors to one element per distribution, repeated
   * across its rungs.
   *
   * A boxen is drawn as one nested stack of boxes per category, and a chart
   * library does not emit one element per quantile that MAIDR could pair up
   * positionally. So every rung of a distribution highlights that
   * distribution -- honest about what the chart drew, rather than inventing
   * elements it did not.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped rungs x distributions, or null when unresolvable
   */
  private mapToSvgElements(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[][] | null {
    // Resolved live here and cloned by `pairWith` only once the count fits.
    // A clone is inserted beside its original the moment it is made, so
    // declining after cloning left every copy in the chart for `dispose()`
    // never to reach -- and the next resolution matched the copies too.
    if (typeof selectors === 'string') {
      return this.pairWith(Svg.selectAllElements(selectors, false));
    }
    // `MaidrLayer['selectors']` also admits `(string | null)[][]` and the box and
    // candlestick shapes, and `Array.isArray` alone lets all of them through
    // to a cast. Narrowing on the elements instead means the guard matches
    // what the type allows, rather than leaning on `isUsableSelector` to
    // reject each entry one at a time and leave an empty list behind.
    if (!Array.isArray(selectors)
      || !selectors.every(one => typeof one === 'string')) {
      return null;
    }

    return this.pairWith(selectors.flatMap(one => Svg.selectAllElements(one, false)));
  }

  /**
   * Pairs resolved elements with the ladder, one element per distribution.
   *
   * Withdrawn unless the count matches exactly: a list that has slipped by
   * one highlights a neighbouring distribution for the rest of the chart,
   * which is worse than not highlighting at all.
   *
   * @param live - The chart's own elements the selectors resolved to
   * @returns Elements shaped rungs x distributions, or null on a mismatch
   */
  private pairWith(live: SVGElement[]): SVGElement[][] | null {
    if (live.length !== this.points.length) {
      return null;
    }
    const flat = live.map(element => Svg.cloneHidden(element));
    return this.rungValues.map((ladder, row) => ladder.map(() => flat[row]));
  }

  protected get values(): number[][] {
    return this.rungValues;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.rungValues.length,
      cols: this.rungValues.reduce(
        (widest, ladder) => Math.max(widest, ladder.length),
        0,
      ),
    };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.rungValues[this.row]?.[this.col] ?? Number.NaN,
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.rungValues.length,
        cols: this.rungValues[this.row]?.length ?? 1,
      },
      group: this.row,
    };
  }

  protected get braille(): BrailleState {
    // The ladder itself, one row per distribution. Not the box plot's spatial
    // rendering, which encodes five named sections at fixed widths and has
    // nowhere to put a sixth: the whole point here is that the depth varies,
    // so a fixed-section glyph run would either truncate a deep ladder or pad
    // a shallow one into looking deeper than it is.
    //
    // What a rising run of cells shows instead is the quantile function, and
    // its *steepness* is the reading: cells that climb gently through the
    // middle and jump at the ends are a heavy-tailed sample, which is the
    // finding a boxen is drawn to make and the one a box plot's single
    // whisker flattens away.
    return {
      empty: false,
      id: this.id,
      values: this.rungValues,
      min: this.rungValues.map(() => this.min),
      max: this.rungValues.map(() => this.max),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = this.points[this.row];
    const rung = this.rungs[this.row]?.[this.col];

    return {
      main: {
        label: isHorizontal ? this.yAxis : this.xAxis,
        value: point?.z ?? '',
      },
      cross: {
        label: isHorizontal ? this.xAxis : this.yAxis,
        value: rung?.value ?? Number.NaN,
      },
      // Which quantile this is, named as the percentile rather than as a rung
      // index. Lower case because `TextService` announces a section ahead of
      // the axis label and does not lower-case it in terse mode -- the same
      // convention `SECTION_LABEL` in errorBar.ts and `KIND_LABEL` in
      // waterfall.ts note at their definitions.
      section: rung?.label,
      mainAxis: isHorizontal ? 'y' : 'x',
      crossAxis: isHorizontal ? 'x' : 'y',
    };
  }

  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfDistributions'), value: this.points.length },
    ];

    const names = this.points
      .map(point => (typeof point.z === 'string' ? point.z.trim() : ''))
      .filter(name => name !== '');
    if (names.length > 0) {
      stats.push({ label: t('model.statDistributionNames'), value: names.join(', ') });
    }

    // Off the ladder that is actually walked, not the raw `levels`:
    // `ladderOf` drops any level outside (0, 0.5), so a producer that sends a
    // 0.5 or a duplicate had the summary claim more rungs than the table below
    // it lists and than navigation can reach. The ladder is lower + median +
    // upper, so half of what is left after the median is the rung count.
    const depths = this.rungs.map(ladder => Math.max(0, (ladder.length - 1) / 2));
    if (depths.length > 0) {
      // How far the ladder goes is a fact about the *sample*, not about the
      // chart's styling: a library adds rungs as it gains confidence in the
      // tail, so a deep boxen is a large sample and a shallow one is not.
      const deepest = MathUtil.safeMax(depths);
      const shallowest = MathUtil.safeMin(depths);
      stats.push({
        label: t('model.statQuantileLevels'),
        value: deepest === shallowest
          ? deepest
          : t('model.spanRange', { min: shallowest, max: deepest }),
      });
    }

    // Named for what it is. `min`/`max` are the ends of the quantile ladder,
    // and the outlier count on the very next line is a tally of points beyond
    // them -- so "Max value" was a maximum the chart draws points above.
    stats.push({
      label: t('model.statQuantileRange'),
      value: MathUtil.spannedOrMissing(this.min, this.max),
    });

    const medians = this.points
      .map((point, index) => ({ index, median: Number(point.median) }))
      .filter(entry => Number.isFinite(entry.median));
    if (medians.length > 0) {
      stats.push({
        label: t('model.statMedianOfEachDistribution'),
        value: medians
          .map(({ index, median }) => t('model.nameAtValue', {
            name: names[index]
              ?? t('model.fallbackNumbered', {
                noun: t('model.nounDistribution'),
                index: index + 1,
              }),
            value: defaultFormat(median),
          }))
          .join(', '),
      });
    }

    const outlierValues = this.points
      .flatMap(point => [...(point.lowerOutliers ?? []), ...(point.upperOutliers ?? [])])
      .filter(Number.isFinite);
    if (outlierValues.length > 0) {
      stats.push({
        label: t('model.statOutlierRange'),
        value: MathUtil.spannedOrMissing(
          MathUtil.safeMin(outlierValues),
          MathUtil.safeMax(outlierValues),
        ),
      });
    }

    const outliers = this.points.reduce(
      (total, point) =>
        total
        + (point.lowerOutliers?.length ?? 0)
        + (point.upperOutliers?.length ?? 0),
      0,
    );
    if (outliers > 0) {
      // A boxen draws far fewer of these than a box plot does, because the
      // deep rungs absorb what a whisker would have thrown out. The count
      // being small is itself informative, so it is reported rather than
      // left to be discovered.
      stats.push({ label: t('model.statOutliers'), value: outliers });
    }

    // Swapped for orientation, as the trace's own `text` getter already is: a
    // horizontal boxen carries its category on y and its measurement on x, so
    // the unswapped headers titled the category column with the value axis.
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const headers = [
      isHorizontal ? this.yAxis : this.xAxis,
      t('model.tableQuantile'),
      isHorizontal ? this.xAxis : this.yAxis,
    ];
    // Outliers among the rungs, in the same long format: they were counted in
    // the summary and then existed nowhere a reader could reach them -- the
    // table listed the ladder alone, and navigation does not visit them.
    const rows: (string | number)[][] = this.points.flatMap((point, row) => [
      ...(point.lowerOutliers ?? []).map(value => [point.z, t('model.boxenLowerOutlier'), value]),
      ...this.rungs[row].map(rung => [point.z, rung.label, rung.value]),
      ...(point.upperOutliers ?? []).map(value => [point.z, t('model.boxenUpperOutlier'), value]),
    ]);

    // Swapped the same way the headers just were: the distribution sits on
    // whichever axis carries the categories and its value on the other one.
    // `Quantile` is the rung's own name -- a percentile or an outlier -- and
    // is measured on nothing.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = [
      isHorizontal ? 'y' : 'x',
      undefined,
      isHorizontal ? 'x' : 'y',
    ];

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, columnAxes, rows },
    };
  }

  /**
   * Finds the distribution whose drawn boxes are nearest a pointer position.
   *
   * Resolves to the median, which is where a reader entering a distribution
   * would want to start reading outward from.
   *
   * @param x - Horizontal pointer position
   * @param y - Vertical pointer position
   * @returns The nearest distribution, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues;
    if (!elements) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let row = 0; row < elements.length; row++) {
      const element = elements[row][0];
      if (element === undefined) {
        continue;
      }
      const box = element.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const distance = (centerX - x) ** 2 + (centerY - y) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        const median = Math.floor(this.rungs[row].length / 2);
        nearest = { element, row, col: median, centerX, centerY };
      }
    }

    return nearest;
  }
}
