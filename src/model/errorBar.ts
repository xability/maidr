import type { ExtremaTarget } from '@type/extrema';
import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace, named } from './abstract';
import { MovableGrid } from './movable';

/**
 * The three magnitudes an interval chart draws at one sample, bottom to top.
 *
 * Ordered rather than alphabetical: moving up the grid moves up the value
 * axis, so the cursor's direction matches the chart's.
 */
const SECTIONS = ['lower', 'value', 'upper'] as const;

type Section = (typeof SECTIONS)[number];

/**
 * How each section is announced.
 *
 * Lower case deliberately: the text service announces a section ahead of the
 * axis label when the state carries a section and no `z`, which an error bar
 * does, and that branch lower-cases the section first. Capitalising these
 * would therefore be silently undone in verbose mode and kept in terse mode,
 * so the same bound would read two different ways.
 */
const SECTION_LABEL: Record<Section, string> = {
  lower: 'lower bound',
  value: 'value',
  upper: 'upper bound',
};

/**
 * Reads one section's magnitude off a point.
 *
 * @param point - The point to read
 * @param section - Which of the three magnitudes to take
 * @returns The magnitude, or NaN when the chart draws no such bound here
 */
function magnitudeOf(point: ErrorBarPoint, section: Section): number {
  switch (section) {
    case 'lower':
      return point.yMin ?? Number.NaN;
    case 'upper':
      return point.yMax ?? Number.NaN;
    default:
      return point.y;
  }
}

/**
 * Whether a magnitude is one the chart actually drew.
 *
 * A missing bound travels as `NaN`, and `NaN` spreads: letting one into a
 * range would hand the whole trace a `NaN` pitch scale.
 *
 * @param value - A magnitude read off a point
 * @returns True when the value is real
 */
function isMeasured(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Strips binary floating-point noise from a subtracted magnitude.
 *
 * The interval width is derived, not authored: `4.6 - 3.8` is
 * `0.30000000000000071` in IEEE 754, and announcing that to a screen reader
 * spells out sixteen digits of an artifact the chart does not contain.
 *
 * Twelve significant figures rather than a fixed number of decimals, because
 * the decimals a chart needs depend on its scale — rounding to two would
 * report an interval of 0.003 as zero, which is worse than the noise.
 *
 * @param value - A magnitude obtained by subtraction
 * @returns The same magnitude without the trailing artifact
 */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Normalises either accepted data shape into one series per group.
 *
 * `error_bar` took a flat `ErrorBarPoint[]` before groups existed, and still
 * does — a single-series chart is the common case and must not be made to
 * wrap itself in an array to keep working. A flat payload becomes the one
 * group it is.
 *
 * An empty payload becomes one empty group rather than no groups, so a layer
 * with no data keeps the single-row grid it had, instead of a grid with no
 * rows for the cursor to be on.
 *
 * @param data - The layer's data, grouped or not
 * @returns One entry per group
 */
function toGroups(
  data: ErrorBarPoint[] | ErrorBarPoint[][],
): ErrorBarPoint[][] {
  if (!Array.isArray(data) || data.length === 0) {
    return [[]];
  }
  return Array.isArray(data[0])
    ? (data as ErrorBarPoint[][])
    : [data as ErrorBarPoint[]];
}

/**
 * Trace implementation for charts that draw an estimate together with the
 * interval around it — error bars, confidence intervals, point ranges.
 *
 * Uncertainty is not decoration in a statistical graphic; it is frequently
 * the finding. Whether two group means differ is answered by whether their
 * intervals overlap, and until this trace existed that was the one thing a
 * MAIDR reader could not hear: the estimate was announced and the interval
 * was dropped, so the comparison the chart was drawn to support could not be
 * made at all.
 *
 * Navigation follows {@link Candlestick}: the sections are the grid's rows
 * and the samples its columns, so moving up and down at one x walks the
 * bound, the estimate and the other bound, while left and right walk the
 * samples. That is what lets a reader trace one interval rather than
 * reconstructing it from three separate passes over the chart.
 *
 * Which sections exist is decided by the data. A layer whose points carry no
 * `yMin` gets no lower row at all rather than a row of silence — an empty
 * lane the cursor can enter and hear nothing in reads as a broken chart, not
 * as an absent bound.
 */
export class ErrorBarTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  /**
   * Protected so a subclass can read a point's own fields. The forest plot
   * needs each study's weight and whether it is the pooled row, neither of
   * which is a section magnitude.
   */
  protected readonly points: ErrorBarPoint[];
  /**
   * The samples, split by group.
   *
   * One entry for an ungrouped chart, in which case it holds exactly
   * {@link ErrorBarTrace.points}. `points` stays the flattened list so a
   * subclass reading its own fields, and the selector count, both go on
   * meaning what they meant before groups existed (#942).
   */
  private readonly groups: ErrorBarPoint[][];
  private readonly sections: readonly Section[];
  private readonly sectionValues: number[][];
  private readonly orientation: Orientation;

  private readonly min: number;
  private readonly max: number;
  private readonly perRowMin: number[];
  private readonly perRowMax: number[];

  /** Row the estimate lives on — the entry row, and the pointer's target. */
  private readonly valueRow: number;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new error bar trace.
   *
   * @param layer - The MAIDR layer carrying the interval data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.groups = toGroups(layer.data as ErrorBarPoint[] | ErrorBarPoint[][]);
    this.points = this.groups.flat();
    this.orientation = layer.orientation ?? Orientation.VERTICAL;
    this.sections = SECTIONS.filter(section =>
      section === 'value'
      || this.points.some(point => isMeasured(magnitudeOf(point, section))),
    );

    // Rows run group-major: each group's sections are contiguous and in
    // bottom-to-top order, then the next group's. That ordering is what makes
    // the chart's own question answerable by ear -- pressing up at one
    // category walks this group's lower, value and upper and then the next
    // group's, so a reader hears directly whether one interval clears the
    // other. Interleaving by section instead (every group's lower, then every
    // group's value) would put the two ends of one interval three moves apart
    // and answer nothing.
    //
    // Crossing from a group's upper bound to the next group's lower bound is
    // a step down in value, which the shared pitch scale renders honestly as
    // a drop. The announcement names the group on every move, so the drop is
    // heard as arriving somewhere else rather than as the data falling.
    this.sectionValues = this.groups.flatMap(group =>
      this.sections.map(section =>
        group.map(point => magnitudeOf(point, section)),
      ),
    );

    const measured = this.sectionValues.flat().filter(isMeasured);
    const { min, max } = MathUtil.minMax(measured);
    this.min = min;
    this.max = max;
    this.perRowMin = this.sectionValues.map(row =>
      MathUtil.safeMin(row.filter(isMeasured)),
    );
    this.perRowMax = this.sectionValues.map(row =>
      MathUtil.safeMax(row.filter(isMeasured)),
    );

    this.valueRow = Math.max(0, this.sections.indexOf('value'));
    this.highlightValues = this.mapToSvgElements(layer.selectors);
    // Enter on the estimate, not on whichever section happens to be last.
    // A reader arriving at a sample is asking what the value is; landing them
    // on the upper bound answers a question they have not asked yet, and does
    // it with a number that looks like the value until they move.
    this.movable = new MovableGrid<number>(this.sectionValues, {
      row: this.valueRow,
    });
  }

  /**
   * Resolves the layer's selectors to one element per sample, repeated across
   * the sections.
   *
   * A chart draws one whip per sample, not one element per bound, so every
   * section of a column highlights the same element. Announcing a move
   * between bounds while the highlight sits still is the honest rendering of
   * that — the alternative is inventing three elements the chart never drew.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped sections x samples, or null when unresolvable
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
    // One whip per point, and the flat list runs in the same group-major
    // order the rows do -- so each group's rows take that group's slice, and
    // every section within a group highlights the same whips. Handing every
    // row the whole list would light a second group's whips while the cursor
    // was in the first.
    let taken = 0;
    return this.groups.flatMap((group) => {
      const slice = flat.slice(taken, taken + group.length);
      taken += group.length;
      return this.sections.map(() => slice);
    });
  }

  protected get values(): number[][] {
    return this.sectionValues;
  }

  protected get dimension(): Dimension {
    // Orientation-independent, matching `Candlestick.dimension`: up and down
    // walk the sections and left and right walk the samples in BOTH
    // orientations, so rows must always be the section count -- times the
    // group count, since each group contributes its own sections.
    // `AutoplayState` is keyed by direction, so conditioning this on
    // orientation mis-paces autoplay and mis-clamps the `isMovable` bounds.
    //
    // Columns come from the current row rather than from the whole point
    // count, which is the same rule `LineTrace.dimension` follows: with
    // groups the flattened total is groups times samples, and using it would
    // let the cursor walk off the end of every row.
    return {
      rows: this.sectionValues.length,
      cols: this.sectionValues[this.row]?.length ?? 0,
    };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        // One scale across every section, not per row: the bounds and the
        // estimate are the same quantity on the same axis, so a bound has to
        // sound higher than the estimate it sits above. Per-row scaling would
        // put them at the same pitch and erase the interval by ear.
        min: this.min,
        max: this.max,
        raw: this.sectionValues[this.row][this.col],
      },
      panning: {
        // The grid stays sections-by-samples whichever way the chart is
        // drawn, so panning has to swap here instead: stereo position tracks
        // where a point sits on screen, and on a horizontal chart the samples
        // run down the page rather than across it.
        x: this.orientation === Orientation.HORIZONTAL ? this.row : this.col,
        y: this.orientation === Orientation.HORIZONTAL ? this.col : this.row,
        rows: this.sectionValues.length,
        cols: this.sectionValues[this.row]?.length ?? 0,
      },
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.sectionValues,
      min: this.perRowMin,
      max: this.perRowMax,
      row: this.row,
      col: this.col,
    };
  }

  /** Which group a grid row belongs to. */
  private groupOf(row: number): number {
    return Math.floor(row / this.sections.length);
  }

  /** Which of the three magnitudes a grid row reads. */
  private sectionOf(row: number): Section {
    return this.sections[row % this.sections.length];
  }

  /**
   * Label and name of the group the cursor is in, or `undefined`.
   *
   * Undefined on a chart that draws one group, and on one whose producer
   * named no groups: a single unnamed series has nothing to disambiguate, and
   * announcing "Group is Error bar 1" on every move would be noise in place
   * of a reading. The same rule {@link LineTrace} applies to its series.
   */
  private get currentGroup(): { label: string; value: string } | undefined {
    if (this.groups.length < 2) {
      return undefined;
    }
    const authored = this.groups[this.groupOf(this.row)]?.[0]?.z;
    if (authored === undefined || authored === null || authored === '') {
      return undefined;
    }
    return { label: named(this.layer.axes?.z?.label, 'Group'), value: String(authored) };
  }

  protected get text(): TextState {
    const point = this.groups[this.groupOf(this.row)]?.[this.col];
    const section = this.sectionOf(this.row);
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const group = this.currentGroup;

    if (point === undefined) {
      return {
        main: { label: isHorizontal ? this.yAxis : this.xAxis, value: '' },
        cross: { label: isHorizontal ? this.xAxis : this.yAxis, value: '' },
        section: SECTION_LABEL[section],
        mainAxis: isHorizontal ? 'y' : 'x',
        crossAxis: isHorizontal ? 'x' : 'y',
      };
    }

    return {
      main: { label: isHorizontal ? this.yAxis : this.xAxis, value: point.x },
      cross: {
        label: isHorizontal ? this.xAxis : this.yAxis,
        value: this.sectionValues[this.row][this.col],
      },
      // The same field the box plot and the candlestick use to say which of a
      // point's several magnitudes is being read. Without it "3.8" and "4.6"
      // at one x are indistinguishable from two samples.
      section: SECTION_LABEL[section],
      // Which real axis each value came from, so the formatter service picks
      // the right per-axis format. It defaults to x/y when absent, which is
      // silently wrong for a horizontal layer whose two axes format
      // differently — a currency estimate would be announced as a bare
      // number, and the category as currency.
      mainAxis: isHorizontal ? 'y' : 'x',
      crossAxis: isHorizontal ? 'x' : 'y',
      // Which group this estimate belongs to, on a chart that draws more than
      // one. Without it the two intervals at one category are two readings of
      // the same name, and a reader has only emission order to tell them
      // apart -- which nothing states (#942).
      ...(group !== undefined && { z: group }),
    };
  }

  public get description(): DescriptionState {
    const widths = this.points
      .map(point => Number(point.yMax) - Number(point.yMin))
      .filter(isMeasured)
      .map(withoutFloatNoise);

    const stats: DescriptionState['stats'] = [
      { label: 'Number of points', value: this.points.length },
      { label: 'Min value', value: this.min },
      { label: 'Max value', value: this.max },
    ];

    if (widths.length > 0) {
      // The width of the interval is what a reader is judging when they ask
      // whether two estimates differ, and it is not recoverable from the
      // per-section ranges above: those describe the bounds across the whole
      // chart, not the spread at any one sample.
      stats.push(
        { label: 'Narrowest interval', value: Math.min(...widths) },
        { label: 'Widest interval', value: Math.max(...widths) },
      );
    }

    // A grouped chart repeats every category once per group, so without a
    // column naming the group the table has two rows headed "a" that differ
    // only in their numbers -- the same loss the announcement would have,
    // written down. Added only when there is more than one group, so an
    // ungrouped chart's table keeps the four columns it had.
    const grouped = this.groups.length > 1;
    const groupLabel = named(this.layer.axes?.z?.label, 'Group');

    if (grouped) {
      stats.splice(1, 0, {
        label: 'Number of groups',
        value: this.groups.length,
      });
    }

    const headers = grouped
      ? [groupLabel, this.xAxis, this.yAxis, 'Lower', 'Upper']
      : [this.xAxis, this.yAxis, 'Lower', 'Upper'];
    const rows: (string | number)[][] = this.groups.flatMap((group, index) =>
      group.map((point) => {
        const cells: (string | number)[] = [
          point.x,
          point.y,
          point.yMin ?? '',
          point.yMax ?? '',
        ];
        return grouped
          ? [point.z ?? `Group ${index + 1}`, ...cells]
          : cells;
      }),
    );

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * Offers the highest and lowest estimate as extrema targets.
   *
   * The estimates are what a reader compares across samples, so they are what
   * "go to the extreme" should mean here. The bounds are deliberately not
   * ranked: the widest interval is a different question from the largest
   * value, and offering both under one menu would leave the reader unable to
   * tell which sense of "extreme" they had just jumped to.
   *
   * Both targets land on the estimate row, so a reader arriving there hears
   * the value and can step up or down into its interval — the same motion the
   * trace exists for.
   *
   * @returns The maximum and minimum estimate, when any sample carries one
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const estimates = this.sectionValues[this.valueRow];
    const measured = estimates
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => isMeasured(value));

    if (measured.length === 0) {
      return [];
    }

    const highest = measured.reduce((a, b) => (b.value > a.value ? b : a));
    const lowest = measured.reduce((a, b) => (b.value < a.value ? b : a));

    const targets: ExtremaTarget[] = [{
      label: `Max value at ${this.points[highest.index].x}`,
      value: highest.value,
      pointIndex: highest.index,
      segment: 'value',
      type: 'max',
      navigationType: 'point',
      xValue: this.points[highest.index].x,
    }];

    // One sample, or a chart where every estimate is equal, has a single
    // extreme. Naming the same sample as both would report a spread the chart
    // does not have.
    if (lowest.index !== highest.index) {
      targets.push({
        label: `Min value at ${this.points[lowest.index].x}`,
        value: lowest.value,
        pointIndex: lowest.index,
        segment: 'value',
        type: 'min',
        navigationType: 'point',
        xValue: this.points[lowest.index].x,
      });
    }

    return targets;
  }

  /**
   * Moves the cursor to a chosen extrema target, on the estimate row.
   *
   * @param target - The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    this.row = this.valueRow;
    this.col = target.pointIndex;
    this.finalizeNavigation();
  }

  /**
   * Finds the sample whose drawn element is nearest a pointer position.
   *
   * Resolves to the estimate's row rather than to whichever bound happens to
   * be closest: a pointer lands on the whip as a whole, and the estimate is
   * the magnitude a reader arriving there is asking for.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The nearest sample, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues?.[0];
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
        nearest = { element: elements[col], row: this.valueRow, col, centerX, centerY };
      }
    }

    return nearest;
  }
}
