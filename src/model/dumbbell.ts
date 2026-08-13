import type { ExtremaTarget } from '@type/extrema';
import type { DumbbellData, DumbbellPoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * The two ends of a dumbbell, in the order the chart names them.
 *
 * Ordered by role rather than by magnitude, unlike {@link ErrorBarTrace}'s
 * sections. A dumbbell's ends have no fixed order on the value axis -- a row
 * showing a decline draws its end below its start, and a chart normally holds
 * both directions at once -- so ordering rows by size would make row 0 mean
 * "1990" in one column and "2020" in the next, and the label under the cursor
 * would flip as the reader arrowed sideways.
 */
const ENDS = ['start', 'end'] as const;

type End = (typeof ENDS)[number];

/** Row the cursor enters on, and the one a pointer resolves to. */
const START_ROW = 0;

/**
 * Strips binary floating-point noise from a subtracted magnitude.
 *
 * The change is derived, not authored: `78.4 - 71.2` is `7.199999999999996`
 * in IEEE 754, and announcing that spells out sixteen digits of an artifact
 * the chart does not contain.
 *
 * Twelve significant figures rather than a fixed number of decimals, because
 * the decimals a chart needs depend on its scale -- rounding to two would
 * report a change of 0.003 as no change at all, which is worse than the noise.
 *
 * @param value - A magnitude obtained by subtraction
 * @returns The same magnitude without the trailing artifact
 */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * The change one row draws, from its starting value to its finishing one.
 *
 * @param point - The row to measure
 * @returns The signed change
 */
function changeOf(point: DumbbellPoint): number {
  return withoutFloatNoise(Number(point.end) - Number(point.start));
}

/**
 * Names a ranked change, so the name matches the direction it actually has.
 *
 * The two extremes of a dumbbell are the most positive change and the most
 * negative one, and neither is necessarily a rise or a fall. On a chart where
 * every row declined, the most positive change is the row that fell *least* —
 * calling that "largest increase" reports a rise the chart does not contain,
 * and calling it "largest decrease" reports the wrong row as the biggest
 * faller. It is the smallest decrease, and that is what it is called.
 *
 * This matters more here than the wording usually would: the label is what the
 * "go to extrema" menu renders as its option text and its `aria-label`, so it
 * is read out as a claim about the finding rather than shown beside the number
 * that would correct it.
 *
 * @param kind - Which end of the ranking this change came from
 * @param change - The signed change
 * @returns How to name it
 */
function rankLabel(kind: 'max' | 'min', change: number): string {
  if (change === 0) {
    return 'No change';
  }
  if (kind === 'max') {
    return change > 0 ? 'Largest increase' : 'Smallest decrease';
  }
  return change < 0 ? 'Largest decrease' : 'Smallest increase';
}

/**
 * Trace implementation for dumbbell charts: two values per category, joined.
 *
 * A dumbbell is drawn to be read as a comparison, not as two numbers. The
 * segment between the dots is the finding -- which countries gained, which
 * lost, and by how much -- and it is the one thing a reader cannot recover
 * from hearing the ends one at a time, because doing so means holding one
 * number while navigating to the other and subtracting by ear across every
 * row of the chart.
 *
 * So the change travels with both ends. A reader landing anywhere in a row
 * hears what the row does, and the sighted reader's advantage -- seeing at a
 * glance which segments are long and which way they point -- is available
 * without the arithmetic.
 *
 * Navigation follows {@link ErrorBarTrace}: the ends are the grid's rows and
 * the categories its columns, so up and down at one category walk the two
 * values while left and right walk the categories.
 */
export class DumbbellTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  private readonly points: DumbbellPoint[];
  private readonly endValues: number[][];
  private readonly endLabels: Record<End, string>;
  private readonly changes: number[];
  private readonly orientation: Orientation;

  private readonly min: number;
  private readonly max: number;
  private readonly perRowMin: number[];
  private readonly perRowMax: number[];

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new dumbbell trace.
   *
   * @param layer - The MAIDR layer carrying the paired data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as DumbbellData;
    this.points = data.points;
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // Defaulted rather than required, so a producer that has no names for the
    // two ends emits a chart that still reads. "start" and "end" say less than
    // "1990" and "2020", but they do say which dot the cursor is on, which is
    // the minimum a paired chart has to convey.
    this.endLabels = {
      start: data.startLabel ?? 'start',
      end: data.endLabel ?? 'end',
    };

    this.endValues = ENDS.map(end =>
      this.points.map(point => Number(point[end])),
    );
    this.changes = this.points.map(changeOf);

    const { min, max } = MathUtil.minMax(this.endValues.flat());
    this.min = min;
    this.max = max;
    this.perRowMin = this.endValues.map(row => MathUtil.safeMin(row));
    this.perRowMax = this.endValues.map(row => MathUtil.safeMax(row));

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<number>(this.endValues, { row: START_ROW });
  }

  /**
   * Resolves the layer's selectors to one element per category, repeated
   * across the two ends.
   *
   * A chart draws one connector per row, not one element per dot, so both
   * ends of a column highlight the same element. Announcing a move between
   * the ends while the highlight sits still is the honest rendering of that;
   * the alternative is inventing elements the chart never drew.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped ends x categories, or null when unresolvable
   */
  private mapToSvgElements(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[][] | null {
    if (typeof selectors !== 'string' && !Array.isArray(selectors)) {
      return null;
    }

    const flat = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one));

    if (flat.length !== this.points.length) {
      return null;
    }
    return ENDS.map(() => flat);
  }

  protected get values(): number[][] {
    return this.endValues;
  }

  protected get dimension(): Dimension {
    // Orientation-independent, matching `ErrorBarTrace.dimension`: up and down
    // walk the ends and left and right walk the categories in BOTH
    // orientations, so rows must always be the end count. `AutoplayState` is
    // keyed by direction, so conditioning this on orientation mis-paces
    // autoplay and mis-clamps the `isMovable` bounds.
    return { rows: ENDS.length, cols: this.points.length };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        // One scale across both rows, not per row: the two ends are the same
        // quantity on the same axis, so the larger of a pair has to sound
        // higher than the smaller. Per-row scaling would put both at the same
        // pitch and erase the gap by ear -- which is the whole chart.
        min: this.min,
        max: this.max,
        raw: this.endValues[this.row][this.col],
      },
      panning: {
        // The grid stays ends-by-categories whichever way the chart is drawn,
        // so panning has to swap here instead: stereo position tracks where a
        // point sits on screen, and a dumbbell is commonly drawn with its
        // categories running down the page rather than across it.
        x: this.orientation === Orientation.HORIZONTAL ? this.row : this.col,
        y: this.orientation === Orientation.HORIZONTAL ? this.col : this.row,
        rows: ENDS.length,
        cols: this.points.length,
      },
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.endValues,
      min: this.perRowMin,
      max: this.perRowMax,
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.points[this.col];
    const change = this.changes[this.col];
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    return {
      main: { label: isHorizontal ? this.yAxis : this.xAxis, value: point.x },
      cross: {
        label: isHorizontal ? this.xAxis : this.yAxis,
        value: this.endValues[this.row][this.col],
      },
      // Which of the two dots the cursor is on. The chart's own name for the
      // end, passed through as the producer wrote it.
      //
      // Verbose mode lower-cases it on the way out and terse mode does not, so
      // a `startLabel` of "Control" is announced two ways depending on the
      // text mode. That is `TextService`'s doing rather than this trace's --
      // the same branch already lower-cases a box plot's "Minimum" -- and it
      // is not corrected here, because lower-casing the label in the model to
      // make the two agree would destroy a distinction ("Q1 2024") that the
      // formatting layer, not the data, chose to drop. Tracked in #830.
      section: this.endLabels[ENDS[this.row]],
      // The gap, named by direction rather than signed. "Decrease is 3.1"
      // needs no interpretation; "-3.1" asks the reader to hear a minus sign
      // and work out which way it points, on every row of the chart.
      stack: {
        label: change > 0 ? 'Increase' : change < 0 ? 'Decrease' : 'Change',
        value: Math.abs(change),
      },
      // Which real axis each value came from, so the formatter service picks
      // the right per-axis format. It defaults to x/y when absent, which is
      // silently wrong for a horizontal layer whose two axes format
      // differently.
      mainAxis: isHorizontal ? 'y' : 'x',
      crossAxis: isHorizontal ? 'x' : 'y',
    };
  }

  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: 'Number of pairs', value: this.points.length },
      { label: 'Min value', value: this.min },
      { label: 'Max value', value: this.max },
    ];

    const rises = this.changes.filter(change => change > 0).length;
    const falls = this.changes.filter(change => change < 0).length;
    if (rises > 0 || falls > 0) {
      // The count each way is what a sighted reader takes from the shape of
      // the chart before reading a single number, and it is not recoverable
      // from the ranges above.
      stats.push(
        { label: 'Increased', value: rises },
        { label: 'Decreased', value: falls },
      );
    }

    const largest = this.extremeChange('max');
    const smallest = this.extremeChange('min');
    if (largest !== null) {
      stats.push({
        label: rankLabel('max', largest.change),
        value: `${this.points[largest.index].x}, ${Math.abs(largest.change)}`,
      });
    }
    if (smallest !== null && smallest.index !== largest?.index) {
      stats.push({
        label: rankLabel('min', smallest.change),
        value: `${this.points[smallest.index].x}, ${Math.abs(smallest.change)}`,
      });
    }

    const headers = [
      this.xAxis,
      this.endLabels.start,
      this.endLabels.end,
      'Change',
    ];
    const rows: (string | number)[][] = this.points.map((point, index) => [
      point.x,
      point.start,
      point.end,
      this.changes[index],
    ]);

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * Returns the row whose change is furthest in one direction.
   *
   * @param kind - Whether to take the most positive or the most negative
   * @returns The row and its change, or null when the chart has no rows
   */
  private extremeChange(
    kind: 'max' | 'min',
  ): { index: number; change: number } | null {
    if (this.changes.length === 0) {
      return null;
    }

    return this.changes
      .map((change, index) => ({ change, index }))
      .reduce((best, candidate) =>
        (kind === 'max'
          ? candidate.change > best.change
          : candidate.change < best.change)
          ? candidate
          : best,
      );
  }

  /**
   * Offers the biggest mover in each direction as extrema targets.
   *
   * "Extreme" on a dumbbell is the largest change, not the largest value: the
   * chart is drawn to show which rows moved and which way, and the tallest
   * dot is a fact about the category rather than about the comparison. Ranking
   * both under one menu would leave the reader unable to tell which sense they
   * had just jumped to.
   *
   * Both land on the finishing end, where the change has completed.
   *
   * @returns The largest rise and the largest fall, when the chart has them
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const largest = this.extremeChange('max');
    const smallest = this.extremeChange('min');
    if (largest === null || smallest === null) {
      return [];
    }

    const targets: ExtremaTarget[] = [{
      label: `${rankLabel('max', largest.change)} at ${this.points[largest.index].x}`,
      value: largest.change,
      pointIndex: largest.index,
      segment: 'end',
      type: 'max',
      navigationType: 'point',
      xValue: this.points[largest.index].x,
    }];

    // A chart that moved one way only, or one whose rows all moved equally,
    // has a single extreme. Naming the same row as both would report a spread
    // the chart does not have.
    if (smallest.index !== largest.index) {
      targets.push({
        label: `${rankLabel('min', smallest.change)} at ${this.points[smallest.index].x}`,
        value: smallest.change,
        pointIndex: smallest.index,
        segment: 'end',
        type: 'min',
        navigationType: 'point',
        xValue: this.points[smallest.index].x,
      });
    }

    return targets;
  }

  /**
   * Moves the cursor to a chosen extrema target, on the finishing end.
   *
   * @param target - The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    this.row = ENDS.indexOf('end');
    this.col = target.pointIndex;
    this.finalizeNavigation();
  }

  /**
   * Finds the category whose drawn connector is nearest a pointer position.
   *
   * Resolves to the starting end rather than to whichever dot is closest.
   * Neither end is privileged the way an error bar's estimate is, so the
   * cursor lands where it would have entered, and the reader moves from there
   * rather than from wherever the pointer happened to fall.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The nearest category, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues?.[START_ROW];
    if (!elements || elements.length === 0) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let col = 0; col < elements.length; col++) {
      const box = elements[col].getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const distance = (centerX - x) ** 2 + (centerY - y) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = { element: elements[col], row: START_ROW, col, centerX, centerY };
      }
    }

    return nearest;
  }
}
