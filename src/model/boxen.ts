import type { ExtremaTarget } from '@type/extrema';
import type { BoxenPoint, LetterValueLevel, MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextAside, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { extremumAt } from './extremaTarget';
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
  /** The quantile it is, from 0 to 1: `p` below the median, `1 - p` above. */
  quantile: number;
}

/** One drawn box of a ladder and its extent along the value axis. */
interface BoxSpan {
  box: SVGElement;
  /** Where it starts, lowest value first, in screen pixels. */
  from: number;
  /** Where it ends. */
  to: number;
}

/** The elements a ladder's boxes are drawn as. */
const BOX_TAGS: ReadonlySet<string> = new Set(['rect', 'path', 'polygon']);

/** The elements a median drawn across a ladder is drawn as. */
const LINE_TAGS: ReadonlySet<string> = new Set(['line', 'polyline']);

/**
 * How far, in pixels, two boxes may overlap and still be read as tiled, or a
 * nested box overhang the one around it: the half pixel a stroke and the
 * rounding of a drawn coordinate add.
 */
const SPAN_TOLERANCE = 0.5;

/**
 * How far, in pixels, the edge of a tiled box may sit from where the value
 * it stands for falls on a straight scale, and still be read as drawn on it.
 * A quarter of a pixel: the boxes are drawn from the very values the layer
 * reports, so they fall on the scale to within the rounding of a drawn
 * coordinate, and a pixel's slack let a ladder taken the wrong way round fit
 * a scale by coincidence.
 */
const SCALE_TOLERANCE = 0.25;

/**
 * A ladder read off the chart: boxes nested about the median, which pair
 * with its stops whichever way the value axis runs, or boxes tiled edge to
 * edge in the order they are drawn, lowest on the page or furthest left
 * first, which pair with them only once that way is known.
 */
type LadderRead
  = | { layout: 'nested'; stops: SVGElement[] }
    | { layout: 'tiled'; boxes: BoxSpan[]; median: SVGElement | null };

/**
 * Names a quantile by its percentile, which is the number a reader can place.
 *
 * Trailing zeros are trimmed rather than fixed, so the common rungs read as
 * "25th" and "75th" rather than "25.0th" while a deep one still reads as
 * "0.39th" instead of rounding to "0th" -- and rounding a deep rung to zero
 * would name several different rungs identically, which is exactly the part
 * of the distribution a letter-value plot exists to separate.
 *
 * The upper tail is the same problem against 100, so the precision follows
 * the distance to whichever end is nearer: three significant digits of it,
 * on both sides. Three significant digits of the percentile itself named the
 * 99.95th and the 99.98th both "100th", a percentile the drawn outliers above
 * them showed was not reached. So "0.0244th" now pairs with "99.9756th",
 * and "6.25th" with "93.75th", the two ends of one rung.
 *
 * @param fraction - A quantile, from 0 to 1
 * @returns Its percentile, as text
 */
export function percentileLabel(fraction: number): string {
  const percent = fraction * 100;
  const fromEnd = Math.min(percent, 100 - percent);
  const decimals = fromEnd > 0 ? Math.max(0, 2 - Math.floor(Math.log10(fromEnd))) : 0;
  const rounded = Number(percent.toFixed(decimals));
  return t('model.boxenPercentile', { percent: rounded.toString(), suffix: englishOrdinalSuffix(rounded) });
}

const ENGLISH_ORDINAL = new Intl.PluralRules('en', { type: 'ordinal' });
const ENGLISH_SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' };

/**
 * The English ordinal suffix for a percentile, which only the English template
 * fills: "2nd", "23rd", "11th" for a whole number, and "th" for a fraction,
 * which reads as "12.5th".
 *
 * @param percent - The percentile
 * @returns Its suffix
 */
function englishOrdinalSuffix(percent: number): string {
  if (!Number.isInteger(percent)) {
    return 'th';
  }
  return ENGLISH_SUFFIX[ENGLISH_ORDINAL.select(percent)] ?? 'th';
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
  /**
   * `[` and `]` go to the two ends of the quantile range, and the Go To
   * dialog lists both: see {@link BoxenTrace.getExtremaTargets}.
   */
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  private readonly points: BoxenPoint[];
  private readonly orientation: Orientation;

  /** The ladders, one per distribution, in value order. */
  private readonly rungs: Rung[][];
  private readonly rungValues: number[][];

  private readonly min: number;
  private readonly max: number;

  /**
   * The quantile a walk across distributions is holding, or null when the
   * reader last moved along a ladder or jumped to a position.
   */
  private heldQuantile: number | null = null;

  /**
   * The element the chart drew each distribution as, as the selectors named
   * it: the chart's own, never cloned or removed, for the pointer to be
   * measured against.
   */
  private readonly distributionElements: SVGElement[];

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

    const drawn = this.resolveDistributions(layer.selectors);
    this.distributionElements = drawn ?? [];
    const reads = this.distributionElements
      .map((element, row) => BoxenTrace.ladderRead(element, this.rungs[row].length, this.orientation));
    const upward = BoxenTrace.valueAxisRunsUp(reads, this.rungs);
    this.highlightValues = drawn === null
      ? null
      : drawn.map((element, row) =>
          BoxenTrace.outlinesOf(element, this.rungs[row], BoxenTrace.stopBoxes(reads[row], upward)));
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
      quantile: level.p,
    }));
    const upper = [...levels].reverse().map(level => ({
      value: Number(level.hi),
      label: percentileLabel(1 - level.p),
      quantile: 1 - level.p,
    }));

    return [
      ...lower,
      { value: Number(point.median), label: t('model.boxenMedianRung'), quantile: 0.5 },
      ...upper,
    ];
  }

  /**
   * Moves the cursor, holding the quantile when it changes distribution.
   *
   * Along a ladder the index is the position, so a move along it is the
   * grid's own. Between distributions the index is not a position: ladders
   * differ in depth, and the third rung of a three-level ladder is its 25th
   * percentile while the third of a four-level one is its 12.5th. So the
   * distribution is stepped and the rung re-chosen as the one nearest the
   * quantile the reader is on -- the same percentile where the next ladder
   * has it, and its nearest rung where the ladder stops short of it.
   *
   * @param direction - Which way to move
   * @returns True if the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      const moved = super.moveOnce(direction);
      if (moved) {
        // Choosing a new rung is choosing a new quantile to hold.
        this.heldQuantile = null;
      }
      return moved;
    }

    if (this.isInitialEntry) {
      // The first arrow press enters the grid rather than stepping through it.
      return super.moveOnce(direction);
    }

    const target = this.row + (direction === 'UPWARD' ? 1 : -1);
    if (target < 0 || target >= this.rungs.length) {
      this.notifyOutOfBounds();
      return false;
    }
    return this.moveHoldingQuantile(target);
  }

  /**
   * Jumps to the first or last distribution, holding the quantile.
   *
   * A jump between distributions has the step's problem: the grid would carry
   * the rung index into the far ladder. A jump along a ladder is the grid's
   * own, and lets go of the held quantile as a step along it does.
   *
   * @param direction - Which edge to jump to
   * @returns True if the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      const moved = super.moveToExtreme(direction);
      if (moved) {
        this.heldQuantile = null;
      }
      return moved;
    }

    if (this.isInitialEntry || this.rungs.length === 0) {
      return super.moveToExtreme(direction);
    }
    return this.moveHoldingQuantile(direction === 'UPWARD' ? this.rungs.length - 1 : 0);
  }

  public override moveToIndex(row: number, col: number): boolean {
    const moved = super.moveToIndex(row, col);
    if (moved) {
      // A jump to a position is a new starting point, not a continuation.
      this.heldQuantile = null;
    }
    return moved;
  }

  /**
   * Sends the reader back to enter the chart afresh, holding nothing.
   *
   * Leaving the trace and coming back (another subplot, another layer)
   * resets it, and the reader enters on its first rung. Held across the
   * reset, the quantile of the walk they had left decided where the next
   * Up or Down went, rather than the rung they entered on.
   */
  public override resetToInitialEntry(): void {
    this.heldQuantile = null;
    super.resetToInitialEntry();
  }

  /**
   * Moves to a distribution, onto its rung nearest the quantile being held.
   *
   * The quantile is the one the reader set out from, not the one the last
   * ladder landed on: walking from a deep ladder through a shallow one to
   * another deep one, the shallow one has to settle for its deepest rung,
   * and the deep one after it still has the percentile the reader started at.
   *
   * @param row - The distribution to move to
   * @returns True if the cursor moved
   */
  private moveHoldingQuantile(row: number): boolean {
    const held = this.heldQuantile ?? this.rungs[this.row]?.[this.col]?.quantile ?? 0.5;
    const moved = this.moveToIndex(row, BoxenTrace.nearestRung(this.rungs[row], held));
    if (moved) {
      // Set after the move, since moveToIndex clears it.
      this.heldQuantile = held;
    }
    return moved;
  }

  /**
   * The rung of a ladder whose quantile is nearest a given one.
   *
   * Ties take the rung nearer the bottom of the ladder, so a reader stepping
   * to a distribution and straight back lands where they started.
   *
   * @param ladder - The ladder to search
   * @param quantile - The quantile to stay nearest, from 0 to 1
   * @returns The index of the nearest rung
   */
  private static nearestRung(ladder: Rung[], quantile: number): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    ladder.forEach((rung, index) => {
      const distance = Math.abs(rung.quantile - quantile);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  /**
   * Resolves the layer's selectors to the element each distribution is drawn
   * as, one per distribution in the order the data lists them.
   *
   * Withdrawn unless the count matches exactly: a list that has slipped by
   * one highlights a neighbouring distribution for the rest of the chart,
   * which is worse than not highlighting at all. Nothing is cloned here, so
   * declining leaves the chart as it was.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns The chart's own elements, or null when unresolvable
   */
  private resolveDistributions(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[] | null {
    // `MaidrLayer['selectors']` also admits `(string | null)[][]` and the box and
    // candlestick shapes, and `Array.isArray` alone lets all of them through
    // to a cast. Narrowing on the elements instead means the guard matches
    // what the type allows, rather than leaning on `isUsableSelector` to
    // reject each entry one at a time and leave an empty list behind.
    let live: SVGElement[];
    if (typeof selectors === 'string') {
      live = Svg.selectAllElements(selectors, false);
    } else if (Array.isArray(selectors) && selectors.every(one => typeof one === 'string')) {
      live = selectors.flatMap(one => Svg.selectAllElements(one, false));
    } else {
      return null;
    }
    return live.length === this.points.length ? live : null;
  }

  /**
   * What each stop of one distribution's ladder outlines: the box of the
   * ladder the stop is read off, as the chart drew it, or the whole element
   * where its boxes could not be paired with the stops.
   *
   * @param element - The chart's element for the distribution
   * @param ladder - Its stops, in walking order
   * @param boxes - The box for each stop, from {@link BoxenTrace.stopBoxes}, or null
   * @returns One highlight element per stop
   */
  private static outlinesOf(
    element: SVGElement,
    ladder: Rung[],
    boxes: SVGElement[] | null,
  ): SVGElement[] {
    if (boxes === null) {
      const whole = Svg.cloneHidden(element);
      return ladder.map(() => whole);
    }
    // One copy of each box however many stops outline it, as the chart drew
    // it once.
    const copies = new Map<SVGElement, SVGElement>();
    return boxes.map((box) => {
      const copy = copies.get(box) ?? Svg.cloneHidden(box);
      copies.set(box, copy);
      return copy;
    });
  }

  /**
   * The box each stop of a ladder is read off, in walking order.
   *
   * A rung is the outer edge of one box -- the edge away from the median --
   * so a stop outlines the box whose outer edge it is: the 12.5th percentile
   * the box from it in to the 25th, the 25th the box straddling the median.
   * The median outlines a line drawn across the ladder inside the same
   * element, where the chart drew one there, and otherwise the box it sits in.
   *
   * Tiled boxes are paired only once the value axis is known to run one way:
   * paired the wrong way round, every stop below the median would outline a
   * box above it, which is worse than the whole ladder.
   *
   * @param read - The ladder as {@link BoxenTrace.ladderRead} found it, or null
   * @param upward - Whether the value axis runs up the page or to the right,
   *   or null when that cannot be told
   * @returns The chart's own element for each stop, or null
   */
  private static stopBoxes(read: LadderRead | null, upward: boolean | null): SVGElement[] | null {
    if (read === null) {
      return null;
    }
    if (read.layout === 'nested') {
      return read.stops;
    }
    if (upward === null) {
      return null;
    }
    // Lowest value first: boxes 0 to k - 2 lie below the middle box k - 1,
    // and k to 2k - 2 above it. Stop c below the median is the lower edge of
    // box c, the quartile's being the middle box's; above it, stop c is the
    // upper edge of box c - 2. With k = 3, stops 0 1 2 | 3 | 4 5 6 outline
    // boxes 0 1 2 | 2 | 2 3 4.
    const boxes = upward ? read.boxes : [...read.boxes].reverse();
    const depth = (boxes.length + 1) / 2;
    return Array.from({ length: 2 * depth + 1 }, (_, stop) => {
      if (stop === depth && read.median !== null) {
        return read.median;
      }
      if (stop < depth) {
        return boxes[stop].box;
      }
      return stop === depth ? boxes[depth - 1].box : boxes[stop - 2].box;
    });
  }

  /**
   * How a ladder is drawn inside the element named for it, or null when the
   * element does not hold the ladder's boxes.
   *
   * The boxes are the element's own children, drawn either way a ladder is
   * drawn: as 2k - 1 boxes tiled edge to edge along the value axis, as
   * seaborn draws them, or as k boxes nested about the median, each spanning
   * a whole rung. Which one is decided by their count and confirmed by their
   * extents. An element holding anything else -- a single mark, boxes the
   * ladder's depth does not account for, boxes that neither tile nor nest --
   * is outlined whole on every stop, as every boxen was before.
   *
   * @param element - The chart's element for the distribution
   * @param stopCount - The ladder's stops: its rungs either side and the median
   * @param orientation - Which way the boxen is drawn
   * @returns The ladder as drawn, or null
   */
  private static ladderRead(
    element: SVGElement,
    stopCount: number,
    orientation: Orientation,
  ): LadderRead | null {
    const depth = (stopCount - 1) / 2;
    if (!Number.isInteger(depth) || depth < 1) {
      return null;
    }

    // Not MAIDR's own copies: a copy is inserted beside the box it copies, so
    // inside this element, and a ladder read again before they are removed
    // would count each box twice. Told apart by tag rather than by
    // `instanceof SVGElement`, which an element from another window's
    // document -- an iframe's -- is not.
    const children = Array.from(element.children)
      .filter(child => !Svg.isOwned(child)) as SVGElement[];
    const boxes = children.filter(child => BOX_TAGS.has(child.localName));
    const lines = children.filter(child => LINE_TAGS.has(child.localName));
    // More than one line -- whiskers or caps beside the median -- and none of
    // them is taken for it: the median outlines the box it sits in.
    const median = lines.length === 1 ? lines[0] : null;
    const isHorizontal = orientation === Orientation.HORIZONTAL;
    // Measured up the page for a boxen standing up, left to right for one
    // lying on its side.
    const spans = boxes.map((box) => {
      const rect = box.getBoundingClientRect();
      return isHorizontal
        ? { box, from: rect.left, to: rect.right }
        : { box, from: -rect.bottom, to: -rect.top };
    });
    // A ladder not laid out has every box at one point, where any order
    // passes for tiled and for nested alike. The trace is built when the
    // reader enters the chart, which a chart not drawn yet cannot take, so
    // this is the rare chart drawn as the reader arrives; the next entry
    // builds it again. Only which box is which is read here: the outlines
    // are copies of the boxes themselves, so a resize or a scroll moves them
    // with the chart.
    const ends = spans.flatMap(span => [span.from, span.to]);
    if (!(Math.max(...ends) - Math.min(...ends) > 0)) {
      return null;
    }

    if (boxes.length === depth) {
      const stops = BoxenTrace.nestedBoxesRead(spans, depth);
      if (stops === null) {
        return null;
      }
      if (median !== null) {
        stops[depth] = median;
      }
      return { layout: 'nested', stops };
    }
    if (boxes.length === 2 * depth - 1) {
      const tiles = BoxenTrace.tiledBoxes(spans);
      return tiles === null ? null : { layout: 'tiled', boxes: tiles, median };
    }
    return null;
  }

  /**
   * Stops of a ladder drawn as k boxes nested about the median, the
   * innermost spanning the quartiles: both ends of a rung outline the box
   * spanning it.
   *
   * @param spans - Each box's extent along the value axis
   * @param depth - The ladder's rungs, k
   * @returns The box for each stop, or null when the boxes do not nest
   */
  private static nestedBoxesRead(spans: BoxSpan[], depth: number): SVGElement[] | null {
    const inward = [...spans].sort((a, b) => (a.to - a.from) - (b.to - b.from));
    for (let i = 1; i < inward.length; i++) {
      const inner = inward[i - 1];
      const outer = inward[i];
      if (inner.from < outer.from - SPAN_TOLERANCE || inner.to > outer.to + SPAN_TOLERANCE) {
        return null;
      }
    }
    // Stop c below the median is rung k - c, which is the box k - c - 1 from
    // the inside; above it, rung c - k is box c - k - 1.
    return Array.from({ length: 2 * depth + 1 }, (_, stop) => {
      if (stop < depth) {
        return inward[depth - stop - 1].box;
      }
      return stop === depth ? inward[0].box : inward[stop - depth - 1].box;
    });
  }

  /**
   * Boxes tiled edge to edge, in the order they are drawn, or null when they
   * do not tile.
   *
   * @param spans - Each box's extent along the value axis
   * @returns The boxes, lowest on the page or furthest left first
   */
  private static tiledBoxes(spans: BoxSpan[]): BoxSpan[] | null {
    const drawnOrder = [...spans].sort((a, b) => (a.from + a.to) - (b.from + b.to));
    for (let i = 1; i < drawnOrder.length; i++) {
      if (drawnOrder[i].from < drawnOrder[i - 1].to - SPAN_TOLERANCE) {
        return null;
      }
    }
    return drawnOrder;
  }

  /**
   * Whether the value axis runs up the page, or left to right, as the tiled
   * ladders are drawn on it: read off their boxes against the values the
   * boxes' edges stand for.
   *
   * Every tiled ladder of the layer is drawn on the one axis, so their edges
   * fall on one straight scale against their rungs' values -- the values
   * themselves, or their logarithms on a log axis -- taken the one way round
   * the axis runs, and generally not the other. Several ladders at different
   * heights settle it between them; a single one does through the asymmetry
   * of its tails. A ladder as symmetric as its mirror image fits both ways,
   * and an axis on neither scale fits neither: the way it runs is then not
   * known, and the tiled ladders are outlined whole.
   *
   * @param reads - Each distribution's ladder as read off the chart
   * @param rungs - Each distribution's stops
   * @returns True up or rightward, false the other way, null when unknown
   */
  private static valueAxisRunsUp(reads: (LadderRead | null)[], rungs: Rung[][]): boolean | null {
    const tiled = reads.flatMap((read, row) => {
      if (read?.layout !== 'tiled') {
        return [];
      }
      const boxes = read.boxes;
      // Each shared edge is taken midway between the two boxes meeting at it.
      const edges = [
        boxes[0].from,
        ...boxes.slice(1).map((box, index) => (boxes[index].to + box.from) / 2),
        boxes[boxes.length - 1].to,
      ];
      // The rungs either side of the median, lowest first: one per edge.
      const ladder = rungs[row];
      const values = ladder.filter((_, index) => index !== (ladder.length - 1) / 2).map(rung => rung.value);
      return [{ edges, values }];
    });
    if (tiled.length === 0) {
      return null;
    }
    const fits = (upward: boolean): boolean => {
      const pairs = tiled.flatMap(({ edges, values }) => edges.map((edge, index): [number, number] =>
        [upward ? values[index] : values[values.length - 1 - index], edge]));
      return BoxenTrace.onOneScale(pairs, value => value, upward)
        || (pairs.every(([value]) => value > 0) && BoxenTrace.onOneScale(pairs, Math.log, upward));
    };
    const up = fits(true);
    return up === fits(false) ? null : up;
  }

  /**
   * Whether drawn positions lie on one straight scale against their values.
   *
   * @param pairs - Each value and the position it is drawn at
   * @param scale - What the axis does to a value before laying it out
   * @param rising - Whether the positions rise with the values
   * @returns True when every position is within {@link SCALE_TOLERANCE} of the scale
   */
  private static onOneScale(
    pairs: [number, number][],
    scale: (value: number) => number,
    rising: boolean,
  ): boolean {
    const points = pairs.map(([value, at]) => [scale(value), at]);
    const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
    const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
    const spread = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
    if (!(spread > 0)) {
      return false;
    }
    const slope = points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / spread;
    if (!(rising ? slope > 0 : slope < 0)) {
      return false;
    }
    return points.every(([x, y]) => Math.abs(meanY + slope * (x - meanX) - y) <= SCALE_TOLERANCE);
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
      ...this.outliersBeyond(),
    };
  }

  /**
   * How many outliers the chart draws past the end of the ladder the cursor
   * is on, as a statement after the reading.
   *
   * Navigation stops at a ladder's deepest rungs, and the points drawn past
   * them -- the extremes of the distribution -- are not stops of their own:
   * they were only in the description, so a reader at the end of a ladder
   * heard nothing of them. Counted here, at the end they lie beyond, the
   * reader learns they are there; the table lists each value.
   *
   * @returns The asides for the current rung, or nothing when there is none
   */
  private outliersBeyond(): { asides?: TextAside[] } {
    const point = this.points[this.row];
    const ladder = this.rungs[this.row];
    if (point === undefined || ladder === undefined) {
      return {};
    }

    const asides: TextAside[] = [];
    const lower = point.lowerOutliers?.length ?? 0;
    if (this.col === 0 && lower > 0) {
      asides.push({
        value: t(
          lower === 1 ? 'model.boxenLowerOutliersBeyondOne' : 'model.boxenLowerOutliersBeyondMany',
          { count: lower },
        ),
      });
    }
    const upper = point.upperOutliers?.length ?? 0;
    if (this.col === ladder.length - 1 && upper > 0) {
      asides.push({
        value: t(
          upper === 1 ? 'model.boxenUpperOutliersBeyondOne' : 'model.boxenUpperOutliersBeyondMany',
          { count: upper },
        ),
      });
    }
    return asides.length > 0 ? { asides } : {};
  }

  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfDistributions'), value: this.points.length },
    ];

    // Index-aligned, so the medians below name their own distribution; the
    // filtered list is only for the names line.
    const nameAt = this.points
      .map(point => (typeof point.z === 'string' ? point.z.trim() : ''));
    const names = nameAt.filter(name => name !== '');
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
            name: nameAt[index]
              || t('model.fallbackNumbered', {
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
    const outlines = this.highlightValues;
    if (!outlines) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    // Measured on, and bounded by, the whole distribution as drawn rather
    // than the box one of its stops outlines: the pointer is on a
    // distribution anywhere over its ladder, and a deep rung's box is a
    // sliver at one end of it.
    for (let row = 0; row < outlines.length; row++) {
      const element = this.distributionElements[row];
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

  /**
   * The chart's own elements high contrast recolours as this layer's marks:
   * each distribution as the layer names it. The boxes the outline moves
   * between are drawn inside those, and pairing each outline with its box,
   * as the default does, would hand high contrast the boxes as marks of
   * their own.
   *
   * @returns The distributions' elements, or none when unresolvable
   */
  public override getAllOriginalElements(): SVGElement[] {
    return this.highlightValues?.length ? [...this.distributionElements] : [];
  }

  /**
   * The rungs at the two ends of the quantile range, for `]`, `[` and the
   * Go To dialog: the highest upper quantile any distribution reaches and
   * the lowest lower one, the range the description gives as `Quantile
   * range`. The outliers past them are not rungs, as they are not in that
   * range. Every rung holding an end is offered, distribution by
   * distribution, so a tie is walked.
   *
   * @returns The targets, or none for a chart with no measured rung
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    if (!Number.isFinite(this.max) || !Number.isFinite(this.min)) {
      return [];
    }
    const span = this.valueSpan;
    const at = (value: number, type: 'max' | 'min'): ExtremaTarget[] =>
      this.rungValues.flatMap((ladder, row) => ladder.flatMap((rung, col) => (
        !MathUtil.nearlyEqualInRange(rung, value, span)
          ? []
          : [{
              ...extremumAt(
                t(type === 'max' ? 'model.extremaMaxPoint' : 'model.extremaMinPoint'),
                this.distributionNameAt(row),
              ),
              value,
              pointIndex: col,
              segment: String(row),
              type,
              groupIndex: row,
              categoryIndex: col,
              navigationType: 'group' as const,
              // So the Go To dialog writes the name with the category axis's
              // format, as the landing announces it.
              xValue: this.authoredNameAt(row) ?? undefined,
            }]
      )));
    return [...at(this.max, 'max'), ...at(this.min, 'min')];
  }

  /**
   * Moves to the rung a target names, as any jump does.
   *
   * @param target - A target from {@link BoxenTrace.getExtremaTargets}
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    if (target.groupIndex !== undefined && target.categoryIndex !== undefined) {
      this.moveToIndex(target.groupIndex, target.categoryIndex);
    }
  }

  /**
   * What a distribution is called: its name, or its position among them.
   *
   * @param row - Which distribution
   * @returns Its name
   */
  private distributionNameAt(row: number): string {
    return this.authoredNameAt(row)
      ?? t('model.fallbackNumbered', { noun: t('model.nounDistribution'), index: row + 1 });
  }

  /**
   * The name the layer gave a distribution, where it gave one.
   *
   * @param row - Which distribution
   * @returns Its name, or null
   */
  private authoredNameAt(row: number): string | null {
    const name = this.points[row]?.z;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
  }
}
