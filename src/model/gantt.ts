import type { ExtremaTarget } from '@type/extrema';
import type { FormatFunction, GanttData, GanttPoint, MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState, TraceEmptyState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { defaultFormat, FormatUtil } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { watchViewport } from '@util/viewport';
import { AbstractTrace, MAX_DESCRIPTION_TABLE_ROWS } from './abstract';
import { isMeasured, missingText } from './bar';
import { extremumAt } from './extremaTarget';
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
 * Where an interval stops: its end, or the boundary one unit past it when the
 * end is the last unit it covers (see {@link GanttData.inclusive}).
 *
 * @param point - The interval
 * @param inclusive - Whether its end is the last unit it covers
 * @returns The boundary it stops at
 */
function closeOf(point: GanttPoint, inclusive: boolean): number {
  return Number(point.end) + (inclusive ? 1 : 0);
}

/**
 * The length one interval covers.
 *
 * @param point - The interval to measure
 * @param inclusive - Whether its end is the last unit it covers
 * @returns Its length along the axis
 */
function lengthOf(point: GanttPoint, inclusive: boolean): number {
  return withoutFloatNoise(closeOf(point, inclusive) - Number(point.start));
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
 * sound like they line up, which is the overlap question answered by ear. On
 * an axis folded into rows, a packet's bits, it is the start within the row.
 */
export class GanttTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  private readonly lanes: GanttPoint[][];
  private readonly lengths: number[][];
  private readonly unit?: string;
  /** Whether an end is the last unit an interval covers. */
  private readonly inclusive: boolean;
  private readonly laneNames: (string | number)[];
  private readonly orientation: Orientation;

  /** The axis extent, taken from the intervals rather than from the layer. */
  private readonly axisMin: number;
  private readonly axisSpan: number;
  /** How long a drawn row is, for an axis folded into rows. */
  private readonly wrap?: number;

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
   * Whether the first lane is drawn above the last, or null before the
   * schedule has been laid out to measure.
   */
  private lanesRunDown: boolean | null = null;

  /**
   * Where the producer says the first lane is drawn, for a schedule with
   * nothing to measure ({@link GanttData.firstLane}).
   */
  private readonly firstLane?: 'top' | 'bottom';

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
    this.inclusive = data.inclusive === true;
    this.laneNames = data.lanes ?? [];
    this.firstLane = data.firstLane;
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.lengths = this.lanes.map(lane => lane.map(point => lengthOf(point, this.inclusive)));

    const starts = this.lanes.flat().map(point => Number(point.start));
    const ends = this.lanes.flat().map(point => closeOf(point, this.inclusive));
    const extent = MathUtil.minMax([...starts, ...ends]);
    this.axisMin = extent.min;
    // Zero rather than the difference when a chart occupies a single instant,
    // so the division that follows is guarded at its one source instead of at
    // every use.
    this.axisSpan = extent.max > extent.min ? extent.max - extent.min : 0;
    this.wrap = typeof data.wrap === 'number' && Number.isFinite(data.wrap) && data.wrap > 0
      ? data.wrap
      : undefined;

    const bounds = MathUtil.minMax(this.lengths.flat());
    this.min = bounds.min;
    this.max = bounds.max;
    // A lane with no spread of its own -- one task, how Chart.js, ApexCharts
    // and AnyChart draw a schedule and how a packet's last row often is, or
    // tasks of one length -- falls back to the whole chart's range, the scale
    // the pitch uses. Scaled to itself it has no range, the braille encoder's
    // bands collapse, and every cell reads as the lowest: the chart's longest
    // task included, while its tone is the highest.
    const laneBounds = this.lengths.map(lane => ({
      min: MathUtil.safeMin(lane),
      max: MathUtil.safeMax(lane),
    }));
    this.perLaneMin = laneBounds.map(lane => (lane.max > lane.min ? lane.min : this.min));
    this.perLaneMax = laneBounds.map(lane => (lane.max > lane.min ? lane.max : this.max));

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
      panning: this.panning,
      group: this.row,
    };
  }

  /**
   * Where the interval under the cursor sounds: its start, as a fraction of
   * the axis (see {@link GanttTrace.panAt}). A lane with nothing booked has no
   * start, and sounds in the centre rather than claiming the far left.
   *
   * @returns The stereo position of the cursor
   */
  private get panning(): AudioState['panning'] {
    const point = this.lanes[this.row]?.[this.col];
    return {
      x: point === undefined ? 0.5 : this.panAt(Number(point.start)),
      y: this.row,
      rows: this.lanes.length,
      cols: 2,
    };
  }

  /**
   * The boundary tone sounds where the interval the reader stopped at sounds,
   * as a scatter plot's does.
   *
   * The base pans it by column index across the widest lane, the mapping the
   * tones above reject: on a lane shorter than the widest, its last interval
   * is a low index, so the edge of a lane that ends the schedule -- sounding
   * hard right -- chimed hard left, at the start of the timeline.
   *
   * @returns The empty trace state, panned to the cursor's interval
   */
  protected override get outOfBoundsState(): TraceEmptyState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
      audio: this.panning,
    };
  }

  /**
   * Where a start sits across the stereo field, from 0 at the left to 1.
   *
   * Along the whole axis, so lanes sharing it sound aligned where they are
   * aligned -- or, on an axis folded into rows ({@link GanttData.wrap}),
   * within the row, which is where the interval is drawn. Measured along the
   * whole axis there, the rows would split the field between them, and two
   * fields drawn one above the other would sound a row's width apart.
   *
   * @param start - Where an interval starts
   * @returns Its fraction of the axis, or of its row
   */
  private panAt(start: number): number {
    if (this.wrap !== undefined) {
      return (((start % this.wrap) + this.wrap) % this.wrap) / this.wrap;
    }
    return this.axisSpan === 0 ? 0.5 : (start - this.axisMin) / this.axisSpan;
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
    return this.laneNames[row]
      ?? t('model.fallbackNumbered', { noun: t('model.nounLane'), index: row + 1 });
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
    //
    // A multi-line display lays the lanes out as the chart draws them, so the
    // caret moves the way Up and Down do: on a schedule drawn from the top,
    // Down moves to the lane below and the caret to the line below. Measured
    // here too, not only on a vertical key, since b can come first.
    return {
      empty: false,
      id: this.id,
      values: this.lengths,
      min: this.perLaneMin,
      max: this.perLaneMax,
      row: this.row,
      col: this.col,
      rowsTopFirst: this.drawnTopFirst(),
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
        z: { label: t('model.asideIntervals'), value: 0 },
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
        value: point.label
          ? t('model.ganttLabelled', { name: point.x, label: point.label })
          : point.x,
      },
      // Carried for the traces and modes that read a single cross value; the
      // span below replaces it wherever both are present.
      cross: { label: crossLabel, value: Number(point.start) },
      // An interval of one unit, given inclusively, is that unit: "Bit is
      // 32" rather than "32 through 32".
      ...(this.inclusive && Number(point.start) === Number(point.end)
        ? {}
        : { crossRange: { min: Number(point.start), max: Number(point.end) } }),
      // The length, with the unit the chart named. A bare number cannot say
      // whether a task runs for 40 days or 40 weeks, and the axis format that
      // renders the ends as dates says nothing about the difference between
      // two of them -- so the unit travels with the value rather than through
      // the formatter.
      z: {
        label: t('model.asideLength'),
        // Rounded before the unit is attached. Attaching it makes the value a
        // string, and a string is the one thing the formatter hands back
        // untouched -- so a length of `1.23456` was spoken in full here and
        // rounded in the description's `Shortest`, `Longest` and Length column,
        // which are the same number under four labels.
        value: this.unit === undefined
          ? length
          : t('model.ganttLengthWithUnit', {
              value: defaultFormat(length),
              unit: this.unit,
            }),
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
      { label: t('model.statNumberOfLanes'), value: this.lanes.length },
      { label: t('model.statNumberOfIntervals'), value: intervals.length },
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
      stats.push({ label: t('model.statEmptyLanes'), value: empty });
    }

    if (intervals.length > 0) {
      const spanLabel = this.unit === undefined ? '' : ` ${this.unit}`;
      // Guarded before the unit is attached rather than after. A length is
      // `Number(end) - Number(start)`, so a producer sending an unparseable
      // end makes it NaN -- and once the unit has turned that into the string
      // `NaN days` neither the dialog's own non-finite blanking nor the
      // service's rounding can catch it, because both of them test numbers.
      const withUnit = (value: number): string =>
        isMeasured(value) ? `${defaultFormat(value)}${spanLabel}` : missingText();

      const from = MathUtil.safeMin(intervals.map(point => Number(point.start)));
      const to = MathUtil.safeMax(intervals.map(point => Number(point.end)));
      stats.push(
        { label: t('model.statShortest'), value: withUnit(this.min) },
        { label: t('model.statLongest'), value: withUnit(this.max) },
        {
          label: t('model.statSpans'),
          // The chart's own rendering of its two ends when it has one, and
          // `spannedOrMissing` otherwise -- which answers a schedule whose
          // ends do not parse with `missing` rather than with the string
          // `NaN to NaN`, a string the dialog's blanking cannot see.
          value: this.timeFormat !== undefined && isMeasured(from) && isMeasured(to)
            ? t('model.spanRange', { min: this.timeFormat(from), max: this.timeFormat(to) })
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
          label: t('model.statMostIntervalsAtOnce'),
          value: t('model.ganttBusiest', {
            count: busiest.count,
            at: this.atTimeText(busiest.at),
          }),
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
    const lengthHeader = this.unit === undefined
      ? t('model.asideLength')
      : t('model.ganttLengthHeader', { unit: this.unit });
    const headers = [
      laneLabel,
      t('model.tableLabel'),
      t('model.tableStart'),
      t('model.tableEnd'),
      lengthHeader,
    ];
    // The lane column sits on whichever axis carries the lanes, the same swap
    // the header above makes. Start and End are already rendered through the
    // time axis's own format by `atTime`, so naming it here would run the
    // author's formatter twice; the label and the computed length have no axis.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = [
      this.orientation === Orientation.HORIZONTAL ? 'y' : 'x',
      undefined,
      undefined,
      undefined,
      undefined,
    ];
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
        label: t('model.statTableRows'),
        value: t('model.statTableRowsFirstOf', { shown: rows.length, total: allRows.length }),
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, columnAxes, rows },
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
        // Where it stops rather than its last unit, so two intervals that
        // merely adjoin -- bits 0-15 and 16-31 -- are not counted as running
        // together, and two that share a unit are.
        const end = closeOf(point, this.inclusive);
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
   * Up and Down follow the drawing: when the first lane is drawn above the
   * last, Down moves to the next lane and Up to the one before, as on every
   * other diagram, where Down goes down the page.
   *
   * The grid underneath keeps MAIDR's Cartesian rule, row 0 at the bottom,
   * which suits a chart drawn bottom-up (matplotlib's `broken_barh` with
   * ascending lanes). Nearly every producer lists a schedule's lanes from the
   * top -- Mermaid's sections and packet rows, ApexCharts, Plotly, Highcharts,
   * Vega-Lite -- and there Up walked down the drawing, and Down from the first
   * lane said "No more data to display" with two lanes below it. The order is
   * measured, as a figure measures its rows of panels, rather than
   * declared, so neither kind of producer has to say which it is. Only a
   * schedule with nothing to measure -- drawn to a canvas -- says it, in
   * {@link GanttData.firstLane}.
   *
   * @param direction - The key's direction
   * @returns Whether the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    return super.moveOnce(this.drawnDirection(direction));
  }

  /**
   * Control + Up and Down, by the same rule as {@link moveOnce}.
   *
   * @param direction - The key's direction
   * @returns Whether the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    return super.moveToExtreme(this.drawnDirection(direction));
  }

  /**
   * Movability by the same rule, so check-then-move (autoplay's idiom) agrees
   * with the move it checks.
   *
   * @param target - A direction, or a cell
   * @returns Whether the move is possible
   */
  public override isMovable(target: [number, number] | MovableDirection): boolean {
    return super.isMovable(Array.isArray(target) ? target : this.drawnDirection(target));
  }

  /**
   * A vertical direction as the grid has to take it to follow the drawing.
   *
   * @param direction - The key's direction
   * @returns The direction to move the grid
   */
  private drawnDirection(direction: MovableDirection): MovableDirection {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      return direction;
    }
    if (!this.drawnTopFirst()) {
      return direction;
    }
    return direction === 'UPWARD' ? 'DOWNWARD' : 'UPWARD';
  }

  /**
   * Whether the first lane is drawn above the last.
   *
   * Measured when first asked -- a vertical key, or the braille the first
   * move reports -- rather than at construction, when the chart may not be
   * laid out yet, from the hidden copies the highlight already holds: they
   * keep the geometry of the marks they copy. Only a schedule whose bars run
   * left to right stacks its lanes vertically; one drawn the default way up
   * lays them side by side and keeps the grid's own rule.
   *
   * A chart without a highlight has nothing to measure: a canvas, which
   * Chart.js and amCharts draw to, or bars no highlight resolved. There the
   * producer's {@link GanttData.firstLane} is taken, and without one the
   * grid's rule. Chart.js draws a schedule's first lane at the top, and
   * before it could say so, Up there walked down the drawing.
   *
   * @returns True when Up and Down have to be swapped
   */
  private drawnTopFirst(): boolean {
    if (this.lanesRunDown !== null) {
      return this.lanesRunDown;
    }
    if (this.orientation !== Orientation.HORIZONTAL) {
      this.lanesRunDown = false;
      return false;
    }
    const elements = this.highlightValues;
    if (elements === null) {
      this.lanesRunDown = this.firstLane === 'top';
      return this.lanesRunDown;
    }

    let first = -1;
    let last = -1;
    elements.forEach((lane, row) => {
      if (lane.length > 0) {
        first = first === -1 ? row : first;
        last = row;
      }
    });
    if (first === -1 || last === first) {
      this.lanesRunDown = false;
      return false;
    }

    const top = elements[first][0].getBoundingClientRect();
    const bottom = elements[last][0].getBoundingClientRect();
    const unlaid = (box: DOMRect): boolean => box.top === 0 && box.width === 0 && box.height === 0;
    if (unlaid(top) || unlaid(bottom)) {
      // Not laid out yet: answer as the grid would, and measure again on the
      // next key rather than keeping an answer read from nothing.
      return false;
    }
    this.lanesRunDown = top.top + top.height / 2 < bottom.top + bottom.height / 2;
    return this.lanesRunDown;
  }

  /**
   * The longest and shortest tasks, for `[`, `]` and the Go To dialog.
   *
   * Over the whole schedule rather than per lane: every lane shares one pitch
   * scale, and which task is longest is the question a schedule is read for.
   * Every task holding the extreme is offered, lane by lane, so a tie is
   * walked down the chart. An empty lane offers nothing, a length that did
   * not parse is never an extreme, and a milestone's zero is a real length.
   *
   * @returns The tasks holding the longest and shortest lengths, or none when
   *   no length is measured
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const measured = this.lengths.flat().filter(isMeasured);
    if (measured.length === 0) {
      return [];
    }

    const targets: ExtremaTarget[] = [];
    const collect = (value: number, type: 'max' | 'min', name: string): void => {
      this.lengths.forEach((lane, row) => lane.forEach((length, col) => {
        const point = this.lanes[row]?.[col];
        if (length !== value || point === undefined) {
          return;
        }
        const where = point.label
          ? t('model.ganttLabelled', { name: point.x, label: point.label })
          : point.x;
        targets.push({
          ...extremumAt(name, where),
          value,
          pointIndex: col,
          segment: 'interval',
          type,
          navigationType: 'group',
          groupIndex: row,
          categoryIndex: col,
        });
      }));
    };
    collect(MathUtil.safeMax(measured), 'max', t('model.extremaLongestInterval'));
    collect(MathUtil.safeMin(measured), 'min', t('model.extremaShortestInterval'));
    return targets;
  }

  /**
   * Moves the cursor to a chosen extrema target.
   *
   * @param target - The task to go to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    if (target.groupIndex === undefined || target.categoryIndex === undefined) {
      return;
    }
    this.row = target.groupIndex;
    this.col = target.categoryIndex;
    this.finalizeNavigation();
  }

  /**
   * The rotor's lower and higher value search, along the current lane.
   *
   * Over the lengths, the magnitude the pitch and the braille carry, so
   * "higher" from a ten-day task finds the next longer one in its lane. Up
   * and down change lanes, and a lane has no value to compare, so they report
   * the boundary as the rug does.
   * @param direction - Which way to search
   * @param type - Whether a shorter or a longer interval is sought
   * @returns True when a matching interval was found and moved to
   */
  public override moveToNextCompareValue(
    direction: 'left' | 'right' | 'up' | 'down',
    type: 'lower' | 'higher',
  ): boolean {
    if (direction === 'up' || direction === 'down') {
      this.notifyRotorBounds();
      return false;
    }
    return this.compareSearchAlongRow(this.lengths[this.row] ?? [], direction, type);
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
