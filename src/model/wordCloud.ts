import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, WordCloudPoint } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

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
 * @param points - The terms as authored
 * @returns The terms heaviest first, each with the index it was authored at
 */
function byDescendingWeight(
  points: WordCloudPoint[],
): { point: WordCloudPoint; source: number }[] {
  return points
    .map((point, source) => ({ point, source }))
    .sort((a, b) => Number(b.point.y) - Number(a.point.y));
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

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

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

    const { min, max } = MathUtil.minMax(this.weights[0]);
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
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    const stats: DescriptionState['stats'] = [
      { label: 'Number of terms', value: this.points.length },
    ];

    if (this.points.length > 0) {
      // Which term is heaviest is the question a cloud is drawn to answer at a
      // glance, and it is the one thing a reader walking the terms one at a
      // time has to hold in their head to recover.
      stats.push(
        { label: 'Heaviest term', value: `${this.points[0].x} (${weights[0]})` },
        {
          label: 'Lightest term',
          value: `${this.points[this.points.length - 1].x} `
            + `(${weights[weights.length - 1]})`,
        },
        { label: 'Total weight', value: total },
      );
    }

    const headers = [this.xAxis, this.yAxis];
    const rows: (string | number)[][] = this.points.map(point => [
      point.x,
      Number(point.y),
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
   * Offers the heaviest and lightest terms as extrema targets.
   *
   * They sit at the two ends of the sorted row, so this is a lookup rather
   * than a search — but it still has to exist: the base `navigateToExtrema`
   * throws precisely when `supportsExtrema` is set.
   *
   * @returns The heaviest and lightest terms, when the cloud has any
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    if (this.points.length === 0) {
      return [];
    }

    const last = this.points.length - 1;
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
   * Finds the term whose glyph contains a pointer position.
   *
   * Hit-tests the bounding box rather than resolving to the nearest centre: a
   * cloud's glyphs vary hugely in size, so the centre of a large term can sit
   * further from the pointer than a small term the pointer is nowhere near.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The term under the pointer, or null when between glyphs
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
