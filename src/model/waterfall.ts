import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, WaterfallKind, WaterfallPoint } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
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

    const { min, max } = MathUtil.minMax(this.deltaValues[0]);
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

    const flat = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one));

    if (flat.length !== this.points.length) {
      return null;
    }
    return [flat];
  }

  protected get values(): number[][] {
    return this.deltaValues;
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

    const stats: DescriptionState['stats'] = [
      { label: 'Number of steps', value: this.points.length },
      { label: 'Increases', value: increases },
      { label: 'Decreases', value: decreases },
    ];

    if (this.points.length > 0) {
      // Where the chart starts and where it ends is the whole point of the
      // form, and it is not recoverable from the contributions: the reader
      // would have to sum every delta while navigating.
      stats.push(
        { label: 'Starting value', value: Number(this.points[0].start) },
        {
          label: 'Ending value',
          value: Number(this.points[this.points.length - 1].end),
        },
      );
    }

    if (steps.length > 0) {
      // The largest mover is what a waterfall is read to find, and scanning
      // for it by ear means walking every step.
      const magnitudes = steps.map(point => Math.abs(Number(point.delta)));
      const largest = steps[magnitudes.indexOf(Math.max(...magnitudes))];
      stats.push({
        label: 'Largest contribution',
        value: `${largest.x} (${Number(largest.delta)})`,
      });
    }

    const headers = [this.xAxis, 'Change', 'Running total'];
    const rows: (string | number)[][] = this.points.map(point => [
      point.x,
      Number(point.delta),
      Number(point.end),
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
