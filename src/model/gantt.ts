import type { GanttData, GanttPoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
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
  private readonly orientation: Orientation;

  /** The axis extent, taken from the intervals rather than from the layer. */
  private readonly axisMin: number;
  private readonly axisSpan: number;

  private readonly min: number;
  private readonly max: number;
  private readonly perLaneMin: number[];
  private readonly perLaneMax: number[];

  protected readonly highlightValues: SVGElement[][] | null;

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

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<number>(this.lengths);
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

    const flat = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one));

    if (flat.length !== this.lanes.flat().length) {
      return null;
    }

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
        raw: this.lengths[this.row][this.col],
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
    const point = this.lanes[this.row][this.col];
    const length = this.lengths[this.row][this.col];
    // A gantt drawn the ordinary way runs its bars left to right, which puts
    // the axis on x and the lanes on y -- the opposite of the default. The
    // grid stays lanes-by-intervals either way, so the swap belongs here
    // rather than in the navigation, exactly as it does for a dumbbell.
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    return {
      // The lane, and the interval's own name when it has one. A lane commonly
      // holds several intervals, and without the name they are distinguished
      // by position alone -- "the second thing in Design" is not what the
      // chart labels it.
      main: {
        label: isHorizontal ? this.yAxis : this.xAxis,
        value: point.label ? `${point.x}, ${point.label}` : point.x,
      },
      // Carried for the traces and modes that read a single cross value; the
      // span below replaces it wherever both are present.
      cross: {
        label: isHorizontal ? this.xAxis : this.yAxis,
        value: Number(point.start),
      },
      crossRange: { min: Number(point.start), max: Number(point.end) },
      // The length, with the unit the chart named. A bare number cannot say
      // whether a task runs for 40 days or 40 weeks, and the axis format that
      // renders the ends as dates says nothing about the difference between
      // two of them -- so the unit travels with the value rather than through
      // the formatter.
      z: {
        label: 'Length',
        value: this.unit === undefined ? length : `${length} ${this.unit}`,
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

    if (intervals.length > 0) {
      const spanLabel = this.unit === undefined ? '' : ` ${this.unit}`;
      stats.push(
        { label: 'Shortest', value: `${this.min}${spanLabel}` },
        { label: 'Longest', value: `${this.max}${spanLabel}` },
        {
          label: 'Spans',
          value: `${MathUtil.safeMin(intervals.map(p => Number(p.start)))} to `
            + `${MathUtil.safeMax(intervals.map(p => Number(p.end)))}`,
        },
      );

      const empty = this.lanes.filter(lane => lane.length === 0).length;
      if (empty > 0) {
        // A lane with nothing in it is a statement about the schedule --
        // nobody is booked, nothing is planned -- and it is the one row a
        // reader can navigate into and hear nothing from, so the count says
        // up front that the silence is the data.
        stats.push({ label: 'Empty lanes', value: empty });
      }
    }

    const headers = [this.xAxis, 'Label', 'Start', 'End', 'Length'];
    const rows: (string | number)[][] = this.lanes.flatMap((lane, index) =>
      lane.map((point, column) => [
        point.x,
        point.label ?? '',
        point.start,
        point.end,
        this.lengths[index][column],
      ]),
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
   * Finds the interval whose drawn bar is nearest a pointer position.
   *
   * Searches every lane rather than one representative row, unlike
   * {@link DumbbellTrace}: a lane's intervals are drawn at whatever times they
   * occupy, so the bar nearest a pointer is not reliably in the row the
   * pointer is over and the column indices do not line up between lanes.
   *
   * @param x - Horizontal pointer position
   * @param y - Vertical pointer position
   * @returns The nearest interval, or null when nothing is resolvable
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues;
    if (!elements) {
      return null;
    }

    let nearest: NearestPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let row = 0; row < elements.length; row++) {
      for (let col = 0; col < elements[row].length; col++) {
        const box = elements[row][col].getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const distance = (centerX - x) ** 2 + (centerY - y) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { element: elements[row][col], row, col, centerX, centerY };
        }
      }
    }

    return nearest;
  }
}
