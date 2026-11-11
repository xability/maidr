import type { ExtremaTarget } from '@type/extrema';
import type { DumbbellData, DumbbellPoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, AxisType, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { isMeasured, missingText } from './bar';
import { extremumAt } from './extremaTarget';
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
 * The elements that draw a dot rather than a connector.
 *
 * A layer's element per pair is the connector between its two dots, and
 * Google Charts names the starting dot instead. A dot is drawn at one value,
 * so it has no ends to mark: both ends outline it, as they always did.
 */
const DOT_TAGS: ReadonlySet<string> = new Set(['circle', 'ellipse']);

/** A point, in the coordinates of whichever element it is said to be in. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** The six numbers of a two-dimensional transform, as an SVG matrix holds them. */
type Affine = Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>;

/**
 * Where a point of an element's own drawing lands on the page.
 *
 * @param matrix - The element's screen matrix, or null where it has none
 * @param point - The point, in the element's own coordinates
 * @returns The point on the page; the point itself where there is no matrix
 */
function onPage(matrix: Affine | null, point: Point): Point {
  if (matrix === null) {
    return point;
  }
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/**
 * Where a point on the page lands in an element's own drawing: the inverse of
 * {@link onPage}.
 *
 * @param matrix - The element's screen matrix
 * @param point - The point on the page
 * @returns The point in the element's own coordinates, or null where the
 *   matrix flattens the element's drawing onto a line
 */
function fromPage(matrix: Affine, point: Point): Point | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (determinant === 0) {
    return null;
  }
  const x = point.x - matrix.e;
  const y = point.y - matrix.f;
  return {
    x: (matrix.d * x - matrix.c * y) / determinant,
    y: (matrix.a * y - matrix.b * x) / determinant,
  };
}

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
    return t('model.rankNoChange');
  }
  if (kind === 'max') {
    return t(change > 0 ? 'model.rankLargestIncrease' : 'model.rankSmallestDecrease');
  }
  return t(change < 0 ? 'model.rankLargestDecrease' : 'model.rankSmallestIncrease');
}

/**
 * Where each end of a pair is drawn on the connector the chart joins them
 * with.
 *
 * The connector runs from one value to the other along the value axis, so
 * the larger value is drawn at the end of it higher up the page, or further
 * right on a chart lying on its side, and the smaller at the other. Which end
 * that is is read off the page rather than off the connector's own
 * coordinates: Highcharts lays a chart on its side by turning the group its
 * connectors are drawn in, so they run up and down their own coordinates and
 * across the page. A pair whose ends hold one value is drawn at the middle of
 * the connector, both ends at once.
 *
 * A value axis drawn reversed, with its larger values lower down or further
 * left, has the two ends swapped.
 *
 * @param connector - The chart's own connector for the pair
 * @param values - The pair's two values
 * @param values.start - Its starting value
 * @param values.end - Its finishing value
 * @param isHorizontal - Whether the value axis runs across the chart
 * @returns Where to centre each end's marker, in the coordinates of the
 *   connector's parent, or null where the ends cannot be placed: a value
 *   missing, a dot named in place of a connector, a connector the document
 *   cannot measure, or one that does not run along the value axis between
 *   two different values
 */
function endsOn(
  connector: SVGElement,
  { start, end }: Record<End, number>,
  isHorizontal: boolean,
): Record<End, Point> | null {
  const graphic = connector as Partial<SVGGraphicsElement>;
  if (!isMeasured(start) || !isMeasured(end)
    || DOT_TAGS.has(connector.tagName.toLowerCase())
    || typeof graphic.getBBox !== 'function') {
    return null;
  }
  // `getBBox` throws on an element the document cannot measure, as Firefox
  // does on one that is not rendered; the connector is then outlined whole.
  let box: DOMRect;
  let toPage: Affine | null;
  let parentToPage: Affine | null;
  try {
    box = graphic.getBBox();
    toPage = graphic.getScreenCTM?.() ?? null;
    parentToPage = (connector.parentNode as Partial<SVGGraphicsElement> | null)?.getScreenCTM?.() ?? null;
  } catch (error) {
    console.warn('[DumbbellTrace] A connector could not be measured, so both its ends outline all of it:', error);
    return null;
  }

  // The markers go beside the connector, in its parent's coordinates, and it
  // is measured in its own: the two differ by a transform of its own, which
  // Vega draws every line with, if only `translate(0,0)`.
  const inParent = (point: Point): Point | null => {
    if (!connector.hasAttribute('transform')) {
      return point;
    }
    return toPage === null || parentToPage === null
      ? null
      : fromPage(parentToPage, onPage(toPage, point));
  };

  // Which of the connector's own axes the page draws along the value axis:
  // its own x is drawn along (a, b) on the page, and its own y along (c, d).
  const { a, b, c, d } = toPage ?? { a: 1, b: 0, c: 0, d: 1 };
  const alongOwnY = isHorizontal ? Math.abs(c) > Math.abs(a) : Math.abs(d) >= Math.abs(b);
  const length = alongOwnY ? box.height : box.width;
  if (start !== end && !(length > 0)) {
    return null;
  }

  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const [one, other]: [Point, Point] = alongOwnY
    ? [{ x: middle.x, y: box.y }, { x: middle.x, y: box.y + box.height }]
    : [{ x: box.x, y: middle.y }, { x: box.x + box.width, y: middle.y }];
  const [onePage, otherPage] = [onPage(toPage, one), onPage(toPage, other)];
  const oneIsLarger = isHorizontal ? onePage.x > otherPage.x : onePage.y < otherPage.y;
  const [larger, smaller] = oneIsLarger ? [one, other] : [other, one];
  const [startAt, endAt] = start === end
    ? [middle, middle]
    : start > end ? [larger, smaller] : [smaller, larger];

  const startInParent = inParent(startAt);
  const endInParent = inParent(endAt);
  return startInParent === null || endInParent === null
    ? null
    : { start: startInParent, end: endInParent };
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
  private readonly authoredEndLabels: Partial<Record<End, string>>;
  private readonly changes: number[];
  private readonly orientation: Orientation;

  private readonly min: number;
  private readonly max: number;
  private readonly perRowMin: number[];
  private readonly perRowMax: number[];

  /**
   * The chart's own connector for each category, which a pointer is measured
   * against, or null when the selectors do not resolve one per category.
   */
  private readonly connectors: SVGElement[] | null;

  /** The connector each end's marker stands for. */
  private readonly connectorMarkedBy = new WeakMap<SVGElement, SVGElement>();

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
    this.authoredEndLabels = { start: data.startLabel, end: data.endLabel };

    this.endValues = ENDS.map(end =>
      this.points.map(point => Number(point[end])),
    );
    this.changes = this.points.map(changeOf);

    // An unreadable end is NaN, which never loses a comparison: left in, one
    // gap would turn the whole pitch range, and its row's braille range, NaN.
    const { min, max } = MathUtil.minMax(this.endValues.flat().filter(isMeasured));
    this.min = min;
    this.max = max;
    this.perRowMin = this.endValues.map(row => MathUtil.safeMin(row.filter(isMeasured)));
    this.perRowMax = this.endValues.map(row => MathUtil.safeMax(row.filter(isMeasured)));

    this.connectors = this.resolveConnectors(layer.selectors);
    this.highlightValues = this.connectors === null ? null : this.markEnds(this.connectors);
    this.movable = new MovableGrid<number>(this.endValues, { row: START_ROW });
  }

  /**
   * Resolves the layer's selectors to one connector per category.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns The chart's own elements, one per category, or null when
   *   unresolvable
   */
  private resolveConnectors(
    selectors?: MaidrLayer['selectors'],
  ): SVGElement[] | null {
    if (typeof selectors !== 'string' && !Array.isArray(selectors)) {
      return null;
    }

    // Resolved live, and nothing is made until the count fits. A copy is
    // inserted beside its original the moment it is made, so declining after
    // copying left every copy in the chart for `dispose()` never to reach --
    // and the next resolution matched the copies too.
    const live = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors, false)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one, false));

    return live.length === this.points.length ? live : null;
  }

  /**
   * Marks each end of every pair on its own, where the chart draws it.
   *
   * A chart draws one connector per pair rather than an element per dot, and
   * outlined whole, the connector showed the same mark at both ends: the
   * reader moved from one end to the other, heard the other value, and the
   * highlight held still. Each end is marked with a dot where its value is
   * drawn on the connector instead (see {@link endsOn}).
   *
   * A connector whose ends cannot be placed is outlined whole at both ends,
   * as every connector was before.
   *
   * Every connector is measured, and its paint read, before anything is
   * inserted, for the reason given on `Svg.createCircleElements`.
   *
   * @param connectors - The chart's own connector for each category
   * @returns Elements shaped ends x categories
   */
  private markEnds(connectors: SVGElement[]): SVGElement[][] {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const placed = connectors.map((connector, col) => {
      const values = { start: this.endValues[0][col], end: this.endValues[1][col] };
      const ends = endsOn(connector, values, isHorizontal);
      return ends === null ? null : { ends, paint: Svg.markerPaintOf(connector) };
    });

    const rows: SVGElement[][] = ENDS.map(() => []);
    connectors.forEach((connector, col) => {
      const place = placed[col];
      if (place === null) {
        const copy = Svg.cloneHidden(connector);
        rows.forEach((row) => {
          row[col] = copy;
        });
        return;
      }
      const centres = ENDS.map(end => ({ cx: place.ends[end].x, cy: place.ends[end].y }));
      const markers = Svg.createCircleElements(centres, connector, place.paint);
      markers.forEach((marker, row) => {
        this.connectorMarkedBy.set(marker, connector);
        rows[row][col] = marker;
      });
    });
    return rows;
  }

  /**
   * The connector an end's marker stands for, so that high contrast paints
   * the connector as a mark: the markers are no copies of it, and the pairing
   * of a copy with the element before it finds none.
   *
   * @param marker - A marker in this trace's highlight values
   * @returns The connector, or null for anything else
   */
  protected override originalMarkedBy(marker: SVGElement): SVGElement | null {
    return this.connectorMarkedBy.get(marker) ?? null;
  }

  protected get values(): number[][] {
    return this.endValues;
  }

  /**
   * The pair under the cursor, whichever end is being read. `points` is a
   * flat list, which the inherited reading -- built for one list per row --
   * cannot index, and a trace that answers no x is offered rotor compare
   * modes that then do nothing and cannot keep the reader's category across
   * a layer switch.
   *
   * @returns The current pair's x
   */
  public override getCurrentXValue(): XValue | null {
    return this.points[this.col]?.x ?? null;
  }

  public override moveToXValue(xValue: XValue): boolean {
    const index = this.points.findIndex(point => point.x === xValue);
    return index !== -1 && this.moveToIndex(this.row, index);
  }

  public override moveToNextCompareValue(
    direction: 'left' | 'right',
    type: 'lower' | 'higher',
  ): boolean {
    return this.compareSearchAlongRow(this.endValues[this.row] ?? [], direction, type);
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
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
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
        // categories running down the page rather than across it. The counts
        // swap with the indices. Swapping the indices alone read an end
        // against the number of categories, so on a chart of four countries
        // both ends sounded left of centre, the start hard left.
        x: isHorizontal ? this.row : this.col,
        y: isHorizontal ? this.col : this.row,
        rows: isHorizontal ? this.points.length : ENDS.length,
        cols: isHorizontal ? ENDS.length : this.points.length,
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

  /**
   * What each end of the pair is called.
   *
   * The producer's names where it gave any, and the generic words otherwise --
   * resolved on each read rather than at construction, because the generic
   * words are translated and the trace outlives a language change.
   *
   * @returns A label for each end
   */
  private get endLabels(): Record<End, string> {
    return {
      start: this.authoredEndLabels.start ?? t('model.dumbbellStart'),
      end: this.authoredEndLabels.end ?? t('model.dumbbellEnd'),
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
        label: t(
          change > 0
            ? 'model.asideIncrease'
            : change < 0 ? 'model.asideDecrease' : 'model.asideChange',
        ),
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
    // Read off the measured ends rather than off `this.min`/`this.max`, which
    // are seeded from the first value and never lose a comparison to a NaN --
    // so one unparseable end at the head of the list made the whole chart's
    // range non-finite, and the dialog blanks a NaN, leaving two labels with
    // nothing after them. The shape {@link AbstractBarPlot.rangeStats} reports
    // a range in, and the word the announcements already use for an absent
    // value.
    const ends = this.endValues.flat().filter(isMeasured);
    const chartMin = MathUtil.safeMin(ends);
    const chartMax = MathUtil.safeMax(ends);
    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfPairs'), value: this.points.length },
      { label: t('model.statMinValue'), value: isMeasured(chartMin) ? chartMin : missingText() },
      { label: t('model.statMaxValue'), value: isMeasured(chartMax) ? chartMax : missingText() },
    ];

    // The count each way is what a sighted reader takes from the shape of the
    // chart before reading a single number, and it is not recoverable from the
    // ranges above.
    //
    // Unconditional, and with the rows that held still named. Guarded on
    // something having moved, the one chart whose finding *is* that nothing
    // moved was the one that said nothing about direction at all -- and with
    // the flat rows unaccounted for the counts do not add up to the number of
    // pairs, leaving a reader to guess whether the missing rows held still or
    // were dropped. `text` already treats no change as its own third case.
    const rises = this.changes.filter(change => change > 0).length;
    const falls = this.changes.filter(change => change < 0).length;
    const flat = this.changes.filter(change => change === 0).length;
    stats.push(
      { label: t('model.statIncreased'), value: rises },
      { label: t('model.statDecreased'), value: falls },
    );
    if (flat > 0) {
      stats.push({ label: t('model.statUnchanged'), value: flat });
    }

    // The rows whose change cannot be computed at all, which is the fourth
    // case the three counts above partition the chart into and the one they
    // cannot express: a pair with an unreadable end is neither a rise, a fall
    // nor a row that held still, so without it the arithmetic the counts
    // invite still comes up short of `Number of pairs`. Silent on a complete
    // chart, the way `LineTrace` is about its gaps.
    const unmeasured = this.changes.length - rises - falls - flat;
    if (unmeasured > 0) {
      stats.push({ label: t('model.statMissingValues'), value: unmeasured });
    }

    const largest = this.extremeChange('max');
    const smallest = this.extremeChange('min');
    if (largest !== null) {
      stats.push({
        label: rankLabel('max', largest.change),
        // Formatted here rather than left to the dialog, which rounds a stat
        // whose value is a number and passes a composed string through
        // untouched -- so a change of 0.004567 read two ways in one modal.
        value: t('model.nameWithValue', {
          name: this.points[largest.index].x,
          value: defaultFormat(Math.abs(largest.change)),
        }),
      });
    }
    if (smallest !== null && smallest.index !== largest?.index) {
      stats.push({
        label: rankLabel('min', smallest.change),
        value: t('model.nameWithValue', {
          name: this.points[smallest.index].x,
          value: defaultFormat(Math.abs(smallest.change)),
        }),
      });
    }

    const headers = [
      // The category axis, not x. A dumbbell is commonly drawn with its
      // categories running down the page, which puts them on y -- and this
      // column holds category names, so a horizontal chart headed a column of
      // countries with the label its life expectancies belong to. The same
      // swap `text` makes, for the same reason.
      this.orientation === Orientation.HORIZONTAL ? this.yAxis : this.xAxis,
      this.endLabels.start,
      this.endLabels.end,
      t('model.tableChange'),
    ];
    const rows: (string | number)[][] = this.points.map((point, index) => [
      point.x,
      // Coerced, as every other reading of the two ends in this class is: a
      // producer sending a number as a string reaches the dialog's rounding
      // as a string and is printed verbatim, so the table would show
      // `74.60000000000001` in the cell the announcement speaks as `74.6` --
      // beside a Change column that is already noise-stripped.
      Number(point.start),
      Number(point.end),
      this.changes[index],
    ]);

    // The category column sits on whichever axis carries the names, the same
    // swap the headers above make, and both ends on the value axis. `Change`
    // is a subtraction the chart draws on neither, so it keeps the dialog's
    // own rounding.
    const valueAxis: AxisType = this.orientation === Orientation.HORIZONTAL ? 'x' : 'y';
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = [
      this.orientation === Orientation.HORIZONTAL ? 'y' : 'x',
      valueAxis,
      valueAxis,
      undefined,
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
   * Returns the row whose change is furthest in one direction.
   *
   * Ranked over the measured rows only, as {@link WaterfallTrace} ranks its
   * steps. The reduce seeds from the first row and a NaN loses no comparison,
   * so a single unreadable end at the head of the list won both ends of the
   * ranking at once -- naming that row as the chart's biggest mover and its
   * change as the literal text `NaN`, which neither the dialog's blanking nor
   * the extrema menu's `toFixed` can catch, because both of them test numbers.
   *
   * @param kind - Whether to take the most positive or the most negative
   * @returns The row and its change, or null when no row has a change to rank
   */
  private extremeChange(
    kind: 'max' | 'min',
  ): { index: number; change: number } | null {
    const measured = this.changes
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => isMeasured(change));
    if (measured.length === 0) {
      return null;
    }

    return measured.reduce((best, candidate) =>
      (kind === 'max'
        ? candidate.change > best.change
        : candidate.change < best.change)
        ? candidate
        : best,
    );
  }

  /**
   * Offers the chart's largest and smallest values as extrema targets, at
   * whichever end of whichever pair holds them.
   *
   * `]` is Go to Maximum Value and `[` Go to Minimum Value on every chart. A
   * dumbbell used to rank its rows by change instead, so `]` landed on the
   * finishing end of the largest rise and announced it like any other value:
   * on a chart of life expectancies, Korea's 83.5 for the maximum while
   * Japan's 84.6, the description's `Max value`, was higher. On a chart where
   * every row rose, `[` went to the smallest rise, which can be the highest
   * value on the chart. The largest rise and fall are still named in the
   * description.
   *
   * Every end holding the value is a target, in the order the categories are
   * drawn, so a value several ends share is walked by pressing again.
   *
   * @returns The ends holding the largest value, then those holding the
   *   smallest, when the chart has a value at all
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const ends = this.points
      .flatMap((_point, col) => ENDS.map((_end, row) => ({
        value: this.endValues[row][col],
        row,
        col,
      })))
      .filter(({ value }) => isMeasured(value));
    if (ends.length === 0) {
      return [];
    }

    const values = ends.map(({ value }) => value);
    const highest = MathUtil.safeMax(values);
    const lowest = MathUtil.safeMin(values);
    const targetAt = (
      { value, row, col }: { value: number; row: number; col: number },
      type: 'max' | 'min',
    ): ExtremaTarget => ({
      ...extremumAt(
        t(type === 'max' ? 'model.extremaMaxPoint' : 'model.extremaMinPoint'),
        this.points[col].x,
        this.endLabels[ENDS[row]],
      ),
      value,
      pointIndex: col,
      segment: ENDS[row],
      type,
      groupIndex: row,
      categoryIndex: col,
      navigationType: 'group',
      xValue: this.points[col].x,
    });

    const span = this.valueSpan;
    const targets = ends
      .filter(({ value }) => MathUtil.nearlyEqualInRange(value, highest, span))
      .map(end => targetAt(end, 'max'));
    // A chart whose ends all hold one value has a single extreme. Naming the
    // same ends as both would report a spread the chart does not have.
    if (lowest !== highest) {
      targets.push(...ends
        .filter(({ value }) => MathUtil.nearlyEqualInRange(value, lowest, span))
        .map(end => targetAt(end, 'min')));
    }
    return targets;
  }

  /**
   * Moves the cursor to a chosen extrema target, on the end holding it.
   *
   * @param target - The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    this.row = target.groupIndex ?? ENDS.indexOf('end');
    this.col = target.categoryIndex ?? target.pointIndex;
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
   * Measured against the connector itself rather than the marker of either
   * end, so a pointer anywhere along it is on the pair.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The nearest category, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.connectors;
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
