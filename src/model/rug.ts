import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, RugPoint } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, AxisType, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { isMeasured, missingText } from './bar';
import { extremumAt } from './extremaTarget';
import { MovableGrid } from './movable';

/**
 * The most bins a declared `tickStep` may cut the axis into before it is
 * ignored in favour of the derived binning -- the same ceiling the scatter's
 * grid mode applies, for the same reason: a step of `0.001` over a span of
 * thousands is a typo, not a request for a million-cell braille row.
 */
const MAX_DECLARED_BINS = 10_000;

/** One stretch of the marked axis and how many observations fall in it. */
interface Bin {
  min: number;
  max: number;
  count: number;
}

/**
 * Trace implementation for rug plots: observations marked as ticks along
 * one axis.
 *
 * A rug has one quantity per observation, its position, and it is drawn to
 * show where the observations fall and where they bunch up. Read as a scatter
 * whose other coordinate is a constant it lost both: every tick played the
 * bottom note because the pitch axis never moved, and the braille had no
 * surface at all, so the clustering a sighted reader takes in at a glance
 * reached a blind one only as text, one number per keypress (#1132).
 *
 * So the position is what every channel carries. The pitch is the position
 * on the marked axis's own scale, and the stereo pan follows it too, so
 * three ticks close together and one far off sound like three notes close
 * together and one far off. The braille is a density strip: the observation
 * count per bin along the axis, one row, so a whole distribution fits on a
 * display at once. Text announces the position and which observation it is,
 * in order, which is the empirical rank a rug's ticks show by their spacing.
 *
 * The observations are walked in ascending order of position whatever order
 * the producer listed them in, because the axis is the only structure the
 * chart has; a rug listed in collection order would otherwise be walked in
 * an order the drawing does not show. The producer's order still decides
 * which element a flat selector pairs with which observation.
 */
export class RugTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;
  protected readonly highlightValues: SVGElement[][] | null;

  private readonly orientation: Orientation;
  /** The observations' positions, in ascending order -- the walk order. */
  private readonly positions: number[];
  /**
   * For each walked position, its index in the producer's data. A flat
   * selector names one element per point in that order, so this is what
   * pairs a walked position with the tick that draws it.
   */
  private readonly order: number[];
  /** The marked axis's extent, which the pitch and the pan are read against. */
  private readonly axisMin: number;
  private readonly axisMax: number;
  /** The braille bins, left to right along the marked axis. */
  private readonly bins: Bin[];
  /** For each walked position, the bin it falls in. */
  private readonly binOf: number[];

  public constructor(layer: MaidrLayer) {
    super(layer);
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    const points = Array.isArray(layer.data) ? (layer.data as RugPoint[]) : [];
    const field = this.isVertical ? 'x' : 'y';
    // A position that is not a number is not an observation. Dropped here
    // rather than sorted to one end, where it would announce as a tick the
    // chart does not draw; `order` keeps the surviving points paired with
    // their own elements.
    const measured = points
      .map((point, index) => ({ value: Number(point?.[field]), index }))
      .filter(({ value }) => Number.isFinite(value))
      .sort((a, b) => a.value - b.value);
    this.positions = measured.map(({ value }) => value);
    this.order = measured.map(({ index }) => index);

    // The declared axis when it covers the data, the data's own span when
    // it does not. A declared range is what the drawing shows -- a rug under
    // a histogram runs the histogram's axis, and its pitch should agree with
    // where the eye sees the tick -- but one that leaves observations
    // outside it would pitch them off the scale, so the data wins then.
    const axis = layer.axes?.[field];
    const dataMin = MathUtil.safeMin(this.positions);
    const dataMax = MathUtil.safeMax(this.positions);
    this.axisMin = RugTrace.isFinite(axis?.min) && axis.min <= dataMin ? axis.min : dataMin;
    this.axisMax = RugTrace.isFinite(axis?.max) && axis.max >= dataMax ? axis.max : dataMax;

    this.bins = this.buildBins(axis?.tickStep);
    this.binOf = this.positions.map(value => this.binIndexOf(value));

    this.highlightValues = this.mapToSvgElements(layer.selectors, points.length);
    this.movable = new MovableGrid<number>(this.positions.length > 0 ? [this.positions] : []);
  }

  public override dispose(): void {
    this.positions.length = 0;
    this.order.length = 0;
    this.bins.length = 0;
    this.binOf.length = 0;
    super.dispose();
  }

  private get isVertical(): boolean {
    return this.orientation === Orientation.VERTICAL;
  }

  /** The axis the ticks stand on, as the text and description formatters name it. */
  private get markedAxis(): AxisType {
    return this.isVertical ? 'x' : 'y';
  }

  private get markedAxisLabel(): string {
    return this.isVertical ? this.xAxis : this.yAxis;
  }

  private static isFinite(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  /**
   * Cuts the marked axis into the bins the braille strip counts over.
   *
   * A declared `tickStep` is honoured when it cuts the declared axis into a
   * sane number of bins, because then the strip lines up with the ticks the
   * chart draws. Otherwise the axis is cut into `ceil(sqrt(n))` equal bins,
   * the square-root rule every plotting library falls back on for a
   * histogram's default -- so a rug with no declaration still has a strip,
   * and one whose author declared nothing about the axis is not the one
   * chart with no braille surface (#1132).
   *
   * A rug of one position, or of none, has a single bin: there is no span
   * to cut, and one cell that reads full or blank says as much as the chart.
   * @param tickStep - The bin width the layer declares, if any
   * @returns The bins, left to right, with their counts still zero
   */
  private buildBins(tickStep: number | undefined): Bin[] {
    const span = this.axisMax - this.axisMin;
    if (this.positions.length === 0 || !(span > 0)) {
      return [{ min: this.axisMin, max: this.axisMax, count: 0 }];
    }

    const declared = RugTrace.isFinite(tickStep) && tickStep > 0
      && span / tickStep <= MAX_DECLARED_BINS
      ? Math.round(span / tickStep)
      : 0;
    const count = declared > 0 ? declared : Math.ceil(Math.sqrt(this.positions.length));
    const width = span / count;

    const bins: Bin[] = [];
    for (let i = 0; i < count; i++) {
      bins.push({
        min: this.axisMin + i * width,
        // The last bin reaches the axis maximum exactly, so the largest
        // observation is inside it rather than a rounding error past it.
        max: i === count - 1 ? this.axisMax : this.axisMin + (i + 1) * width,
        count: 0,
      });
    }
    return bins;
  }

  /**
   * The bin a position falls in, counting it there as a side effect.
   *
   * Half-open on the right, except the last bin, which is closed so the
   * maximum is not left out -- the same rule the scatter's grid uses.
   * @param value - A position on the marked axis
   * @returns The bin's index
   */
  private binIndexOf(value: number): number {
    const last = this.bins.length - 1;
    let index = last;
    for (let i = 0; i < last; i++) {
      if (value < this.bins[i].max) {
        index = i;
        break;
      }
    }
    this.bins[index].count += 1;
    return index;
  }

  /**
   * Pairs each walked position with the element that draws its tick.
   *
   * A flat selector names one element per observation in the producer's
   * order; a list names one per observation directly. Either way the count
   * has to match the data exactly -- a chart that drew fewer ticks than it
   * listed observations has nothing honest to pair, and guessing would light
   * up the wrong tick with full confidence, which is worse than no highlight.
   * @param selector - The layer's selectors, in any of the shapes the grammar allows
   * @param count - How many observations the producer listed
   * @returns One row of elements in walk order, or null for no highlight
   */
  private mapToSvgElements(
    selector: MaidrLayer['selectors'],
    count: number,
  ): SVGElement[][] | null {
    if (!selector || count === 0 || this.positions.length === 0) {
      return null;
    }

    let elements: SVGElement[];
    if (typeof selector === 'string') {
      const queried = Svg.selectAllElements(selector);
      if (queried.length !== count) {
        queried.forEach(element => element.remove());
        return null;
      }
      elements = queried;
    } else if (Array.isArray(selector)) {
      const flat = selector.filter((entry): entry is string => typeof entry === 'string');
      if (flat.length !== selector.length || flat.length !== count) {
        return null;
      }
      // Looked up before anything is inserted, for the reason `AbstractBarPlot`
      // records: a clone inserted after its element shifts what a positional
      // selector resolves to next (#1004).
      const found = flat.map(one => Svg.selectElement(one, false));
      if (found.includes(null)) {
        return null;
      }
      elements = (found as SVGElement[]).map(element => Svg.cloneHidden(element));
    } else {
      return null;
    }

    return [this.order.map(index => elements[index])];
  }

  protected get audio(): AudioState {
    const value = this.positions[this.col];
    // The pan follows the position on the axis rather than the observation's
    // index, so a gap between two ticks is a gap between two notes in both
    // the ear's dimensions; `cols: 2` with a fraction in `x` is the same idiom
    // `PieTrace` uses to pan by angle.
    const span = this.axisMax - this.axisMin;
    const fraction = span > 0 ? (value - this.axisMin) / span : 0.5;
    return {
      freq: { raw: value, min: this.axisMin, max: this.axisMax },
      panning: { x: fraction, y: 0, rows: 1, cols: 2 },
    };
  }

  protected get braille(): BrailleState {
    const counts = this.bins.map(bin => bin.count);
    return {
      empty: false,
      id: this.id,
      values: [counts],
      min: [0],
      max: [MathUtil.safeMax(counts)],
      row: 0,
      col: this.binOf[this.col],
    };
  }

  protected get text(): TextState {
    return {
      main: { label: this.markedAxisLabel, value: this.positions[this.col] },
      mainAxis: this.markedAxis,
      // Which observation this is, counting from the low end. The ticks'
      // spacing is what a rug shows, and the rank is how a reader who cannot
      // see the spacing learns that the sixth of twelve observations sits at
      // a quarter of the range -- the empirical distribution, one step at a
      // time. An aside rather than a cross value: it is a count, not a value
      // on any axis, so no axis formatter should touch it.
      asides: [{
        label: t('model.rugObservation'),
        value: t('model.rugObservationOf', { index: this.col + 1, count: this.positions.length }),
      }],
    };
  }

  public get description(): DescriptionState {
    const count = this.positions.length;
    const stats: DescriptionState['stats'] = [
      { label: t('model.statTotalObservations'), value: count },
    ];

    if (count > 0) {
      const min = this.positions[0];
      const max = this.positions[count - 1];
      const median = count % 2 === 1
        ? this.positions[(count - 1) / 2]
        : (this.positions[count / 2 - 1] + this.positions[count / 2]) / 2;
      stats.push(
        { label: t('model.statMinValue'), value: min },
        { label: t('model.statMaxValue'), value: max },
        { label: t('model.statMedian'), value: median },
      );

      // Where the observations bunch up -- the question a rug is drawn to
      // answer, and the one thing a reader could otherwise only get by
      // walking every tick. The same strip the braille shows, in words.
      const densest = this.bins.reduce((best, bin) => (bin.count > best.count ? bin : best), this.bins[0]);
      stats.push({
        label: t('model.statDensestInterval'),
        value: t('model.statModalBinValue', {
          range: MathUtil.spannedOrMissing(densest.min, densest.max),
          count: densest.count,
        }),
      });
    } else {
      stats.push(
        { label: t('model.statMinValue'), value: missingText() },
        { label: t('model.statMaxValue'), value: missingText() },
      );
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [this.markedAxisLabel],
        columnAxes: [this.markedAxis],
        rows: this.positions.map(value => [value]),
      },
    };
  }

  protected get dimension(): Dimension {
    return { rows: this.positions.length > 0 ? 1 : 0, cols: this.positions.length };
  }

  protected get values(): number[][] {
    return [this.positions];
  }

  /**
   * The rotor's lower and higher search along the one row.
   *
   * The positions are sorted, so a higher value is always the next tick and
   * a lower one always the previous -- the rotor degenerates to the arrow
   * keys, which is correct rather than a shortcut, and the boundary is still
   * reported at either end. Up and down have no row to move on.
   * @param direction - Which way to search
   * @param type - Whether a lower or a higher value is sought
   * @returns True when a matching observation was found and moved to
   */
  public override moveToNextCompareValue(
    direction: 'left' | 'right' | 'up' | 'down',
    type: 'lower' | 'higher',
  ): boolean {
    if (direction === 'up' || direction === 'down') {
      this.notifyRotorBounds();
      return false;
    }
    return this.compareSearchAlongRow(this.positions, direction, type);
  }

  public override getExtremaTargets(): ExtremaTarget[] {
    const count = this.positions.length;
    if (count === 0) {
      return [];
    }
    const min = this.positions[0];
    const max = this.positions[count - 1];
    if (!isMeasured(min) || !isMeasured(max)) {
      return [];
    }

    const target = (
      name: string,
      value: number,
      pointIndex: number,
      type: 'max' | 'min',
    ): ExtremaTarget => ({
      ...extremumAt(name, String(value)),
      value,
      pointIndex,
      segment: 'rug',
      type,
      navigationType: 'point',
      xValue: value,
    });

    // One target per tick at the extreme, not just the first: two
    // observations at the maximum are two places a reader can be sent, and
    // the walk order puts the ties side by side.
    const targets: ExtremaTarget[] = [];
    for (let index = count - 1; index >= 0 && this.positions[index] === max; index--) {
      targets.push(target(t('model.extremaMaxPoint'), max, index, 'max'));
    }
    for (let index = 0; index < count && this.positions[index] === min; index++) {
      targets.push(target(t('model.extremaMinPoint'), min, index, 'min'));
    }
    return targets;
  }

  public override navigateToExtrema(target: ExtremaTarget): void {
    this.col = target.pointIndex;
    this.finalizeNavigation();
  }

  /**
   * The tick nearest the pointer, by distance to its centre.
   *
   * A tick is a hairline, so a bounding-box hit test would need the pointer
   * on the line itself; the nearest centre is what a line trace answers, and
   * the guidance beeps then lead the pointer to it.
   * @param x - The pointer's x
   * @param y - The pointer's y
   * @returns The nearest tick, or null when the layer highlights nothing
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const row = this.highlightValues?.[0];
    if (!row || row.length === 0) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let best = Infinity;
    for (let col = 0; col < row.length; col++) {
      const element = row[col];
      if (!element?.getBoundingClientRect) {
        continue;
      }
      const box = element.getBoundingClientRect();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const distance = Math.hypot(centerX - x, centerY - y);
      if (distance < best) {
        best = distance;
        nearest = { element, row: 0, col, centerX, centerY };
      }
    }
    return nearest;
  }
}
