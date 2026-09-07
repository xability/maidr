import type { FormatFunction, GanttData, GanttPoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { defaultFormat, FormatUtil } from '@util/format';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { watchViewport } from '@util/viewport';
import { AbstractTrace, MAX_DESCRIPTION_TABLE_ROWS } from './abstract';
import { isMeasured, MISSING_TEXT } from './bar';
import { MovableGrid } from './movable';

/**
 * Strips binary floating-point noise from a subtracted magnitude.
 *
 * A length is derived rather than authored, so `2.3 - 1.1` announces as
 * `1.2000000000000002` unless it is cleaned up. Twelve significant figures for
 * the reason {@link DumbbellTrace} uses them: a fixed number of decimals is
 * wrong at some scale, and a schedule measured in fractions of a day is one of
 * the scales it is wrong at.
 *
 * @param value - A magnitude obtained by subtraction
 * @returns The same magnitude without the trailing artifact
 */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * The length one interval covers.
 *
 * @param point - The interval to measure
 * @returns Its length along the axis
 */
function lengthOf(point: GanttPoint): number {
  return withoutFloatNoise(Number(point.end) - Number(point.start));
}

/**
 * Trace implementation for gantt charts, timelines and swimlane diagrams.
 *
 * This is the chart type where the gap between a sighted reader and a MAIDR
 * user is widest, because it is the one with no workable fallback. Most
 * unsupported charts degrade to a table or a sentence; a schedule does not.
 * What a reader wants from one is relational -- what overlaps what, what
 * blocks what, where the slack is -- and those facts grow with the square of
 * the task count, so prose stops being viable almost immediately.
 *
 * Structurally an interval is not a bar. A bar has one number and a baseline,
 * and its height is a magnitude a reader can hear directly. An interval has
 * two numbers and no baseline: its length is a *difference*, which is audible
 * only if something computes it, and its position is a second fact that a
 * single pitch cannot also carry.
 *
 * So the two are split across two channels. Pitch carries the length, which is
 * the magnitude the chart is drawn to compare. Stereo position carries the
 * start, mapped along the whole axis rather than by column index, so a lane
 * whose work happens late sounds late -- and two lanes whose intervals line up
 * sound like they line up, which is the overlap question answered by ear.
 */
export class GanttTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly lanes: GanttPoint[][];
  private readonly lengths: number[][];
  private readonly unit?: string;
  private readonly laneNames: (string | number)[];
  private readonly orientation: Orientation;

  /** The axis extent, taken from the intervals rather than from the layer. */
  private readonly axisMin: number;
  private readonly axisSpan: number;

  private readonly min: number;
  private readonly max: number;
  private readonly perLaneMin: number[];
  private readonly perLaneMax: number[];

  /**
   * How the chart renders a point on its time axis, when it says.
   *
   * Undefined rather than {@link defaultFormat} when the layer authors no
   * format, so a schedule measured in plain numbers hands the dialog numbers
   * and has them rounded like every other number it shows.
   */
  private readonly timeFormat?: FormatFunction;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Where each interval was last measured, or null before the reader points
   * at the schedule.
   *
   * Measured on the first hover rather than in the constructor: a schedule of
   * a couple of thousand tasks would otherwise pay a layout read per task at
   * load, for a chart the reader may never point at.
   */
  private highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null = null;

  /**
   * Whether the centres have to be measured again before the next hover.
   *
   * They hold viewport coordinates, and the pointer positions they are
   * compared against are always current -- so a page, or a container the
   * chart sits in, scrolling underneath leaves every centre off by however
   * far the schedule moved, and a hover resolves to a task that is no longer
   * there. True to begin with, which is what makes the first hover measure.
   */
  private highlightCentersDirty = true;

  private readonly stopViewportWatch = watchViewport((): void => {
    this.highlightCentersDirty = true;
  });

  /**
   * Creates a new gantt trace.
   *
   * @param layer - The MAIDR layer carrying the interval data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as GanttData;
    this.lanes = data.points;
    this.unit = data.unit?.trim() || undefined;
    this.laneNames = data.lanes ?? [];
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.lengths = this.lanes.map(lane => lane.map(lengthOf));

    const starts = this.lanes.flat().map(point => Number(point.start));
    const ends = this.lanes.flat().map(point => Number(point.end));
    const extent = MathUtil.minMax([...starts, ...ends]);
    this.axisMin = extent.min;
    // Zero rather than the difference when a chart occupies a single instant,
    // so the division that follows is guarded at its one source instead of at
    // every use.
    this.axisSpan = extent.max > extent.min ? extent.max - extent.min : 0;

    const bounds = MathUtil.minMax(this.lengths.flat());
    this.min = bounds.min;
    this.max = bounds.max;
    this.perLaneMin = this.lengths.map(lane => MathUtil.safeMin(lane));
    this.perLaneMax = this.lengths.map(lane => MathUtil.safeMax(lane));

    // The axis the intervals are measured along -- x for a schedule drawn the
    // ordinary way round, y for one drawn the default way up -- resolved once
    // rather than per cell, because a `format.function` body is compiled with
    // `new Function` and the table asks for it twice an interval.
    const timeAxis = this.orientation === Orientation.HORIZONTAL
      ? layer.axes?.x
      : layer.axes?.y;
    this.timeFormat = timeAxis?.format === undefined
      ? undefined
      : FormatUtil.wrapFormat(FormatUtil.resolveFormat(timeAxis.format));

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<number>(this.lengths);
  }

  /**
   * A position on the time axis, as the chart itself renders it.
   *
   * The dialog resolves no per-axis format of its own, so a date-based
   * schedule described the epoch counts its axis carries while navigation
   * spoke the dates the same numbers stand for -- two readings of one interval
   * sharing no digits. The google-charts binder is the case that exists: it
   * divides its dates down to days and hands the same numbers back as dates
   * through the axis format.
   *
   * @param value - A position on the time axis
   * @returns The chart's own rendering of it, or the number itself when the
   *   layer authors no format
   */
  private atTime(value: number): string | number {
    return this.timeFormat === undefined ? value : this.timeFormat(value);
  }

  /**
   * The same position, as display text.
   *
   * {@link atTime} hands back a bare number when the layer authors no format,
   * which is what a table cell wants -- the description service rounds one on
   * the way out. A statistic that composes the position into a sentence never
   * reaches that rounding, because the service rounds numbers and this is a
   * string by the time it sees it, so the raw axis coordinate would be spelled
   * out in full under a label whose neighbours are all rounded.
   *
   * @param value - A position on the time axis
   * @returns The chart's own rendering of it, or the rounded number
   */
  private atTimeText(value: number): string {
    return this.timeFormat?.(value) ?? defaultFormat(value);
  }

  /**
   * Resolves the layer's selectors to one element per interval.
   *
   * Withdrawn unless the count matches exactly. A schedule is the chart most
   * likely to hold a lane the producer drew differently -- a milestone with no
   * length, a bar hidden behind a label -- and a selector list that has
   * slipped by one highlights the wrong task for the rest of the row, which
   * is worse for a sighted-with-low-vision reader than no highlight at all.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns Elements shaped lanes x intervals, or null when unresolvable
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
    const live = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors, false)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one, false));

    if (live.length !== this.lanes.flat().length) {
      return null;
    }
    const flat = live.map(element => Svg.cloneHidden(element));

    let taken = 0;
    return this.lanes.map(lane => flat.slice(taken, taken += lane.length));
  }

  protected get values(): number[][] {
    return this.lengths;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.lanes.length,
      cols: this.lanes.reduce((widest, lane) => Math.max(widest, lane.length), 0),
    };
  }

  protected get audio(): AudioState {
    const point = this.lanes[this.row]?.[this.col];

    return {
      freq: {
        // One scale across every lane, not per lane: the comparison a reader
        // wants is between tasks, and scaling each lane to its own range would
        // make a two-day task in an empty lane sound like a six-month one.
        min: this.min,
        max: this.max,
        // An empty lane has no length to pitch. `NaN` is how this codebase
        // already says "the point exists to navigate to, it just has no
        // value" -- `AudioService` sounds it the way an out-of-bounds move
        // sounds, and the text layer announces it as missing. Reaching for a
        // number here instead would put a length on a lane that holds none.
        raw: this.lengths[this.row]?.[this.col] ?? Number.NaN,
      },
      // `AudioService` reads the pan as `interpolate(x, 0, cols - 1, -1, 1)`,
      // so `cols: 2` makes the mapping `2x - 1` and a fraction of the axis
      // lands the pan directly. The same arithmetic {@link PieTrace} and
      // {@link RadarTrace} use, and the reason none of them needs a state
      // field to express a position that is not a column index.
      //
      // A column index would be actively misleading here in a way it is not
      // for a bar chart: the third interval of one lane and the third of
      // another are unrelated in time, so panning by index would place two
      // tasks months apart at the same point in the stereo field and two
      // simultaneous tasks at different ones -- erasing the overlap the chart
      // exists to show.
      panning: {
        x: this.axisSpan === 0
          ? 0.5
          : (Number(point?.start ?? this.axisMin) - this.axisMin) / this.axisSpan,
        y: this.row,
        rows: this.lanes.length,
        cols: 2,
      },
      group: this.row,
    };
  }

  /**
   * What a lane is called.
   *
   * Prefers the lane's own intervals, which every populated lane carries in
   * `x`, and falls back to the declared {@link GanttData.lanes} -- so a
   * producer supplying both cannot make them disagree about a lane that names
   * itself. A lane that is empty *and* undeclared is named positionally,
   * because a row a reader can navigate onto has to be identifiable even when
   * the chart said nothing about it.
   *
   * @param row - Which lane
   * @returns Its name
   */
  private laneNameAt(row: number): string | number {
    const own = this.lanes[row]?.[0]?.x;
    if (own !== undefined) {
      return own;
    }
    return this.laneNames[row] ?? `Lane ${row + 1}`;
  }

  protected get braille(): BrailleState {
    // The lengths, one row per lane -- the same magnitude the pitch carries.
    //
    // Not a span encoding drawn along the axis, which is what a display would
    // have to show to convey position: at a typical 40 cells, a year-long
    // schedule gives each cell nine days, so a fortnight's task and a
    // three-week one are the same single dot and two tasks a week apart begin
    // in the same cell. The profile is coarser about *when* and exact about
    // *how long*, and how long is the fact a display can carry honestly.
    return {
      empty: false,
      id: this.id,
      values: this.lengths,
      min: this.perLaneMin,
      max: this.perLaneMax,
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.lanes[this.row]?.[this.col];
    const length = this.lengths[this.row]?.[this.col];
    // A gantt drawn the ordinary way runs its bars left to right, which puts
    // the axis on x and the lanes on y -- the opposite of the default. The
    // grid stays lanes-by-intervals either way, so the swap belongs here
    // rather than in the navigation, exactly as it does for a dumbbell.
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;

    if (point === undefined || length === undefined) {
      // A lane with nothing booked. It is reachable on purpose -- the data
      // shape is nested precisely so such a lane exists -- so it has to
      // announce what it is rather than crash on an index that is not there,
      // and rather than borrow the out-of-bounds cue, which would tell a
      // reader they had left the chart when they have not.
      return {
        main: { label: mainLabel, value: this.laneNameAt(this.row) },
        cross: { label: crossLabel, value: Number.NaN },
        z: { label: 'Intervals', value: 0 },
        mainAxis: isHorizontal ? 'y' : 'x',
        crossAxis: isHorizontal ? 'x' : 'y',
      };
    }

    return {
      // The lane, and the interval's own name when it has one. A lane commonly
      // holds several intervals, and without the name they are distinguished
      // by position alone -- "the second thing in Design" is not what the
      // chart labels it.
      main: {
        label: mainLabel,
        value: point.label ? `${point.x}, ${point.label}` : point.x,
      },
      // Carried for the traces and modes that read a single cross value; the
      // span below replaces it wherever both are present.
      cross: { label: crossLabel, value: Number(point.start) },
      crossRange: { min: Number(point.start), max: Number(point.end) },
      // The length, with the unit the chart named. A bare number cannot say
      // whether a task runs for 40 days or 40 weeks, and the axis format that
      // renders the ends as dates says nothing about the difference between
      // two of them -- so the unit travels with the value rather than through
      // the formatter.
      z: {
        label: 'Length',
        // Rounded before the unit is attached. Attaching it makes the value a
        // string, and a string is the one thing the formatter hands back
        // untouched -- so a length of `1.23456` was spoken in full here and
        // rounded in the description's `Shortest`, `Longest` and Length column,
        // which are the same number under four labels.
        value: this.unit === undefined
          ? length
          : `${defaultFormat(length)} ${this.unit}`,
      },
      // Which real axis each value came from, so the formatter picks the
      // right per-axis format. It defaults to x/y when absent, which for a
      // horizontal schedule means the dates are rendered by the lane axis's
      // formatter and the lane by the date one.
      mainAxis: isHorizontal ? 'y' : 'x',
      crossAxis: isHorizontal ? 'x' : 'y',
    };
  }

  public get description(): DescriptionState {
    const intervals = this.lanes.flat();
    const stats: DescriptionState['stats'] = [
      { label: 'Number of lanes', value: this.lanes.length },
      { label: 'Number of intervals', value: intervals.length },
    ];

    const empty = this.lanes.filter(lane => lane.length === 0).length;
    if (empty > 0) {
      // A lane with nothing in it is a statement about the schedule --
      // nobody is booked, nothing is planned -- and it is the one row a
      // reader can navigate into and hear nothing from, so the count says
      // up front that the silence is the data.
      //
      // Outside the guard below, which is there for the statistics that need
      // an interval to compute: a schedule of nothing but empty lanes is the
      // one this count has the most to say about, and it was the one schedule
      // that never reported it.
      stats.push({ label: 'Empty lanes', value: empty });
    }

    if (intervals.length > 0) {
      const spanLabel = this.unit === undefined ? '' : ` ${this.unit}`;
      // Guarded before the unit is attached rather than after. A length is
      // `Number(end) - Number(start)`, so a producer sending an unparseable
      // end makes it NaN -- and once the unit has turned that into the string
      // `NaN days` neither the dialog's own non-finite blanking nor the
      // service's rounding can catch it, because both of them test numbers.
      const withUnit = (value: number): string =>
        isMeasured(value) ? `${defaultFormat(value)}${spanLabel}` : MISSING_TEXT;

      const from = MathUtil.safeMin(intervals.map(point => Number(point.start)));
      const to = MathUtil.safeMax(intervals.map(point => Number(point.end)));
      stats.push(
        { label: 'Shortest', value: withUnit(this.min) },
        { label: 'Longest', value: withUnit(this.max) },
        {
          label: 'Spans',
          // The chart's own rendering of its two ends when it has one, and
          // `spannedOrMissing` otherwise -- which answers a schedule whose
          // ends do not parse with `missing` rather than with the string
          // `NaN to NaN`, a string the dialog's blanking cannot see.
          value: this.timeFormat !== undefined && isMeasured(from) && isMeasured(to)
            ? `${this.timeFormat(from)} to ${this.timeFormat(to)}`
            : MathUtil.spannedOrMissing(from, to),
        },
      );

      const busiest = this.peakConcurrency();
      if (busiest !== null) {
        // What overlaps what is the question this class opens by saying a
        // schedule is read for, and the description answered none of it.
        // Pitch and pan put an overlap within reach one interval at a time;
        // the busiest moment is the one number that summarises the lot.
        stats.push({
          label: 'Most intervals at once',
          value: `${busiest.count} from ${this.atTimeText(busiest.at)}`,
        });
      }
    }

    // The lane axis rather than x. A schedule drawn the ordinary way runs its
    // bars left to right, which puts the lanes on y -- and this column holds
    // lane names, so a horizontal chart headed a column of tasks with the
    // label its dates belong to. The same swap `text` makes, for its reason
    // -- the announcement and the table name one thing one way.
    const laneLabel = this.orientation === Orientation.HORIZONTAL
      ? this.yAxis
      : this.xAxis;
    // The unit belongs in the header rather than in every cell of the column:
    // a length is the one number here that is unit-bearing by definition, and
    // the announcement never says it without one.
    const lengthHeader = this.unit === undefined ? 'Length' : `Length (${this.unit})`;
    const headers = [laneLabel, 'Label', 'Start', 'End', lengthHeader];
    const allRows: (string | number)[][] = this.lanes.flatMap((lane, index) =>
      // An empty lane is a row of the schedule -- the nested shape exists to
      // express one -- and mapping over the intervals it does not have
      // dropped it from the one place a reader reviews the whole chart at
      // once. Named, with the cells the dialog renders as blanks.
      lane.length === 0
        ? [[this.laneNameAt(index), '', '', '', '']]
        : lane.map((point, column) => [
            point.x,
            point.label ?? '',
            this.atTime(Number(point.start)),
            this.atTime(Number(point.end)),
            this.lengths[index][column],
          ]),
    );

    // Capped, and the cut admitted. This class opens by saying a real schedule
    // carries hundreds to thousands of tasks, and it was the one such trace
    // whose table had no bound at all -- so the dialog built a row per interval
    // and handed the whole thing to the DOM. `LineTrace` and `ScatterTrace`
    // already answer this, and say so in the same words rather than cutting
    // silently.
    const rows = allRows.slice(0, MAX_DESCRIPTION_TABLE_ROWS);
    if (allRows.length > rows.length) {
      stats.push({
        label: 'Table rows',
        value: `first ${rows.length} of ${allRows.length}`,
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * The busiest moment of the schedule, when anything overlaps at all.
   *
   * A sweep over the endpoints rather than a comparison of every interval
   * against every other, which grows with the square of the task count -- the
   * growth this class opens by naming as the reason prose cannot carry a
   * schedule at all.
   *
   * An end is taken before a start at the same instant, so two intervals that
   * merely touch -- the handover a schedule is drawn to show -- are not
   * counted as running together.
   *
   * @returns How many intervals run at once at the fullest moment and when it
   *   begins, or null when nothing overlaps
   */
  private peakConcurrency(): { count: number; at: number } | null {
    const events = this.lanes
      .flat()
      .flatMap((point) => {
        const start = Number(point.start);
        const end = Number(point.end);
        // Both ends or neither: dropping only the unparseable half would
        // leave an interval that opens and never closes, and every moment
        // after it would be counted as overlapping something that ended.
        return isMeasured(start) && isMeasured(end)
          ? [{ at: start, delta: 1 }, { at: end, delta: -1 }]
          : [];
      })
      .sort((a, b) => a.at - b.at || a.delta - b.delta);

    let live = 0;
    let count = 0;
    let at = Number.NaN;
    for (const event of events) {
      live += event.delta;
      if (live > count) {
        count = live;
        at = event.at;
      }
    }

    // One at a time is a schedule with no overlap in it, and reporting that
    // as a finding would answer the question with its trivial case.
    return count > 1 ? { count, at } : null;
  }

  /**
   * Measures where every interval is drawn.
   *
   * @returns One centre per interval, or null when the bars did not resolve
   */
  private mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const elements = this.highlightValues;
    if (!elements) {
      return null;
    }

    const centers = [];
    for (let row = 0; row < elements.length; row++) {
      for (let col = 0; col < elements[row].length; col++) {
        const element = elements[row][col];
        const box = element.getBoundingClientRect();
        centers.push({
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
          row,
          col,
          element,
        });
      }
    }

    return centers;
  }

  /**
   * Finds the interval whose drawn bar is nearest a pointer position.
   *
   * Searches every lane rather than one representative row, unlike
   * {@link DumbbellTrace}: a lane's intervals are drawn at whatever times they
   * occupy, so the bar nearest a pointer is not reliably in the row the
   * pointer is over and the column indices do not line up between lanes.
   *
   * Answered from the measured centres rather than by measuring again: every
   * lane is searched on every `pointermove`, unthrottled, and a real schedule
   * carries hundreds to thousands of tasks -- a layout read apiece, tens of
   * times a second, for geometry that only changes when the viewport moves.
   *
   * @param x - Horizontal pointer position
   * @param y - Vertical pointer position
   * @returns The nearest interval, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    if (this.highlightCentersDirty) {
      this.highlightCenters = this.mapSvgElementsToCenters();
      this.highlightCentersDirty = false;
    }

    const centers = this.highlightCenters;
    if (!centers) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const center of centers) {
      const distance = (center.x - x) ** 2 + (center.y - y) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = {
          element: center.element,
          row: center.row,
          col: center.col,
          centerX: center.x,
          centerY: center.y,
        };
      }
    }

    return nearest;
  }

  /**
   * Releases the viewport watch the centres are invalidated by.
   */
  public override dispose(): void {
    this.stopViewportWatch();
    this.highlightCenters = null;

    super.dispose();
  }
}
