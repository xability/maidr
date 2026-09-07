import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, WordCloudPoint } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { defaultFormat } from '@util/format';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { watchViewport } from '@util/viewport';
import { AbstractTrace } from './abstract';
import { isMeasured, MISSING_TEXT } from './bar';
import { MovableGrid } from './movable';

/**
 * How a term's share of the corpus reads.
 *
 * A term with no weight has no share to report, and a corpus weighing nothing
 * has nothing to divide by -- `0 / 0` is `NaN`, and "NaN percent" is the one
 * thing this must never announce. An exact zero rather than the one-decimal
 * form used for real ratios, because nothing was rounded to get there.
 *
 * @param weight - The term's weight, `NaN` when it has none
 * @param total - What every measured term weighs together
 * @returns The share as display text, e.g. `49.6%`
 */
function toShare(weight: number, total: number): string {
  if (!isMeasured(weight)) {
    return MISSING_TEXT;
  }
  if (total === 0) {
    return '0%';
  }
  return `${((weight / total) * 100).toFixed(1)}%`;
}

/**
 * Orders terms by weight, heaviest first, keeping each term's original index.
 *
 * The index is the point of this: the drawn glyphs resolve in document order,
 * so reordering the terms without carrying the permutation would leave every
 * highlight on the wrong word. Returning both keeps the two in step.
 *
 * Ties keep their original relative order, so a chart whose weights repeat
 * still reads the same way twice.
 *
 * A term whose weight is not a number sorts to the end rather than wherever
 * the comparator happens to drop it. `WordCloudPoint.y` admits a string
 * because producers send one, and `Number('n/a')` is `NaN`: subtracting it
 * answers `NaN` for every pair, which is neither negative nor positive, so
 * the sort leaves that term in an arbitrary place -- and the summary then
 * reported whatever landed first as the heaviest term, at a weight of `NaN`.
 * Unmeasured last is the same treatment a gap gets everywhere else here.
 *
 * @param points - The terms as authored
 * @returns The terms heaviest first, each with the index it was authored at
 */
function byDescendingWeight(
  points: WordCloudPoint[],
): { point: WordCloudPoint; source: number }[] {
  return points
    .map((point, source) => ({ point, source }))
    .sort((a, b) => {
      const left = Number(a.point.y);
      const right = Number(b.point.y);
      if (!isMeasured(left) || !isMeasured(right)) {
        return Number(isMeasured(right)) - Number(isMeasured(left));
      }
      return right - left;
    });
}

/**
 * Trace implementation for word clouds.
 *
 * A word cloud is the canonical chart that carries real data while being
 * readable only by eye: each term's weight is encoded as glyph size and
 * written down nowhere on the page. Structurally it is a categorical label
 * and a magnitude, so the reading is a term and its number — "machine, 412"
 * — which is the whole of what the chart encodes and none of what it draws.
 *
 * **Navigation is in weight order, not layout order.** A cloud's spatial
 * arrangement is chosen to pack glyphs into a rectangle; it carries no
 * information, and walking it would hand the reader an arbitrary sequence.
 * Descending weight is the order the chart is read for.
 *
 * Sorting is why this extends {@link AbstractTrace} rather than
 * `AbstractBarPlot`, which it otherwise resembles. That base resolves its
 * highlight elements in **document order** inside its own constructor and
 * pairs `elements[i]` with `points[i]`, so a subclass that sorted its points
 * would announce one term and highlight another — and no model-level test
 * would see it, because the text, the audio and the braille would all be
 * right. Owning the constructor keeps the sort and the permutation together.
 */
export class WordCloudTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  private readonly points: WordCloudPoint[];
  private readonly weights: number[][];

  /**
   * How many of the terms carry a weight the chart could size a glyph by.
   *
   * The sort puts them first, so this is also where the measured terms end:
   * the heaviest is term 0 and the lightest is term `measuredCount - 1`.
   * Everything past it is a term whose weight did not parse, which belongs in
   * neither an extreme nor a total.
   */
  private readonly measuredCount: number;

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Where each glyph was last measured, or null before the reader points at
   * the cloud.
   *
   * Boxes rather than centres, because a term is found by hit-testing the box
   * it occupies. Measured on the first hover rather than in the constructor,
   * so a cloud the reader never points at costs nothing at load.
   */
  private glyphBoxes:
    | { left: number; top: number; width: number; height: number; element: SVGElement }[]
    | null = null;

  /**
   * Whether the glyph boxes have to be measured again before the next hover.
   *
   * They hold viewport coordinates, and the pointer positions they are
   * hit-tested against are always current -- so a page, or a container the
   * chart sits in, scrolling underneath leaves every box off by however far
   * the cloud moved, and the pointer falls through every term. True to begin
   * with, which is what makes the first hover measure.
   */
  private glyphBoxesDirty = true;

  private readonly stopViewportWatch = watchViewport((): void => {
    this.glyphBoxesDirty = true;
  });

  /**
   * Creates a new word cloud trace.
   *
   * @param layer - The MAIDR layer carrying the terms and their weights
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const ordered = byDescendingWeight(layer.data as WordCloudPoint[]);
    this.points = ordered.map(entry => entry.point);
    this.weights = [this.points.map(point => Number(point.y))];
    this.measuredCount = this.weights[0].filter(isMeasured).length;

    // Over the measured weights only. An unparseable one is `NaN`, and every
    // comparison against it is false -- so it slipped through `minMax`
    // unnoticed except when it landed first, where it became the min and the
    // max and flattened the pitch of every term in the cloud.
    const { min, max } = MathUtil.minMax(this.weights[0].filter(isMeasured));
    this.min = min;
    this.max = max;

    this.highlightValues = this.mapToSvgElements(
      layer.selectors,
      ordered.map(entry => entry.source),
    );
    this.movable = new MovableGrid<WordCloudPoint>([this.points]);
  }

  /**
   * Resolves the layer's selectors and reorders them to match the terms.
   *
   * `Svg.selectAllElements` answers in document order, which for a cloud is
   * packing order — unrelated to weight. The permutation from the sort is
   * applied here so element *i* is the glyph for term *i*, whichever order
   * the two happened to start in.
   *
   * @param selectors - The layer's selectors, when it has any
   * @param order - Each term's index in the authored data, heaviest first
   * @returns One row of elements in weight order, or null when unresolvable
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    order: number[],
  ): SVGElement[][] | null {
    if (typeof selectors !== 'string' && !Array.isArray(selectors)) {
      return null;
    }

    const drawn = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one));

    // A partial resolution cannot be repaired by reordering: it is not known
    // which terms the missing glyphs belonged to, so every pairing after the
    // gap would be a guess. Report no highlight rather than a plausible one.
    if (drawn.length !== order.length) {
      return null;
    }
    return [order.map(source => drawn[source])];
  }

  protected get values(): number[][] {
    return this.weights;
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
        raw: this.weights[0][this.col],
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
      values: this.weights,
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
      // The number the chart encodes as glyph size and prints nowhere. Without
      // it a reader gets the terms and no way to tell which one is heaviest,
      // which is the only thing a cloud is drawn to say.
      cross: { label: this.yAxis, value: Number(point.y) },
      mainAxis: 'x',
      crossAxis: 'y',
    };
  }

  public get description(): DescriptionState {
    const weights = this.weights[0];
    // Measured weights only: an unparseable one summed into the corpus made
    // the total `NaN`, which the dialog blanks -- so the line vanished with
    // nothing saying why.
    const total = weights
      .filter(isMeasured)
      .reduce((sum, weight) => sum + weight, 0);
    const lightest = this.measuredCount - 1;

    const stats: DescriptionState['stats'] = [
      { label: 'Number of terms', value: this.points.length },
    ];

    if (this.measuredCount > 0) {
      // Which term is heaviest is the question a cloud is drawn to answer at a
      // glance, and it is the one thing a reader walking the terms one at a
      // time has to hold in their head to recover.
      stats.push({ label: 'Heaviest term', value: this.termSummary(0) });
      // The same guard {@link getExtremaTargets} applies, and for the same
      // reason: one term, or a cloud whose weights are all equal, has a single
      // extreme. Naming a second one told a reader the weights differ on a
      // chart where they do not -- while the rotor, asked the same question,
      // offered one target.
      if (lightest !== 0 && weights[lightest] !== weights[0]) {
        stats.push({ label: 'Lightest term', value: this.termSummary(lightest) });
      }
      stats.push({ label: 'Total weight', value: total });
    }

    // A term whose weight did not parse is one of the terms the chart draws
    // and none of the arithmetic above it, and until now the only sign of it
    // was a blank cell in the table.
    const unweighted = this.points.length - this.measuredCount;
    if (unweighted > 0) {
      stats.push({ label: 'Terms with no weight', value: unweighted });
    }

    if (this.points.length > 1) {
      // Navigation and this table both depart from the authored order, and a
      // reader comparing either against the source data would otherwise find
      // the rows rearranged with nothing to explain it. Said once here, the
      // way `orientationLabel` says it for the families that reverse theirs.
      stats.push({ label: 'Order', value: 'Terms are listed heaviest first, not as authored' });
    }

    // Domain names where the layer labelled nothing: `named()` would fall back
    // to the literal 'X' and 'Y', and the dialog's table names every cell by
    // its column header -- so a screen reader walked it announcing "X,
    // machine, Y, 412".
    const headers = [
      this.layer.axes?.x?.label?.trim() ? this.xAxis : 'Term',
      this.layer.axes?.y?.label?.trim() ? this.yAxis : 'Weight',
      'Share of total',
    ];
    // A cloud encodes prominence, and prominence is a share: 412 of 830 is
    // half the corpus, which is the reading a sighted reader takes from glyph
    // size and the one this table left them to divide out.
    const rows: (string | number)[][] = this.points.map((point, term) => [
      point.x,
      isMeasured(weights[term]) ? weights[term] : MISSING_TEXT,
      toShare(weights[term], total),
    ]);

    // The term sits on x and its weight on y, the axes the announcement
    // already speaks both through. The share is divided out of the total
    // here, so the layer never declared an axis for it.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = ['x', 'y', undefined];

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, columnAxes, rows },
    };
  }

  /**
   * How one term reads where the summary names it.
   *
   * The weight goes through `defaultFormat` because it is interpolated into a
   * string, which `DescriptionService` takes for display text and leaves
   * alone: a cloud weighted by a computed score reached the dialog naming its
   * heaviest term at `0.3333333333333333`, beside the `0.33` the announcement
   * speaks for the same term.
   *
   * @param term - Which term, in weight order
   * @returns The term and its weight, e.g. `machine (412)`
   */
  private termSummary(term: number): string {
    return `${this.points[term].x} (${defaultFormat(this.weights[0][term])})`;
  }

  /**
   * Offers the heaviest and lightest terms as extrema targets.
   *
   * They sit at the two ends of the sorted row, so this is a lookup rather
   * than a search — but it still has to exist: the base `navigateToExtrema`
   * throws precisely when `supportsExtrema` is set.
   *
   * @returns The heaviest and lightest terms, when the cloud has any
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    if (this.measuredCount === 0) {
      return [];
    }

    // The lightest *measured* term, not the last one walked: the terms whose
    // weight did not parse sort after it, and offering one as an extreme
    // would send the reader to a term at a weight of `NaN`.
    const last = this.measuredCount - 1;
    const targets: ExtremaTarget[] = [{
      label: `Heaviest term, ${this.points[0].x}`,
      value: this.weights[0][0],
      pointIndex: 0,
      segment: 'term',
      type: 'max',
      navigationType: 'point',
      xValue: this.points[0].x,
    }];

    // One term, or a cloud whose weights are all equal, has a single extreme.
    if (last !== 0 && this.weights[0][last] !== this.weights[0][0]) {
      targets.push({
        label: `Lightest term, ${this.points[last].x}`,
        value: this.weights[0][last],
        pointIndex: last,
        segment: 'term',
        type: 'min',
        navigationType: 'point',
        xValue: this.points[last].x,
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
   * Measures where every glyph is drawn.
   *
   * @returns One box per term, in weight order, or null when nothing resolved
   */
  private mapSvgElementsToBoxes():
    | { left: number; top: number; width: number; height: number; element: SVGElement }[]
    | null {
    const elements = this.highlightValues?.[0];
    if (!elements || elements.length === 0) {
      return null;
    }

    return elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        element,
      };
    });
  }

  /**
   * Finds the term whose glyph contains a pointer position.
   *
   * Hit-tests the bounding box rather than resolving to the nearest centre: a
   * cloud's glyphs vary hugely in size, so the centre of a large term can sit
   * further from the pointer than a small term the pointer is nowhere near.
   *
   * The boxes are the ones last measured rather than measured here. This runs
   * on every `pointermove`, unthrottled, and the scan only stops early when
   * the pointer is inside a glyph -- between them, which is most of a cloud,
   * it measured every term on every event.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The term under the pointer, or null when between glyphs
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    if (this.glyphBoxesDirty) {
      this.glyphBoxes = this.mapSvgElementsToBoxes();
      this.glyphBoxesDirty = false;
    }

    const boxes = this.glyphBoxes;
    if (!boxes) {
      return null;
    }

    for (let col = 0; col < boxes.length; col++) {
      const box = boxes[col];
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
          element: box.element,
          row: 0,
          col,
          centerX: box.left + box.width / 2,
          centerY: box.top + box.height / 2,
        };
      }
    }

    return null;
  }

  /**
   * Releases the viewport watch the glyph boxes are invalidated by.
   */
  public override dispose(): void {
    this.stopViewportWatch();
    this.glyphBoxes = null;

    super.dispose();
  }
}
