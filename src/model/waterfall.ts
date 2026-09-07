import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, WaterfallKind, WaterfallPoint } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { defaultFormat } from '@util/format';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { isMeasured, MISSING_TEXT } from './bar';
import { MovableGrid } from './movable';

/**
 * How each kind of step is announced.
 *
 * Lower case deliberately: `TextService.announcesSectionBeforeLabel` is true
 * for a state carrying a section and no `z`, which a waterfall step does, and
 * that branch lower-cases the section before announcing it. Capitalising these
 * would therefore be silently undone in verbose mode and kept in terse mode,
 * so the same step would read two different ways.
 */
const KIND_LABEL: Record<WaterfallKind, string> = {
  increase: 'increase',
  decrease: 'decrease',
  total: 'total',
};

/**
 * Trace implementation for waterfall charts — a starting value carried to an
 * ending value through a sequence of signed contributions.
 *
 * The chart draws each step as a bar floating between the running total before
 * it and the running total after it, which means a step carries two numbers a
 * bar chart would conflate: the contribution (the bar's height) and the total
 * it produced (the bar's position). Announcing only one of them answers half
 * the question the chart was drawn for — "how big was marketing's effect" and
 * "where did that leave us" are different questions, and a reader needs both.
 *
 * So the contribution is what is **heard** and what `cross` announces, and the
 * running total travels alongside it in `stack`. Pitching the contribution
 * rather than the total is the deliberate choice: the totals of a waterfall
 * drift within a narrow band around the running value, so scaling pitch to
 * them compresses every step into a near-identical tone, while the deltas span
 * the full signed range and make the large contributors audible immediately —
 * which is what a waterfall is read to find.
 *
 * Navigation is one column per step, as with a bar chart. The steps are a
 * sequence rather than a grid: there is no second dimension to move in.
 */
export class WaterfallTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  private readonly points: WaterfallPoint[];
  private readonly deltaValues: number[][];

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new waterfall trace.
   *
   * @param layer - The MAIDR layer carrying the waterfall steps
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as WaterfallPoint[];
    this.deltaValues = [this.points.map(point => Number(point.delta))];

    // A missing contribution is not a measurement, so it must not set the
    // range: `minMax` seeds from the first value, and a NaN there never loses
    // a comparison, so it would hand every step a NaN pitch.
    const { min, max } = MathUtil.minMax(this.deltaValues[0].filter(isMeasured));
    this.min = min;
    this.max = max;

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<WaterfallPoint>([this.points]);
  }

  /**
   * Resolves the layer's selectors to one element per step.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped as a single row of steps, or null when
   * unresolvable
   */
  private mapToSvgElements(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[][] | null {
    if (typeof selectors !== 'string' && !Array.isArray(selectors)) {
      return null;
    }

    // Resolved live first and cloned only once the count fits. A clone is
    // inserted beside its original the moment it is made, so declining after
    // cloning left every copy in the chart for `dispose()` never to reach --
    // and the next resolution matched the copies too.
    const flat = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors, false)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one, false));

    if (flat.length !== this.points.length) {
      return null;
    }
    return [flat.map(element => Svg.cloneHidden(element))];
  }

  protected get values(): number[][] {
    return this.deltaValues;
  }

  /**
   * The step under the cursor. `points` is a flat list, which the inherited
   * reading -- built for one list per row -- cannot index, and a trace that
   * answers no x is offered rotor compare modes that then do nothing and
   * cannot keep the reader's category across a layer switch.
   *
   * @returns The current step's x
   */
  public override getCurrentXValue(): XValue | null {
    return this.points[this.col]?.x ?? null;
  }

  public override moveToXValue(xValue: XValue): boolean {
    const index = this.points.findIndex(point => point.x === xValue);
    return index !== -1 && this.moveToIndex(0, index);
  }

  public override moveToNextCompareValue(
    direction: 'left' | 'right',
    type: 'lower' | 'higher',
  ): boolean {
    return this.compareSearchAlongRow(this.deltaValues[0] ?? [], direction, type);
  }

  protected get dimension(): Dimension {
    return {
      rows: 1,
      cols: this.points.length,
    };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.deltaValues[0][this.col],
      },
      panning: {
        x: this.col,
        y: 0,
        rows: 1,
        cols: this.points.length,
      },
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.deltaValues,
      min: [this.min],
      max: [this.max],
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.points[this.col];

    return {
      main: { label: this.xAxis, value: point.x },
      // The contribution, which is what the bar's height draws and what the
      // pitch carries.
      cross: { label: this.yAxis, value: Number(point.delta) },
      // The total the step produced, alongside the contribution rather than
      // instead of it. A step announced only as "down 250" leaves the reader
      // tracking the running total in their head across the whole chart.
      stack: { label: 'Running total', value: Number(point.end) },
      // Which way the step moved. Without it a decrease is announced as a
      // bare negative number, and a total — which contributes nothing at all —
      // is indistinguishable from a step that happened to net to its own
      // value.
      section: KIND_LABEL[point.kind],
      mainAxis: 'x',
      crossAxis: 'y',
    };
  }

  public get description(): DescriptionState {
    const steps = this.points.filter(point => point.kind !== 'total');
    const increases = steps.filter(point => point.kind === 'increase').length;
    const decreases = steps.filter(point => point.kind === 'decrease').length;
    const totals = this.points.length - steps.length;

    const stats: DescriptionState['stats'] = [
      { label: 'Number of steps', value: this.points.length },
      { label: 'Increases', value: increases },
      { label: 'Decreases', value: decreases },
    ];

    if (totals > 0) {
      // The restated bars the two counts above deliberately leave out. `kind`
      // is a three-way union, so without them the counts never add up to the
      // number of steps and a reader doing that arithmetic concludes the
      // chart holds steps that neither rose nor fell.
      stats.push({ label: 'Totals', value: totals });
    }

    if (this.points.length > 0) {
      // Where the chart starts and where it ends is the whole point of the
      // form, and it is not recoverable from the contributions: the reader
      // would have to sum every delta while navigating.
      //
      // The opening balance is the first *contributing* step's `start`, not
      // the first bar's. A total is drawn from the baseline, so its `start` is
      // zero by construction -- and on the ordinary bridge, which opens on
      // one, the description therefore said the chart began at 0 while the
      // same bar announced a running total of the whole opening balance. A
      // chart of nothing but totals has no contributing step to read, and its
      // first bar's `end` is the balance it restates.
      const firstStep = this.points.find(point => point.kind !== 'total');
      const startingValue = firstStep === undefined
        ? Number(this.points[0].end)
        : Number(firstStep.start);
      const endingValue = Number(this.points[this.points.length - 1].end);
      // Named rather than left to blank. The dialog blanks a non-finite
      // number, so a bridge whose totals do not parse stood three labels over
      // nothing at all -- which reads as the dialog failing rather than as the
      // chart withholding, and `missing` is the word every other absent value
      // here already uses.
      const reads = (value: number): number | string =>
        isMeasured(value) ? value : MISSING_TEXT;
      stats.push(
        { label: 'Starting value', value: reads(startingValue) },
        { label: 'Ending value', value: reads(endingValue) },
        {
          label: 'Net change',
          // How big the whole move was, which is the headline of a bridge and
          // the one number two large running totals heard seconds apart leave
          // the reader to subtract by ear.
          //
          // Trimmed, because it is a subtraction: `1360.2 - 1200.1` is
          // `160.09999999999991` in IEEE 754, and a screen reader spells out
          // every one of those digits. Twelve significant figures for the
          // reason {@link DumbbellTrace} gives.
          value: reads(Number((endingValue - startingValue).toPrecision(12))),
        },
      );
    }

    // Ranked over the measured steps only, as `getExtremaTargets` ranks
    // them: a NaN would win `Math.max` and name no step at all.
    const measured = steps.filter(point => isMeasured(Number(point.delta)));
    // Both movers, each named by the direction it has. One `Largest
    // contribution` ranked by magnitude answered "what drove this" with
    // whichever end happened to be bigger and never named the other -- while
    // the extrema menu, built from the same steps, offers both -- and it put
    // the direction in a minus sign, which is the reading `text` adds a
    // section to avoid.
    const rises = measured.filter(point => Number(point.delta) > 0);
    if (rises.length > 0) {
      const top = rises.reduce((a, b) => (Number(b.delta) > Number(a.delta) ? b : a));
      stats.push({
        label: 'Largest increase',
        value: `${top.x}, ${defaultFormat(Number(top.delta))}`,
      });
    }
    const falls = measured.filter(point => Number(point.delta) < 0);
    if (falls.length > 0) {
      const bottom = falls.reduce((a, b) => (Number(b.delta) < Number(a.delta) ? b : a));
      stats.push({
        label: 'Largest decrease',
        value: `${bottom.x}, ${defaultFormat(Math.abs(Number(bottom.delta)))}`,
      });
    }

    const headers = [this.xAxis, 'Change', 'Running total', 'Kind'];
    // The step name sits on x and both magnitudes on y, which is the pair
    // `text` announces and the axis it announces the running total through --
    // `end` is where the bar's top is drawn, not a total this trace summed.
    // `kind` is a word for the direction, so it is read off no axis at all.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = [
      'x',
      'y',
      'y',
      undefined,
    ];
    const rows: (string | number)[][] = this.points.map(point => [
      point.x,
      Number(point.delta),
      Number(point.end),
      // The distinction the grammar carries `kind` for, and the one the table
      // dropped: a total restates the running value rather than moving it, so
      // its `delta` is normally the largest number in the column and reads as
      // the chart's biggest mover. The word the announcement already uses.
      KIND_LABEL[point.kind],
    ]);

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, columnAxes, rows },
    };
  }

  /**
   * Offers the biggest mover in each direction as an extrema target.
   *
   * "What drove the change" is the question a waterfall is read to answer, and
   * finding it by ear otherwise means walking every step and holding the
   * running maximum in your head.
   *
   * Totals are excluded. The opening and closing bars carry the largest
   * magnitudes on most charts — they restate the whole running value — so
   * including them would make "largest increase" mean "the closing balance"
   * on nearly every waterfall and bury the answer the reader wanted. Same
   * exclusion as the `Largest contribution` description stat, for the same
   * reason.
   *
   * @returns The largest increase and the largest decrease, when the chart
   * draws any step that moves the total
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const moving = this.points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.kind !== 'total'
        && Number.isFinite(Number(point.delta)));

    if (moving.length === 0) {
      return [];
    }

    const deltaOf = ({ point }: { point: WaterfallPoint }): number =>
      Number(point.delta);
    const largest = moving.reduce((a, b) => (deltaOf(b) > deltaOf(a) ? b : a));
    const smallest = moving.reduce((a, b) => (deltaOf(b) < deltaOf(a) ? b : a));

    const targets: ExtremaTarget[] = [{
      label: `Largest increase at ${largest.point.x}`,
      value: deltaOf(largest),
      pointIndex: largest.index,
      segment: 'waterfall',
      type: 'max',
      navigationType: 'point',
      xValue: largest.point.x,
    }];

    // A chart whose steps all move the same way has one mover, not two, and
    // offering the same step under both labels would tell the reader the
    // biggest rise and the biggest fall are the same bar.
    if (smallest.index !== largest.index) {
      targets.push({
        label: `Largest decrease at ${smallest.point.x}`,
        value: deltaOf(smallest),
        pointIndex: smallest.index,
        segment: 'waterfall',
        type: 'min',
        navigationType: 'point',
        xValue: smallest.point.x,
      });
    }

    return targets;
  }

  /**
   * Moves the cursor to a chosen extrema target.
   *
   * @param target - The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    this.col = target.pointIndex;
    this.finalizeNavigation();
  }

  /**
   * Finds the step whose bar contains a pointer position.
   *
   * Hit-tests the bounding box rather than resolving to the nearest centre,
   * matching {@link BarTrace}: a waterfall step is an area mark, and a bar
   * floating far up the value axis can have its centre closer to the pointer
   * than the bar the pointer is actually inside.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The step under the pointer, or null when it is between bars
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues?.[0];
    if (!elements || elements.length === 0) {
      return null;
    }

    for (let col = 0; col < elements.length; col++) {
      const box = elements[col].getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      if (
        x >= box.left
        && x <= box.left + box.width
        && y >= box.top
        && y <= box.top + box.height
      ) {
        return {
          element: elements[col],
          row: 0,
          col,
          centerX: box.left + box.width / 2,
          centerY: box.top + box.height / 2,
        };
      }
    }

    return null;
  }
}
