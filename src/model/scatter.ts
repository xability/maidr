import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { GridNavigable, PointCloudHighlightable, PointNavigable, XValue } from '@type/navigation';
import type { AudioState, AxisType, BrailleState, DescriptionStat, DescriptionState, HighlightState, TextState, TraceEmptyState, TraceState } from '@type/state';
import type { MessageKey } from '@util/i18n';
import type { Dimension, NearestPoint } from './abstract';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { watchViewport } from '@util/viewport';
import { AbstractTrace, MAX_DESCRIPTION_TABLE_ROWS } from './abstract';
import { MovablePlane } from './movable';

/**
 * Represents scatter points grouped by X coordinate.
 * `y` and `z` are index-aligned: for the ith point sharing this x, `y[i]` is its y
 * and `z[i]` is its z (or NaN when z is absent).
 */
interface ScatterXPoint {
  x: number;
  y: number[];
  z: number[];
  /**
   * The category name this column stands for, when the x axis carries names.
   * Scalar because every point in the column shares the x that is the slot.
   *
   * Taken from the first point grouped into the column, which assumes one
   * name per numeric slot -- the premise of the shape, since the slot *is*
   * the category. A producer that emitted two different names for one `x`
   * would have the second silently dropped; there is nothing better to do
   * with it, and inventing a second column would split a category in half.
   */
  label?: string;
  /**
   * Index-aligned with `y`: the category name of each point's y, when the y
   * axis carries names. An array rather than a scalar because a column's y
   * values differ from one another, which is the whole reason the column
   * exists.
   */
  yLabels: (string | undefined)[];
  /**
   * Index-aligned with `y`: what each point in the column *is*, per
   * {@link ScatterPoint.label}.
   *
   * Separate from {@link ScatterXPoint.label}, which names the column --
   * "this slot is called Norway" against "this point is Norway". A column
   * holding several points has several names and no single one, which is
   * why this is an array and why it is announced only where the cursor
   * lands on exactly one.
   */
  names: (string | undefined)[];
}

/**
 * Represents scatter points grouped by Y coordinate.
 * `x` and `z` are index-aligned.
 */
interface ScatterYPoint {
  x: number[];
  y: number;
  z: number[];
  /** The category name this row stands for; see {@link ScatterXPoint.label}. */
  label?: string;
  /** Index-aligned with `x`; see {@link ScatterXPoint.yLabels}. */
  xLabels: (string | undefined)[];
  /** Index-aligned with `x`; see {@link ScatterXPoint.names}. */
  names: (string | undefined)[];
}

/**
 * Represents a single cell in the grid navigation overlay.
 * `zValues` is index-aligned with `points`/`yValues`/`xValues`/`svgElements`.
 */
interface GridCell {
  points: ScatterPoint[];
  yValues: number[];
  xValues: number[];
  zValues: number[];
  svgElements: SVGElement[];
  /**
   * Indices into the layer's `data` array of the points binned into this cell,
   * index-aligned with `points`. Unlike `svgElements` this is filled whether or
   * not the binder supplied elements, so a canvas chart — which has none — can
   * still say which points a cell holds.
   */
  indices: number[];
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
}

enum NavMode {
  COL = 'col',
  ROW = 'row',
}

/**
 * A category name if the producer supplied a usable one, otherwise undefined.
 *
 * An empty string counts as absent, per {@link ScatterPoint.xLabel}: a
 * producer that emits `''` for an unnamed slot gets the number announced
 * rather than a blank where a value should be.
 */
function nameOf(label: string | undefined): string | undefined {
  return label || undefined;
}

/**
 * The name a coordinate stands for, or the coordinate itself.
 *
 * Every announcement of an x or a y goes through this, so a categorical axis
 * reads as its categories and a continuous one is untouched. Kept as one
 * function rather than inlined at each site because the trace announces a
 * coordinate from six places (two base modes, point mode, intersection mode,
 * grid-cell point mode) and a site that forgot would announce a slot index as
 * though it were a measurement.
 */
function named(value: number, label: string | undefined): number | string {
  return label ?? value;
}

/**
 * How a correlation coefficient reads.
 *
 * Bands on |r| after Evans (1996), *Straightforward Statistics for the
 * Behavioral Sciences*, p. 146 -- a partition rather than Cohen's three anchor
 * points, which would leave r = 0.55 and r = 0.99 sharing one word.
 *
 * Below 0.1 no direction is claimed at all. The sign of a near-zero r is noise
 * -- moving one point flips it -- so "very weak negative" for r = -0.02 would
 * tell a reader the cloud tilts down when it does not. Tested on the magnitude
 * rather than against zero, because an exact zero essentially never survives
 * float arithmetic and `Math.sign(-0)` is `-0`, which would read a signed zero
 * as negative. `none` is also the right word for a symmetric cloud whose r is
 * genuinely 0: the claim the label makes is about *linear* correlation.
 *
 * @param r - Pearson's r, in [-1, 1]
 * @returns The strength, with its direction when one can be claimed
 */
function correlationStrength(r: number): string {
  const magnitude = Math.abs(r);
  if (magnitude < 0.1) {
    return t('model.correlationNone');
  }
  const direction = t(r > 0 ? 'model.correlationPositive' : 'model.correlationNegative');
  if (magnitude < 0.2) {
    return t('model.correlationVeryWeak', { direction });
  }
  if (magnitude < 0.4) {
    return t('model.correlationWeak', { direction });
  }
  if (magnitude < 0.6) {
    return t('model.correlationModerate', { direction });
  }
  if (magnitude < 0.8) {
    return t('model.correlationStrong', { direction });
  }
  return t('model.correlationVeryStrong', { direction });
}

/**
 * The four regions of a scatter, in quadrant order.
 *
 * Numbered anticlockwise from the upper right, as the convention has it, and
 * each carries the key for the plain words for where it is. A reader who cannot see the
 * chart has no picture to hang "quadrant 3" on, and a reader who knows the
 * convention should not have to take "lower left" on trust -- so both are
 * said, every time.
 */
const QUADRANTS = [
  { number: 1, where: 'model.quadrantUpperRight', right: true, top: true },
  { number: 2, where: 'model.quadrantUpperLeft', right: false, top: true },
  { number: 3, where: 'model.quadrantLowerLeft', right: false, top: false },
  { number: 4, where: 'model.quadrantLowerRight', right: true, top: false },
] as const satisfies readonly { number: number; where: MessageKey; right: boolean; top: boolean }[];

/**
 * How evenly the shares have to sit before the cloud is called evenly spread.
 *
 * In percentage points, between the largest quadrant and the smallest. Naming
 * a "densest" quadrant that holds 26% against another's 25% would report the
 * shape of the sample rather than the shape of the data.
 */
const EVEN_SPREAD_TOLERANCE = 5;

/**
 * The same, for the index-aligned arrays a column or row announces.
 *
 * Returns the numbers untouched when no element carries a name, so a
 * continuous axis keeps emitting `number[]` exactly as before.
 */
function namedAll(
  values: number[],
  labels: (string | undefined)[],
): number[] | string[] {
  if (!labels.some(Boolean)) {
    return values;
  }
  return values.map((value, index) => labels[index] ?? String(value));
}

/**
 * A single scatter datapoint as the point-navigation rotor sees it,
 * paired with its rendered SVG element (when one was found).
 */
interface FlatPoint {
  x: number;
  y: number;
  z: number;
  /** See {@link ScatterPoint.xLabel}; undefined on a continuous axis. */
  xLabel?: string;
  /** See {@link ScatterPoint.yLabel}; undefined on a continuous axis. */
  yLabel?: string;
  /** See {@link ScatterPoint.label}; undefined on an unnamed point. */
  label?: string;
  svg: SVGElement | null;
  /** Index of this point's x among the sorted unique x values (`xPoints`). */
  xIndex: number;
  /** Index of this point's y within `xPoints[xIndex].y` (ascending). */
  yIndexInColumn: number;
}

export class ScatterTrace extends AbstractTrace implements GridNavigable, PointNavigable, PointCloudHighlightable {
  /** How many category names the summary lists before it stops. */
  private static readonly MAX_NAMED_CATEGORIES = 20;

  /**
   * The fewest points a quadrant breakdown is offered for.
   *
   * Below this the four percentages are a restatement of four small counts --
   * "25%, 25%, 25%, 25%" over four points tells a reader nothing they did not
   * already have from `Total points`.
   */
  private static readonly MIN_QUADRANT_POINTS = 8;

  private mode: NavMode;
  protected readonly movable: MovablePlane;
  protected readonly supportsExtrema = false;

  private readonly xPoints: ScatterXPoint[];
  private readonly yPoints: ScatterYPoint[];

  private readonly xValues: number[];
  /** Column index of each distinct x value, for O(1) stereo-pan resolution. */
  private readonly xIndexByValue: Map<number, number>;
  private readonly yIndexByValue: Map<number, number>;
  private readonly yValues: number[];

  private readonly highlightXValues: SVGElement[][] | null;
  private readonly highlightYValues: SVGElement[][] | null;
  /**
   * Every clone the selector resolved, in data order, whether or not its
   * coordinates could be read. A marker with none joins neither a column nor
   * a row, so this is the only list `dispose()` can remove it through.
   */
  private readonly svgClones: SVGElement[];
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  // highlightCenters holds viewport coordinates from getBoundingClientRect(),
  // which shift when the page scrolls or the window resizes. Rather than
  // recompute every rect on each pointermove, mark the cache stale on
  // scroll/resize and rebuild it lazily on the next hover (findNearestPoint).
  // It starts stale for the same reason: measuring at construction is a
  // forced layout per trace that a keyboard reader never asks for.
  private highlightCentersDirty = true;

  private readonly stopViewportWatch = watchViewport((): void => {
    this.highlightCentersDirty = true;
  });

  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  private readonly hasZ: boolean;
  private readonly minZ: number;
  private readonly maxZ: number;

  // Grid navigation state
  private readonly gridCells: GridCell[][] | null;
  private readonly numGridRows: number;
  private readonly numGridCols: number;
  private gridRow: number;
  private gridCol: number;
  private isInGridMode: boolean;

  /**
   * The braille surface of the grid: one point count per cell, with the
   * busiest cell's count beside it.
   *
   * Built on the first braille read rather than per read. `braille` is
   * evaluated inside every state computation, so a fine grid rescanned every
   * cell and allocated a row array per grid row on each arrow key -- ten
   * thousand cell reads and a hundred allocations on a 100 x 100 grid.
   *
   * `gridCells` is readonly and its cells are filled once by
   * {@link buildGridCells}. The one thing that changes a count afterwards is
   * {@link dispose}, which empties them, and which clears this so a disposed
   * trace does not retain the matrix or report counts its cells no longer
   * hold.
   */
  private gridCounts: { values: number[][]; max: number } | null = null;

  // Grid cell point navigation state
  private isInGridCellMode: boolean;
  private cellPointIndex: number;
  private cellXPoints: ScatterXPoint[]; // Grouped cell points by X (like xPoints)
  private cellSvgGroups: SVGElement[][]; // SVG elements grouped by X
  /**
   * `data` indices grouped by X, parallel to `cellXPoints`. The index twin of
   * `cellSvgGroups`, built unconditionally so a canvas chart can resolve a
   * cell-mode highlight it has no elements for.
   */
  private cellIndexGroups: number[][];

  // Point navigation state (POINT_MODE)
  // - flatPoints: every individual datapoint, in original data order
  // - readingOrder / columnOrder: permutations of flatPoints indices for the
  //   two arrow axes. Right/Left walk readingOrder (y desc, x asc); Down/Up
  //   walk columnOrder (x asc, y desc). Out-of-bounds at either end of either
  //   array — no wrap.
  // - readingPos / columnPos: inverse lookups (flat index -> sort position),
  //   so a single keystroke is O(1).
  /**
   * Protected so a subclass can read the points themselves. A volcano plot
   * needs each point's identity and whether it clears a threshold, neither of
   * which is a coordinate.
   */
  protected readonly flatPoints: FlatPoint[];
  protected readonly readingOrder: number[];
  private readonly columnOrder: number[];
  /**
   * Protected alongside `readingOrder`: it is the precomputed inverse of it,
   * and a subclass filtering the reading order needs O(1) position lookups
   * rather than a linear scan per keystroke.
   */
  protected readonly readingPos: number[];
  private readonly columnPos: number[];
  protected isInPointMode: boolean;
  protected pointModeIndex: number;

  // Intersection navigation state (INTERSECTION_MODE)
  // - xPointsSvg / yPointsSvg: parallel to xPoints / yPoints. Indexed the
  //   same way as the corresponding *Points entry, so a single point in a
  //   stack can be highlighted in COL or ROW mode respectively. null entries
  //   indicate the binder didn't supply elements (count mismatch).
  // - hasIntersectableStack: precomputed capability flag (any x has >=2 ys
  //   OR any y has >=2 xs). Either mode can enter intersection navigation,
  //   so the rotor offers the mode whenever either dimension stacks.
  // - isInIntersectionMode / intersectionStackIndex: active state when the
  //   rotor has the user inside INTERSECTION_MODE. The index walks the stack
  //   matching the current NavMode (xPoints[col].y in COL, yPoints[row].x
  //   in ROW), so entering intersection mode from either base mode keeps the
  //   user on the points they were just hearing.
  private readonly xPointsSvg: (SVGElement | null)[][] | null;
  private readonly yPointsSvg: (SVGElement | null)[][] | null;
  /**
   * The index twins of `xPointsSvg` / `yPointsSvg`: `[col][k]` is the `data`
   * index of the point `xPoints[col].y[k]` came from (and likewise for y).
   *
   * Built unconditionally, where the SVG arrays are built only when the binder
   * supplied one element per datapoint. A canvas chart has no elements at all,
   * so the identity of a highlighted point has to survive their absence.
   */
  private readonly xPointIndices: number[][];
  private readonly yPointIndices: number[][];
  private readonly hasIntersectableStack: boolean;
  private isInIntersectionMode: boolean;
  private intersectionStackIndex: number;

  /**
   * Creates a new scatter trace instance and organizes data by X and Y coordinates.
   * @param layer - The MAIDR layer containing scatter plot data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);
    this.mode = NavMode.COL;

    const data = layer.data as ScatterPoint[];

    this.hasZ = data.some(p => typeof p.z === 'number');

    // Columns and rows are built from an order over the point *indices*
    // rather than over copies of the points, so the one ordering serves both
    // the values a column holds and the data indices behind them
    // (`xPointIndices`, which INTERSECTION highlight needs). Ordering the
    // points and then ordering the indices the same way, as this did, is two
    // N log N sorts for one answer -- on a Manhattan plot of a few hundred
    // thousand points, the duplicates alone were a third of a second before
    // anything could be read, and every live-data append pays it again.
    const xOrder = ScatterTrace.orderedIndices(data, 'x');
    this.xPoints = new Array<ScatterXPoint>();
    this.xPointIndices = new Array<number[]>();
    let currentX: ScatterXPoint | null = null;
    let currentXIndices: number[] = [];
    for (const index of xOrder) {
      const point = data[index];
      if (!currentX || currentX.x !== point.x) {
        currentX = {
          x: point.x,
          y: [],
          z: [],
          label: nameOf(point.xLabel),
          yLabels: [],
          names: [],
        };
        this.xPoints.push(currentX);
        currentXIndices = [];
        this.xPointIndices.push(currentXIndices);
      }
      currentX.y.push(point.y);
      currentX.yLabels.push(nameOf(point.yLabel));
      currentX.names.push(nameOf(point.label));
      currentX.z.push(typeof point.z === 'number' ? point.z : Number.NaN);
      currentXIndices.push(index);
    }

    const yOrder = ScatterTrace.orderedIndices(data, 'y');
    this.yPoints = new Array<ScatterYPoint>();
    this.yPointIndices = new Array<number[]>();
    let currentY: ScatterYPoint | null = null;
    let currentYIndices: number[] = [];
    for (const index of yOrder) {
      const point = data[index];
      if (!currentY || currentY.y !== point.y) {
        currentY = {
          y: point.y,
          x: [],
          z: [],
          label: nameOf(point.yLabel),
          xLabels: [],
          names: [],
        };
        this.yPoints.push(currentY);
        currentYIndices = [];
        this.yPointIndices.push(currentYIndices);
      }
      currentY.x.push(point.x);
      currentY.xLabels.push(nameOf(point.xLabel));
      currentY.names.push(nameOf(point.label));
      currentY.z.push(typeof point.z === 'number' ? point.z : Number.NaN);
      currentYIndices.push(index);
    }

    this.xValues = this.xPoints.map(p => p.x);
    this.yValues = this.yPoints.map(p => p.y);
    // Stereo panning resolves an x value to its column index once per tone,
    // and a ROW-mode chord is one tone per point, so a linear scan there is
    // O(points x columns) on every keystroke. xValues is unique and built
    // once, so a lookup table costs one pass and makes each resolve O(1).
    this.xIndexByValue = new Map(this.xValues.map((x, index) => [x, index]));
    // The same table for the other axis, for the same reason: the COL -> ROW
    // toggle runs on every Up and Down arrow and located its target row by
    // scanning yValues, which on a continuous y is one entry per point.
    //
    // A NaN y is left out rather than keyed: `indexOf` compared with `===`,
    // which never matched it, while a Map key would (SameValueZero). Leaving
    // it out keeps `yIndexOf` answering -1 there, which is the miss the
    // toggle's fallback is written for.
    this.yIndexByValue = new Map();
    this.yValues.forEach((y, index) => {
      if (!Number.isNaN(y) && !this.yIndexByValue.has(y)) {
        this.yIndexByValue.set(y, index);
      }
    });

    this.minX = MathUtil.safeMin(this.xValues);
    this.maxX = MathUtil.safeMax(this.xValues);
    this.minY = MathUtil.safeMin(this.yValues);
    this.maxY = MathUtil.safeMax(this.yValues);

    if (this.hasZ) {
      const zValues = data.map(p => p.z).filter((v): v is number => typeof v === 'number');
      this.minZ = MathUtil.safeMin(zValues);
      this.maxZ = MathUtil.safeMax(zValues);
    } else {
      this.minZ = 0;
      this.maxZ = 0;
    }

    // Select SVG elements once, then share for COL/ROW grouping and grid cell mapping
    const selector = layer.selectors as string;
    const allSvgClones = selector ? Svg.selectAllElements(selector) : [];
    this.svgClones = allSvgClones;

    [this.highlightXValues, this.highlightYValues] = this.groupSvgElements(allSvgClones);
    // Left for the first hover to measure. `highlightCentersDirty` starts
    // true, so findNearestPoint builds them the same way it does after a
    // scroll.
    this.highlightCenters = null;
    this.movable = new MovablePlane(this.xPoints, this.yPoints);

    // Build grid if per-axis config (axes.x.{min,max,tickStep}) is provided.
    this.isInGridMode = false;
    this.gridRow = 0;
    this.gridCol = 0;
    this.isInGridCellMode = false;
    this.cellPointIndex = 0;
    this.cellXPoints = [];
    this.cellSvgGroups = [];
    this.cellIndexGroups = [];
    const gridConfig = this.resolveGridConfig(layer);
    if (gridConfig) {
      const xSteps = this.computeGridSteps(gridConfig.xMin, gridConfig.xMax, gridConfig.xTickStep);
      const ySteps = this.computeGridSteps(gridConfig.yMin, gridConfig.yMax, gridConfig.yTickStep);
      this.numGridCols = xSteps.length;
      this.numGridRows = ySteps.length;
      this.gridCells = this.buildGridCells(data, xSteps, ySteps, allSvgClones);
    } else {
      this.gridCells = null;
      this.numGridRows = 0;
      this.numGridCols = 0;
    }

    // A point's slot inside its own column, for every column, in one pass.
    // Searching the column per point instead is O(points x column height),
    // which is quadratic on the charts that stack hardest — a strip plot at
    // a single x, a Manhattan plot over a handful of chromosomes. The slot
    // recorded is the first one holding that y, which is what a search for
    // it would have found. NaN is left out: a search never matches it, and
    // a Map would.
    const slotOfYInColumn = this.xPoints.map((column) => {
      const slots = new Map<number, number>();
      for (let k = 0; k < column.y.length; k++) {
        if (!Number.isNaN(column.y[k]) && !slots.has(column.y[k])) {
          slots.set(column.y[k], k);
        }
      }
      return slots;
    });

    // Point navigation: pair each data point with its rendered SVG element by
    // index (the same index correspondence buildGridCells relies on), then
    // build two sort orders. Both orders are full permutations of the flat
    // points list — the same N indices, just visited in different sequences.
    this.flatPoints = data.map((p, i) => {
      // Both lookups key off the very numbers xPoints was grouped from, so
      // they hit exactly; the fallbacks only guard a malformed layer.
      const xIndex = this.xIndexOf(p.x);
      return {
        x: p.x,
        y: p.y,
        z: typeof p.z === 'number' ? p.z : Number.NaN,
        xLabel: nameOf(p.xLabel),
        yLabel: nameOf(p.yLabel),
        label: nameOf(p.label),
        svg: allSvgClones.length === data.length ? allSvgClones[i] : null,
        xIndex,
        yIndexInColumn: slotOfYInColumn[xIndex]?.get(p.y) ?? 0,
      };
    });
    this.readingOrder = this.flatPoints
      .map((_, i) => i)
      .sort((a, b) => {
        const pa = this.flatPoints[a];
        const pb = this.flatPoints[b];
        return pb.y - pa.y || pa.x - pb.x;
      });
    this.columnOrder = this.flatPoints
      .map((_, i) => i)
      .sort((a, b) => {
        const pa = this.flatPoints[a];
        const pb = this.flatPoints[b];
        return pa.x - pb.x || pb.y - pa.y;
      });
    this.readingPos = Array.from<number>({ length: this.flatPoints.length });
    this.columnPos = Array.from<number>({ length: this.flatPoints.length });
    for (let i = 0; i < this.readingOrder.length; i++) {
      this.readingPos[this.readingOrder[i]] = i;
    }
    for (let i = 0; i < this.columnOrder.length; i++) {
      this.columnPos[this.columnOrder[i]] = i;
    }
    this.isInPointMode = false;
    this.pointModeIndex = 0;

    // Intersection mode setup. xPointsSvg / yPointsSvg parallel xPoints /
    // yPoints respectively and are built only when the binder supplied one
    // SVG per datapoint; otherwise highlight falls back to out-of-bounds
    // (consistent with how POINT_MODE handles missing SVGs).
    // hasIntersectableStack is the cheap capability check: either dimension
    // having any stack is enough — intersection mode from COL uses x-column
    // stacks, from ROW it uses y-row stacks, so we offer the mode whenever
    // either is non-trivial.
    const hasSvg = allSvgClones.length === data.length;
    this.xPointsSvg = hasSvg
      ? this.xPointIndices.map(group => group.map(i => allSvgClones[i] ?? null))
      : null;
    this.yPointsSvg = hasSvg
      ? this.yPointIndices.map(group => group.map(i => allSvgClones[i] ?? null))
      : null;
    this.hasIntersectableStack
      = this.xPoints.some(p => p.y.length >= 2)
        || this.yPoints.some(p => p.x.length >= 2);
    this.isInIntersectionMode = false;
    this.intersectionStackIndex = 0;
  }

  /**
   * The indices of `data`, ordered by one axis with the other breaking ties.
   *
   * The order the points are grouped into columns (`x` primary) or rows (`y`
   * primary) in, kept as indices so grouping produces both at once: the
   * values a column holds, and the `data` index behind each of them. The
   * indices are what INTERSECTION highlight focuses a single point of a
   * stack by, and the durable identity of a point besides -- the caller maps
   * one to an SVG element when the binder supplied one, and publishes it
   * as-is to a canvas adapter, which has no element to map it to.
   *
   * `Array.prototype.sort` is stable, so points agreeing on both axes stay in
   * the order the layer listed them, exactly as when the points themselves
   * were sorted.
   *
   * @param data - The layer's points
   * @param primary - The axis to group by; the other breaks ties
   * @returns The indices, ordered
   */
  private static orderedIndices(
    data: ScatterPoint[],
    primary: 'x' | 'y',
  ): number[] {
    const secondary = primary === 'x' ? 'y' : 'x';
    return data
      .map((_, i) => i)
      .sort(
        (a, b) =>
          data[a][primary] - data[b][primary]
          || data[a][secondary] - data[b][secondary],
      );
  }

  /**
   * Cleans up resources and removes all highlight elements from the DOM.
   */
  public override dispose(): void {
    this.stopViewportWatch();

    this.movable.dispose();

    this.xPoints.length = 0;
    this.yPoints.length = 0;

    // Removed through the full list rather than through the column and row
    // groupings alone: a clone whose coordinates could not be read is in
    // neither grouping, and left in the chart it accumulated on every
    // focus-out and live-data rebuild.
    this.svgClones.forEach(el => Svg.isOwned(el) && el.remove());
    this.svgClones.length = 0;
    if (this.highlightXValues) {
      this.highlightXValues.length = 0;
    }
    if (this.highlightYValues) {
      this.highlightYValues.length = 0;
    }
    this.highlightCenters = null;

    // Grid and grid-cell navigation hold the same clones by another route.
    this.gridCells?.forEach(row => row.forEach((cell) => {
      cell.svgElements.length = 0;
      cell.points.length = 0;
    }));
    // Emptying the cells is the one thing that changes their counts, so the
    // braille matrix counted from them goes with them.
    this.gridCounts = null;
    this.cellSvgGroups.length = 0;
    this.cellIndexGroups.length = 0;

    // Point and intersection navigation cache their own references to the
    // chart's live geometry; leaving them behind retains a detached DOM tree
    // for as long as the disposed trace is reachable.
    this.flatPoints.length = 0;
    this.readingOrder.length = 0;
    this.columnOrder.length = 0;
    this.readingPos.length = 0;
    this.columnPos.length = 0;
    this.xPointsSvg?.forEach(group => (group.length = 0));
    this.yPointsSvg?.forEach(group => (group.length = 0));

    super.dispose();
  }

  /**
   * Returns the appropriate highlight elements based on current navigation mode.
   * @returns SVG elements for X-based or Y-based highlighting depending on mode
   */
  protected get highlightValues(): SVGElement[][] | null {
    return this.mode === NavMode.COL
      ? this.highlightXValues
      : this.highlightYValues;
  }

  /**
   * Returns an empty object to avoid grouping scatter points by audio tone.
   * @returns Empty object without groupIndex to maintain consistent audio feedback
   */
  protected override getAudioGroupIndex(): { groupIndex?: number } {
    // Rationale for returning empty object instead of groupIndex:
    //
    // Scatterplots fundamentally differ from other plot types in their grouping semantics:
    // - Bar/Line plots: groupIndex represents different series/categories with distinct audio tones
    // - Heatmaps: groupIndex can represent different data dimensions
    // - Scatterplots: Each point represents an individual observation, not a group
    //
    // Using groupIndex for scatterplots would cause different audio tones for what should be
    // conceptually similar data points, potentially confusing users who expect consistent
    // audio feedback when exploring point-by-point data.
    //
    // Future enhancement: When scatterplots support explicit multi-series data (e.g., different
    // colors/shapes for distinct categories), this method should be updated to return the
    // appropriate groupIndex for true categorical distinctions.
    return {};
  }

  protected get values(): number[][] {
    // Always return a 2D array with both X and Y values
    // This ensures this.values[this.row] always exists
    // The navigation logic in moveOnce and isMovable handles the mode-specific behavior
    const result = [this.xValues, this.yValues];

    // Safety check: ensure row is within bounds for the current mode
    if (this.mode === NavMode.COL) {
      // In COL mode, row should be 0 since we navigate through xValues
      if (this.row !== 0) {
        this.row = 0;
      }
    } else {
      // In ROW mode, row should be within yPoints bounds
      if (this.row < 0 || this.row >= this.yPoints.length) {
        this.row = 0;
      }
    }

    return result;
  }

  protected get braille(): BrailleState {
    if (this.isInIntersectionMode) {
      // Intersection mode focuses a single point — same braille story as
      // POINT_MODE, no meaningful 2-D surface to render.
      return this.outOfBoundsState;
    }
    if (this.isInPointMode) {
      // Point mode renders one datapoint at a time; braille has no meaningful
      // surface for that, so fall through to the empty state.
      return this.outOfBoundsState;
    }
    // Grid mode: return 2D grid of point counts for braille display
    if (this.isInGridMode && this.gridCells) {
      const counts = this.countGridPoints(this.gridCells);
      return {
        empty: false,
        id: this.id,
        values: counts.values,
        min: 0,
        max: counts.max,
        row: this.gridRow,
        col: this.gridCol,
      };
    }

    // Normal row/col mode: braille not supported (return empty state)
    return this.outOfBoundsState;
  }

  /**
   * The point count of every grid cell, and the largest of them.
   *
   * Memoised in {@link gridCounts}; see there for what invalidates it.
   * @param cells The grid to count, already known to exist
   * @returns The counts by row and column, with the busiest cell's count
   */
  private countGridPoints(cells: GridCell[][]): { values: number[][]; max: number } {
    if (this.gridCounts !== null) {
      return this.gridCounts;
    }

    const values: number[][] = [];
    let max = 0;
    for (let r = 0; r < this.numGridRows; r++) {
      values[r] = [];
      for (let c = 0; c < this.numGridCols; c++) {
        const count = cells[r][c].points.length;
        values[r][c] = count;
        if (count > max) {
          max = count;
        }
      }
    }

    this.gridCounts = { values, max };
    return this.gridCounts;
  }

  /**
   * Normalizes z values to a 0-1 intensity per point. Each NaN becomes 0 (no
   * 3D cue), each finite value is scaled by (z-minZ)/(maxZ-minZ). Returns
   * undefined when this trace has no z data, so the field is omitted from
   * AudioState and the audio service skips the echo path entirely.
   */
  private zIntensityFor(zValues: number[]): number[] | undefined {
    if (!this.hasZ) {
      return undefined;
    }
    const range = this.maxZ - this.minZ;
    if (range <= 0) {
      return zValues.map(() => 0);
    }
    return zValues.map(z =>
      Number.isFinite(z) ? MathUtil.clamp((z - this.minZ) / range, 0, 1) : 0,
    );
  }

  protected get audio(): AudioState {
    if (this.isInIntersectionMode) {
      // Focus a single point in the current stack. COL mode: y values at the
      // current x — frequency conveys y (mapped to yMin/yMax). ROW mode: x
      // values at the current y — frequency conveys x (mapped to xMin/xMax).
      //
      // Panning convention is "the point's natural chart position", not
      // "where it sits in the stack":
      //   COL — every point shares the column's x, so they all pan to the
      //         same horizontal slot (this.col within xPoints).
      //   ROW — each point has a distinct x, so the pan reads the x's index
      //         in the global xPoints axis. Stepping through the stack pans
      //         left/right exactly as it would in default navigation.
      // Geometry (rows/cols) is reported relative to the whole chart so the
      // audio engine maps pan positions over the full plot extent.
      const stack = this.getIntersectionStackValues();
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, stack.length - 1));
      const value = stack[idx] ?? 0;
      const isCol = this.mode === NavMode.COL;
      const min = isCol ? this.minY : this.minX;
      const max = isCol ? this.maxY : this.maxX;
      const panX = isCol
        ? this.col
        : this.xIndexOf(value);
      // COL walks a stack at one x, so the stack index IS the vertical
      // position — it pairs with rows = stack.length below. Reporting 0 would
      // announce "row 1 of N" at every step of the stack, which is the one
      // thing the position key exists to tell apart. ROW walks across x at a
      // fixed y, so the row index is already the answer there.
      const panY = isCol ? idx : this.row;
      const rows = isCol ? Math.max(1, stack.length) : Math.max(1, this.yPoints.length);
      const cols = Math.max(1, this.xPoints.length);
      return {
        freq: { raw: value, min, max },
        panning: { y: panY, x: panX, rows, cols },
        // A user steps into intersection mode to pull one point out of a stack;
        // dropping z here would make the isolated point the only one they
        // cannot hear the third dimension of.
        zIntensity: this.zIntensityFor([this.getIntersectionStackZ()[idx] ?? Number.NaN])?.[0],
      };
    }

    if (this.isInPointMode) {
      const point = this.flatPoints[this.pointModeIndex];
      // Pan by position among unique x values so points at the same x produce
      // identical horizontal panning; xValues is sorted ascending in the
      // constructor.
      //
      // y / rows report the point's place inside its own x-column rather than
      // a flat {y: 0, rows: 1}. Panning is what AnnouncePositionCommand reads,
      // and point mode is precisely the mode where several points share an x:
      // a fixed row announces "row 1 of 1" for every one of them, leaving a
      // blind user unable to tell two stacked points apart. Stereo placement
      // is unaffected — only panning.x reaches the oscillator.
      return {
        freq: {
          raw: point.y,
          min: this.minY,
          max: this.maxY,
        },
        panning: {
          y: point.yIndexInColumn,
          x: point.xIndex,
          rows: this.pointColumnHeight(point),
          cols: this.xValues.length,
        },
        zIntensity: this.zIntensityFor([point.z])?.[0],
      };
    }

    if (this.isInGridMode && this.gridCells) {
      // Grid cell point navigation mode - play Y values at current X
      if (this.isInGridCellMode && this.cellXPoints.length > 0) {
        const currentPoint = this.cellXPoints[this.cellPointIndex];
        return {
          freq: {
            raw: currentPoint.y,
            min: this.minY,
            max: this.maxY,
          },
          panning: {
            y: 0,
            x: this.cellPointIndex,
            rows: 1,
            cols: this.cellXPoints.length,
          },
          zIntensity: this.zIntensityFor(currentPoint.z),
        };
      }

      // Grid cell overview mode - play all Y values in cell
      const cell = this.gridCells[this.gridRow][this.gridCol];
      return {
        freq: {
          raw: cell.yValues,
          min: this.minY,
          max: this.maxY,
        },
        panning: {
          y: this.gridRow,
          x: this.gridCol,
          rows: this.numGridRows,
          cols: this.numGridCols,
        },
        zIntensity: this.zIntensityFor(cell.zValues),
      };
    }

    if (this.mode === NavMode.COL) {
      const current = this.xPoints[this.col];
      return {
        freq: {
          raw: current.y,
          min: this.minY,
          max: this.maxY,
        },
        panning: {
          y: this.row,
          x: this.col,
          rows: current.y.length,
          cols: this.xPoints.length,
        },
        zIntensity: this.zIntensityFor(current.z),
      };
    } else {
      const current = this.yPoints[this.row];
      // Each tone in the chord is a distinct (x, y=row's y) point, so emit
      // a per-tone pan parallel to freq.raw — the audio service walks the
      // chord and reads panX[i] for tone i. Slots are global xPoints indices
      // so the row's points pan to where they would be in normal navigation
      // rather than clumping at one location. Previously this passed a
      // single `this.col` (a leftover COL-mode index), which collapsed the
      // whole chord onto one stereo slot and saturated to one ear whenever
      // that slot fell outside the row's effective range.
      const panXArray = current.x.map(xv => this.xIndexOf(xv));
      return {
        freq: {
          raw: current.x,
          min: this.minX,
          max: this.maxX,
        },
        panning: {
          // The single representative slot every non-chord path reads (the
          // out-of-bounds tone, the position announcement); panX carries the
          // per-tone slots for the chord itself.
          y: this.row,
          x: panXArray[0] ?? 0,
          rows: this.yPoints.length,
          cols: Math.max(1, this.xPoints.length),
        },
        panX: panXArray,
        zIntensity: this.zIntensityFor(current.z),
      };
    }
  }

  /**
   * Resolves an x value to its column index for stereo panning.
   *
   * Every caller passes a value taken from this trace's own points, so the
   * lookup always hits; the 0 fallback exists so a future caller cannot pan
   * from a negative index.
   *
   * @param value - An x value drawn from this trace's data
   * @returns The column index of that value, or 0 if it is not a known x
   */
  private xIndexOf(value: number): number {
    return this.xIndexByValue.get(value) ?? 0;
  }

  /**
   * Resolves a y value to its row index on the sorted unique y axis.
   *
   * Unlike {@link xIndexOf}, a miss answers -1 rather than 0: both callers
   * test for it, one to fall back to the first row and one to clamp.
   * @param value - A y value drawn from this trace's data
   * @returns The row index of that value, or -1 if it is not a known y
   */
  private yIndexOf(value: number): number {
    return this.yIndexByValue.get(value) ?? -1;
  }

  /**
   * How many points share this point's x — the denominator of the "row n of m"
   * that point mode announces. Read by both the in-bounds audio state and the
   * out-of-bounds one so the boundary chime describes the same geometry as the
   * tone before it.
   */
  private pointColumnHeight(point: FlatPoint): number {
    return Math.max(1, this.xPoints[point.xIndex]?.y.length ?? 1);
  }

  /**
   * Builds the z field for TextState from a group's z values (NaN-filtered).
   * Returns a scalar for singletons, an array for groups, and undefined when absent.
   */
  private textZ(zValues: number[]): TextState['z'] {
    if (!this.hasZ) {
      return undefined;
    }
    const finite = zValues.filter(v => Number.isFinite(v));
    if (finite.length === 0) {
      return undefined;
    }
    const value = finite.length === 1 ? finite[0] : finite;
    return { label: this.z, value };
  }

  /**
   * The `asides` naming the point the cursor is on, when it names one.
   *
   * A name identifies a *point*, so it is announced only where the cursor
   * identifies one -- the same rule the volcano trace states, applied to
   * every scatter now that {@link ScatterPoint.label} lives there. Column
   * and row modes sit on a stack of points at once, and naming any of them
   * there would name the wrong one; a stack of exactly one has no wrong one
   * to pick, which is the ordinary case for a labelled scatter, where every
   * point has its own x.
   *
   * An aside rather than part of `main`: `main` carries the value on an
   * axis, formatted as that axis formats, and a country's name is not a
   * value on one.
   *
   * @param names - The names of the points the cursor is on
   * @returns The aside list, or undefined when nothing is named
   */
  private nameAside(
    names: readonly (string | undefined)[],
  ): { label: string; value: string }[] | undefined {
    if (names.length !== 1) {
      return undefined;
    }
    const only = names[0];
    return only === undefined || only === ''
      ? undefined
      : [{ label: t('model.asideName'), value: only }];
  }

  /**
   * `state` with the point's name attached, where it has one.
   *
   * @param state - The announcement so far
   * @param names - The names of the points the cursor is on
   * @returns The announcement, named or unchanged
   */
  private named(
    state: TextState,
    names: readonly (string | undefined)[],
  ): TextState {
    const asides = this.nameAside(names);
    return asides === undefined ? state : { ...state, asides };
  }

  protected get text(): TextState {
    if (this.isInIntersectionMode) {
      // One (x, y) pair, with main/cross labels swapped to match the base
      // mode the user came from. COL: x is the shared anchor, y is the
      // varying stack value (matches existing COL announcement). ROW: y is
      // the anchor, x varies (matches existing ROW announcement).
      const stack = this.getIntersectionStackValues();
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, stack.length - 1));
      const z = this.textZ([this.getIntersectionStackZ()[idx] ?? Number.NaN]);
      // The stack is one axis' values; its names come from the other point's
      // index-aligned label array, so the cursor announces the category the
      // chart drew rather than the slot it was drawn at.
      const stackLabels = this.getIntersectionStackLabels();
      // The stack index picks out one point, so a name here names it.
      const stackName = [this.getIntersectionStackNames()[idx]];
      if (this.mode === NavMode.COL) {
        const xPoint = this.xPoints[this.col];
        return this.named({
          main: {
            label: this.xAxis,
            value: xPoint === undefined ? '' : named(xPoint.x, xPoint.label),
          },
          cross: {
            label: this.yAxis,
            value: stack[idx] === undefined ? '' : named(stack[idx], stackLabels[idx]),
          },
          z,
        }, stackName);
      }
      const yPoint = this.yPoints[this.row];
      return this.named({
        main: {
          label: this.yAxis,
          value: yPoint === undefined ? '' : named(yPoint.y, yPoint.label),
        },
        cross: {
          label: this.xAxis,
          value: stack[idx] === undefined ? '' : named(stack[idx], stackLabels[idx]),
        },
        z,
      }, stackName);
    }

    if (this.isInPointMode) {
      const point = this.flatPoints[this.pointModeIndex];
      // The echo train carries z as density; without this the number itself is
      // unreachable in the one mode built for reading a single 3D point.
      return this.named({
        main: { label: this.xAxis, value: named(point.x, point.xLabel) },
        cross: { label: this.yAxis, value: named(point.y, point.yLabel) },
        z: this.textZ([point.z]),
      }, [point.label]);
    }

    if (this.isInGridMode && this.gridCells) {
      const cell = this.gridCells[this.gridRow][this.gridCol];

      // Grid cell point navigation mode - use COL mode format (X value + array of Y values)
      if (this.isInGridCellMode && this.cellXPoints.length > 0) {
        const currentPoint = this.cellXPoints[this.cellPointIndex];
        return this.named({
          main: { label: this.xAxis, value: named(currentPoint.x, currentPoint.label) },
          cross: {
            label: this.yAxis,
            value: namedAll(currentPoint.y, currentPoint.yLabels),
          },
          z: this.textZ(currentPoint.z),
          gridPosition: { row: this.gridRow + 1, col: this.gridCol + 1 },
        }, currentPoint.names);
      }

      // Grid cell navigation mode (cell overview) - z omitted to keep summary compact
      return {
        main: { label: this.xAxis, value: '' },
        cross: { label: this.yAxis, value: '' },
        range: { min: cell.xRange.min, max: cell.xRange.max },
        crossRange: { min: cell.yRange.min, max: cell.yRange.max },
        gridPoints: cell.points,
        gridPosition: { row: this.gridRow + 1, col: this.gridCol + 1 },
      };
    }

    if (this.mode === NavMode.COL) {
      const current = this.xPoints[this.col];
      return this.named({
        main: { label: this.xAxis, value: named(current.x, current.label) },
        cross: { label: this.yAxis, value: namedAll(current.y, current.yLabels) },
        z: this.textZ(current.z),
      }, current.names);
    } else {
      const current = this.yPoints[this.row];
      return this.named({
        main: { label: this.yAxis, value: named(current.y, current.label) },
        cross: { label: this.xAxis, value: namedAll(current.x, current.xLabels) },
        z: this.textZ(current.z),
      }, current.names);
    }
  }

  /**
   * Gets the description state for the scatter trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    const totalPoints = this.xPoints.reduce((sum, xp) => sum + xp.y.length, 0);

    const stats: DescriptionState['stats'] = [];

    const correlation = this.correlationStat();
    if (correlation) {
      // First, for the reason VolcanoTrace puts its own shape stat first: it
      // is what a sighted reader takes from the cloud before any one point.
      stats.push(correlation);
    }

    // Beside the correlation, and before the counts: the two of them are what
    // the cloud looks like, and the counts are what it is made of.
    const quadrants = this.quadrantStats();
    if (quadrants.length > 0) {
      stats.push(quadrants[0]);
    }

    stats.push({ label: t('model.statTotalPoints'), value: totalPoints });

    // Named after the axes rather than after `x` and `y`, so the summary and
    // the table headers three lines down call the same axis the same thing.
    const xNames = ScatterTrace.categoriesOf(this.xPoints);
    const yNames = ScatterTrace.categoriesOf(this.yPoints);
    stats.push(
      { label: t('model.statUniqueAxisValues', { axis: this.xAxis }), value: this.xPoints.length },
      { label: t('model.statUniqueAxisValues', { axis: this.yAxis }), value: this.yPoints.length },
      xNames
        ? { label: t('model.statAxisCategories', { axis: this.xAxis }), value: ScatterTrace.listed(xNames) }
        : { label: t('model.statAxisRange', { axis: this.xAxis }), value: MathUtil.spannedOrMissing(this.minX, this.maxX) },
      yNames
        ? { label: t('model.statAxisCategories', { axis: this.yAxis }), value: ScatterTrace.listed(yNames) }
        : { label: t('model.statAxisRange', { axis: this.yAxis }), value: MathUtil.spannedOrMissing(this.minY, this.maxY) },
    );

    if (this.hasZ) {
      stats.push({ label: t('model.statAxisRange', { axis: this.z }), value: MathUtil.spannedOrMissing(this.minZ, this.maxZ) });
    }

    // How deep the deepest column is. A plain scatter, where every point has
    // its own x, gains no line; a strip plot or a Manhattan plot -- the shapes
    // this trace stacks for -- gain the one number that says points overlap at
    // all, which `Total points` beside `Unique x values` only implies.
    const tallest = this.xPoints.reduce((most, xp) => Math.max(most, xp.y.length), 0);
    if (tallest > 1) {
      stats.push({ label: t('model.statMostPointsAtOne', { axis: this.xAxis }), value: tallest });
    }

    // The breakdown sits down here rather than beside its headline: a reader
    // who wants the shape has already had it in one line, and four percentages
    // and a pair of dividing values in front of the counts would bury them.
    stats.push(...quadrants.slice(1));

    if (this.gridCells) {
      stats.push({
        label: t('model.statGrid'),
        value: t('model.statGridValue', { rows: this.numGridRows, cols: this.numGridCols }),
      });
    }

    const hasNames = this.xPoints.some(xp => xp.names.some(Boolean));
    const headers = [
      this.xAxis,
      this.yAxis,
      ...(this.hasZ ? [this.z] : []),
      ...(hasNames ? [t('model.asideName')] : []),
    ];
    // Named the same way the announcements are, so the table a reader exports
    // or reads cell by cell agrees with what navigation told them. A table
    // still showing slot indices after the cursor said "a" would be the same
    // defect one surface over.
    const allRows: (string | number)[][] = this.xPoints.flatMap(xp =>
      xp.y.map((y, index) => [
        named(xp.x, xp.label),
        named(y, xp.yLabels[index]),
        ...(this.hasZ ? [xp.z[index]] : []),
        ...(hasNames ? [xp.names[index] ?? ''] : []),
      ]),
    );
    const rows = allRows.slice(0, MAX_DESCRIPTION_TABLE_ROWS);
    if (allRows.length > rows.length) {
      // Said rather than silently done: the dialog prints the row count it is
      // given, and a count that claims the whole layer over a table holding a
      // thousandth of it is worse than no table.
      stats.push({
        label: t('model.statTableRows'),
        value: t('model.statTableRowsFirstOf', { shown: rows.length, total: allRows.length }),
      });
    }

    // The two coordinates are readings on x and y, and the depth column on z,
    // the axis its own header is named from. `Name` is what a point *is*
    // rather than a reading off any axis, so it keeps the dialog's own
    // rounding. Built from the same two conditions the headers were.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = [
      'x',
      'y',
      ...(this.hasZ ? ['z' as AxisType] : []),
      ...(hasNames ? [undefined] : []),
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
   * Whether the cloud tilts up, tilts down, or does not tilt -- the fact a
   * scatter plot is drawn to show, and the one a reader walking it point by
   * point never arrives at.
   *
   * Only claimed for two *measured* axes. A named axis's numbers are slots the
   * producer chose (0, 1, 2 for a, b, c on a strip plot), so a coefficient over
   * them would describe that producer's category ordering while sounding like a
   * statement about the data -- the same error {@link named} exists to keep out
   * of the announcements. One name anywhere on an axis is enough to disqualify
   * it: that makes the axis a scale of categories with some slots unlabelled,
   * not a measurement.
   *
   * Silent, rather than saying "not applicable", when there is no claim to make
   * -- the convention the rest of the description follows for a fact a layer
   * does not carry.
   *
   * @returns The correlation stat, or null when none can honestly be given
   */
  private correlationStat(): DescriptionStat | null {
    const named = this.flatPoints.some(p => p.xLabel !== undefined || p.yLabel !== undefined);
    if (named) {
      return null;
    }

    const xs = this.flatPoints.map(p => p.x);
    const ys = this.flatPoints.map(p => p.y);
    const r = MathUtil.pearson(xs, ys);
    if (r === null) {
      return null;
    }

    return {
      label: t('model.statCorrelation'),
      // `n` travels inside the value because it is the count the coefficient
      // was actually computed over, which on a layer with gaps is not the
      // `Total points` stated below it. Rounded here rather than left to the
      // service, which rounds numbers and passes composed strings through.
      value: t('model.statCorrelationValue', {
        strength: correlationStrength(r),
        r: defaultFormat(r),
        n: MathUtil.pairedCount(xs, ys),
      }),
    };
  }

  /**
   * Where the cloud actually sits: the share of the points in each quarter of
   * the plotted area, and which quarter holds most of them.
   *
   * The second thing a sighted reader takes from a scatter, after the tilt.
   * Correlation says which way the cloud leans; this says where it is, which
   * is a different fact and one r cannot carry -- an r of 0.9 is the same
   * number whether the cloud sits low and left or high and right.
   *
   * WHERE THE LINES ARE DRAWN. Through the origin when both axes actually
   * cross it, which is what a sighted reader sees and what "quadrant" means
   * everywhere else. Through the middle of each axis's extent otherwise: most
   * scatters -- horsepower against mileage, height against weight -- hold no
   * negative value at all, so origin quadrants would put every point in the
   * first and say nothing. The dividing values are reported either way, as
   * their own line, so a reader never has to guess which rule applied.
   *
   * A point sitting exactly on a dividing line is counted up and to the right,
   * so every point lands in exactly one quadrant and the four shares are a
   * partition of the whole. With the midpoint rule the highest point sits on
   * neither line and the lowest sits on both, which is why the rule has to be
   * stated rather than left to whichever comparison was written first.
   *
   * Claimed only for two measured axes, for the same reason
   * {@link correlationStat} is: on a named axis the horizontal split falls
   * between two categories the producer happened to order that way, and
   * "62% on the left" would be a fact about that ordering. An axis that never
   * moves is excluded too -- a split through a constant puts every point on
   * one side of it.
   *
   * @returns The headline, the breakdown and the dividing values, or nothing
   *   when no honest claim can be made.
   */
  private quadrantStats(): DescriptionStat[] {
    const usable = this.flatPoints.filter(
      point =>
        point.xLabel === undefined
        && point.yLabel === undefined
        && Number.isFinite(point.x)
        && Number.isFinite(point.y),
    );
    // Four shares of three points are three statements about one point each,
    // dressed up as percentages.
    if (usable.length < ScatterTrace.MIN_QUADRANT_POINTS
      || usable.length !== this.flatPoints.length) {
      return [];
    }
    if (this.minX === this.maxX || this.minY === this.maxY) {
      return [];
    }

    const splitX = ScatterTrace.splitOf(this.minX, this.maxX);
    const splitY = ScatterTrace.splitOf(this.minY, this.maxY);

    const counts = QUADRANTS.map(quadrant => usable.filter(
      point =>
        (point.x >= splitX) === quadrant.right && (point.y >= splitY) === quadrant.top,
    ).length);
    const shares = MathUtil.sharePercentages(counts);

    const highest = Math.max(...shares);
    const lowest = Math.min(...shares);
    const densest = QUADRANTS.filter((_, index) => shares[index] === highest);

    return [
      {
        label: t('model.statMostPoints'),
        value: highest - lowest <= EVEN_SPREAD_TOLERANCE
          ? t('model.quadrantsEvenSpread')
          : t('model.quadrantDensest', {
              share: highest,
              quadrants: densest
                .map(q => t('model.quadrantNamed', { where: t(q.where), number: q.number }))
                .join(t('model.quadrantJoin')),
            }),
      },
      {
        label: t('model.statPointsByQuadrant'),
        value: QUADRANTS
          .map((quadrant, index) => t('model.quadrantShare', {
            number: quadrant.number,
            where: t(quadrant.where),
            share: shares[index],
          }))
          .join(', '),
      },
      {
        label: t('model.statQuadrantsSplitAt'),
        value: t('model.quadrantSplitValue', {
          xAxis: this.xAxis,
          x: defaultFormat(splitX),
          yAxis: this.yAxis,
          y: defaultFormat(splitY),
        }),
      },
    ];
  }

  /**
   * Where an axis is cut in two for the quadrant count.
   *
   * @param min - The axis minimum
   * @param max - The axis maximum
   * @returns Zero when the axis crosses it, the midpoint of the extent otherwise
   */
  private static splitOf(min: number, max: number): number {
    return min < 0 && max > 0 ? 0 : (min + max) / 2;
  }

  /**
   * The category names of an axis, when every slot on it carries one.
   *
   * @param groups - That axis's columns or rows, in axis order
   * @returns The names in axis order, or null on a continuous axis
   */
  private static categoriesOf(groups: readonly { label?: string }[]): string[] | null {
    const names = groups
      .map(group => group.label)
      .filter((name): name is string => name !== undefined);
    return names.length > 0 && names.length === groups.length ? names : null;
  }

  /**
   * A category list, cut short before it becomes a recital.
   *
   * @param names - The categories, in axis order
   * @returns The list as it reads
   */
  private static listed(names: string[]): string {
    const cap = ScatterTrace.MAX_NAMED_CATEGORIES;
    return names.length <= cap
      ? names.join(', ')
      : t('model.listedAndMore', {
          names: names.slice(0, cap).join(', '),
          count: names.length - cap,
        });
  }

  protected get dimension(): Dimension {
    if (this.isInIntersectionMode) {
      // Match the audio panning geometry so out-of-bounds fallback pans the
      // same way as the in-bounds case. Both use full-chart cols (xPoints
      // axis); rows is per-mode (stack length for COL, yPoints for ROW).
      const isCol = this.mode === NavMode.COL;
      const stack = this.getIntersectionStackValues();
      return {
        rows: isCol ? Math.max(1, stack.length) : Math.max(1, this.yPoints.length),
        cols: Math.max(1, this.xPoints.length),
      };
    }
    if (this.isInPointMode) {
      // Single-point view; dimension feeds out-of-bounds panning fallback.
      return {
        rows: 1,
        cols: this.xValues.length,
      };
    }
    if (this.isInGridCellMode) {
      // Autoplay divides its duration budget by these, so a cell traversal
      // must be paced over the cell's points, not the grid's cells.
      return {
        rows: 1,
        cols: Math.max(1, this.cellXPoints.length),
      };
    }
    if (this.isInGridMode) {
      return {
        rows: this.numGridRows,
        cols: this.numGridCols,
      };
    }
    return {
      rows: this.yPoints.length,
      cols: this.xPoints.length,
    };
  }

  protected override get highlight(): HighlightState {
    if (this.isInIntersectionMode) {
      // Highlight a single point in the current stack. Parallel SVG arrays
      // for each axis line up with the corresponding xPoints / yPoints
      // entries (both share the constructor's sort order). Falls back to
      // out-of-bounds when the binder didn't supply per-point elements.
      const svgStack = this.mode === NavMode.COL
        ? this.xPointsSvg?.[this.col]
        : this.yPointsSvg?.[this.row];
      if (!svgStack) {
        return this.outOfBoundsState;
      }
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, svgStack.length - 1));
      const element = svgStack[idx] ?? null;
      if (!element) {
        return this.outOfBoundsState;
      }
      return {
        empty: false,
        elements: [element],
      };
    }

    if (this.isInPointMode) {
      const point = this.flatPoints[this.pointModeIndex];
      if (!point.svg) {
        return this.outOfBoundsState;
      }
      return {
        empty: false,
        elements: [point.svg],
      };
    }

    if (this.isInGridMode && this.gridCells) {
      const cell = this.gridCells[this.gridRow][this.gridCol];

      // Grid cell point navigation - highlight all points at current X
      if (this.isInGridCellMode && this.cellSvgGroups.length > 0) {
        const elements = this.cellSvgGroups[this.cellPointIndex];
        if (!elements || elements.length === 0) {
          return this.outOfBoundsState;
        }
        return {
          empty: false,
          elements,
        };
      }

      // Grid cell overview - highlight all points in cell
      if (cell.svgElements.length === 0) {
        return this.outOfBoundsState;
      }
      return {
        empty: false,
        elements: cell.svgElements,
      };
    }

    if (this.highlightValues === null) {
      return this.outOfBoundsState;
    }

    const elements = this.mode === NavMode.COL
      ? this.col < this.highlightValues.length ? this.highlightValues![this.col] : null
      : this.row < this.highlightValues.length ? this.highlightValues![this.row] : null;
    if (!elements) {
      return this.outOfBoundsState;
    }

    return {
      empty: false,
      elements,
    };
  }

  /**
   * The points the highlight currently covers, as indices into this layer's
   * `data` array.
   *
   * This is `highlight` answered in a renderer-neutral currency. `highlight`
   * resolves the same five navigation modes into `SVGElement`s, which a canvas
   * chart has none of — so a canvas adapter is handed back an index into the
   * `data` array it supplied, and inverts it against its own extraction walk.
   * That keeps the binning here, in the model that owns it: the adapter never
   * learns what a grid cell or an x-bucket is.
   *
   * Deliberately not gated on SVG availability, where `highlight` falls back to
   * out-of-bounds when the binder supplied no elements. A canvas chart has no
   * elements by definition, and that is exactly the case this exists to serve.
   *
   * Returns an empty array when nothing is addressed, which a consumer reads as
   * "clear the overlay".
   *
   * @returns Indices into `layer.data`, in no particular order.
   */
  public get highlightedPointIndices(): readonly number[] {
    if (this.isInIntersectionMode) {
      // A single point in the current stack, selected the same way the SVG
      // branch selects its element.
      const stack = this.mode === NavMode.COL
        ? this.xPointIndices[this.col]
        : this.yPointIndices[this.row];
      if (!stack || stack.length === 0) {
        return [];
      }
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, stack.length - 1));
      const index = stack[idx];
      return index === undefined ? [] : [index];
    }

    if (this.isInPointMode) {
      // pointModeIndex indexes flatPoints, which is `data.map(...)` — so it is
      // already a data index, with no bookkeeping in between.
      return this.pointModeIndex >= 0 && this.pointModeIndex < this.flatPoints.length
        ? [this.pointModeIndex]
        : [];
    }

    if (this.isInGridMode && this.gridCells) {
      if (this.isInGridCellMode && this.cellIndexGroups.length > 0) {
        return this.cellIndexGroups[this.cellPointIndex] ?? [];
      }
      return this.gridCells[this.gridRow]?.[this.gridCol]?.indices ?? [];
    }

    return (this.mode === NavMode.COL
      ? this.xPointIndices[this.col]
      : this.yPointIndices[this.row]) ?? [];
  }

  /**
   * Where one of this layer's `data` points sits in the trace's own
   * coordinates — the inverse of {@link ScatterTrace.highlightedPointIndices}.
   *
   * A scatter does not navigate its points in the order they arrived: the
   * constructor sorts by x and groups the duplicates, so a column is one
   * unique x. A raw data index read as a column therefore names a different
   * point, or none at all once duplicates have collapsed several into one.
   * That is what a streamed point needs translating out of before it can be
   * announced (`LiveDataManager.appendData` reports the new point by data
   * index).
   *
   * Mode-aware, because the coordinate the state getters read is: `COL`
   * announces the column at `col` and pans by the point's place within it,
   * `ROW` announces the row at `row`.
   *
   * @param index - An index into this layer's `data` array
   * @returns The position to read that point at, or null when the index is
   *          not one this trace has
   */
  public positionOfDataIndex(index: number): { row: number; col: number } | null {
    const point = this.flatPoints[index];
    if (!point) {
      return null;
    }
    if (this.mode === NavMode.COL) {
      return { row: point.yIndexInColumn, col: point.xIndex };
    }
    // yValues is the sorted unique y axis, so a point of this trace is always
    // on it; the clamp only guards a malformed layer.
    return { row: Math.max(0, this.yIndexOf(point.y)), col: point.xIndex };
  }

  protected override get hasMultiPoints(): boolean {
    return true;
  }

  /**
   * Returns out-of-bounds state with the position the active navigation mode is
   * actually on, so the boundary chime pans from where the user is.
   *
   * Grid, point and intersection mode each keep their own cursor; the base
   * implementation pans by row/col, which in those modes is the stale cursor
   * from before the mode was entered.
   */
  protected override get outOfBoundsState(): TraceEmptyState {
    // Inside a cell the cursor is cellPointIndex, so the bounds chime has to
    // pan there — the grid branch below would place it at the cell's position
    // in the grid instead, on the wrong side of the plot.
    if (this.isInGridCellMode && this.cellXPoints.length > 0) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          y: 0,
          x: this.cellPointIndex,
          rows: 1,
          cols: Math.max(1, this.cellXPoints.length),
        },
      };
    }

    // Use grid position when in grid mode for correct panning
    if (this.isInGridMode && this.gridCells) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          y: this.gridRow,
          x: this.gridCol,
          rows: this.numGridRows,
          cols: this.numGridCols,
        },
      };
    }

    if (this.isInPointMode && this.flatPoints.length > 0) {
      const point = this.flatPoints[this.pointModeIndex];
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          y: point.yIndexInColumn,
          x: point.xIndex,
          rows: this.pointColumnHeight(point),
          cols: Math.max(1, this.xValues.length),
        },
      };
    }

    if (this.isInIntersectionMode) {
      const stack = this.getIntersectionStackValues();
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, stack.length - 1));
      const isCol = this.mode === NavMode.COL;
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          y: isCol ? idx : this.row,
          x: isCol ? this.col : this.xIndexOf(stack[idx] ?? 0),
          rows: isCol ? Math.max(1, stack.length) : Math.max(1, this.yPoints.length),
          cols: Math.max(1, this.xPoints.length),
        },
      };
    }

    // Fall back to parent implementation for non-grid mode
    return super.outOfBoundsState;
  }

  /**
   * Initializes scatter plot navigation at the origin in column mode.
   */
  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    // For scatter plots, start in COL mode with row=0, col=0
    this.row = 0;
    this.col = 0;
    this.mode = NavMode.COL;
  }

  /**
   * Toggles between COL and ROW navigation modes while maintaining logical position mapping.
   */
  private toggleNavigation(): void {
    if (this.mode === NavMode.COL) {
      // Switch from COL to ROW mode
      const currentXPoint = this.xPoints[this.col];
      const middleYValue
        = currentXPoint.y[Math.floor(currentXPoint.y.length / 2)];
      const targetRow = this.yIndexOf(middleYValue);

      // Safety check: ensure the calculated row is valid
      if (targetRow === -1 || targetRow >= this.yPoints.length) {
        this.row = 0; // Use 0 as fallback
      } else {
        this.row = targetRow; // Use the calculated row to maintain logical connection
      }

      this.mode = NavMode.ROW;
    } else {
      // Switch from ROW to COL mode
      const currentYPoint = this.yPoints[this.row];
      const middleXValue
        = currentYPoint.x[Math.floor(currentYPoint.x.length / 2)];
      const targetCol = this.xIndexOf(middleXValue);

      // Safety check: ensure the calculated col is valid
      if (targetCol === -1 || targetCol >= this.xPoints.length) {
        this.col = 0;
      } else {
        this.col = targetCol;
      }

      this.mode = NavMode.COL;
      this.row = 0; // Set to 0 for COL mode since values[0] = xValues
    }
  }

  public override moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return true;
    }

    // Cell mode sits inside grid mode, so it has to be tested first: the grid
    // branch below moves the cell *selection*, which is not what the user is
    // navigating once they have pressed Enter into a cell.
    if (this.isInGridCellMode) {
      return this.moveOnceInGridCellMode(direction);
    }

    // Handle grid mode navigation (used by autoplay and direct calls)
    if (this.isInGridMode && this.gridCells) {
      return this.moveOnceInGridMode(direction);
    }

    // Point and intersection mode reshape the state getters, so a raw row/col
    // step — which is what autoplay issues — would repeat one tone while
    // silently flipping NavMode underneath the user. Route it through the same
    // steppers the rotor arrows use, matching the grid branch above.
    if (this.isInPointMode) {
      switch (direction) {
        case 'FORWARD':
          return this.movePointRight();
        case 'BACKWARD':
          return this.movePointLeft();
        case 'UPWARD':
          return this.movePointUp();
        case 'DOWNWARD':
          return this.movePointDown();
      }
    }

    if (this.isInIntersectionMode) {
      return direction === 'FORWARD' || direction === 'UPWARD'
        ? this.moveToNextIntersection()
        : this.moveToPrevIntersection();
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return false;
    }

    if (this.mode === NavMode.COL) {
      switch (direction) {
        case 'FORWARD':
          this.col++;
          break;
        case 'BACKWARD':
          this.col--;
          break;
        case 'UPWARD':
        case 'DOWNWARD': {
          this.toggleNavigation();
          break;
        }
      }
    } else {
      switch (direction) {
        case 'UPWARD':
          this.row++;
          break;
        case 'DOWNWARD':
          this.row--;
          break;
        case 'FORWARD':
        case 'BACKWARD': {
          this.toggleNavigation();
          break;
        }
      }
    }

    this.notifyStateUpdate();
    return true;
  }

  /**
   * Handles movement inside an entered grid cell, mapping directions to the
   * cell's own point cursor. Only left/right are meaningful — a cell's points
   * are walked as one horizontal list — so up/down report out of bounds
   * rather than falling through and moving the grid selection underneath a
   * user who believes they are still inside the cell.
   *
   * Used by autoplay, which drives movement through moveOnce; manual arrows
   * reach the same moveCellPoint* methods through their own commands. Those
   * methods notify observers or report bounds themselves.
   * @param direction - The movement direction
   * @returns True if movement was successful, false at a boundary
   */
  private moveOnceInGridCellMode(direction: MovableDirection): boolean {
    switch (direction) {
      case 'FORWARD':
        return this.moveCellPointRight();
      case 'BACKWARD':
        return this.moveCellPointLeft();
      case 'UPWARD':
      case 'DOWNWARD':
      default:
        this.notifyOutOfBounds();
        return false;
    }
  }

  /**
   * Handles movement in grid mode, mapping directions to grid cell selection.
   * Only reached when the user is browsing the grid itself; once they have
   * pressed Enter into a cell, {@link moveOnceInGridCellMode} takes over.
   * @param direction - The movement direction
   * @returns True if movement was successful, false if at boundary
   */
  private moveOnceInGridMode(direction: MovableDirection): boolean {
    let moved = false;
    switch (direction) {
      case 'FORWARD':
        moved = this.moveGridRight();
        break;
      case 'BACKWARD':
        moved = this.moveGridLeft();
        break;
      case 'UPWARD':
        moved = this.moveGridUp();
        break;
      case 'DOWNWARD':
        moved = this.moveGridDown();
        break;
    }
    // Grid movement methods already call notifyStateUpdate() or notifyOutOfBounds()
    return moved;
  }

  public override moveToExtreme(direction: MovableDirection): boolean {
    // Cell, grid, point and intersection mode own the cursor (see moveOnce).
    // Ctrl+Arrow is bound whatever mode is active, so the extreme is taken
    // within the mode: jumping the row/col cursor underneath it would
    // re-announce the unchanged point and leave the reader somewhere else,
    // unannounced, the moment they left the mode.
    if (this.isInGridCellMode) {
      return this.moveToExtremeInGridCell(direction);
    }
    if (this.isInGridMode && this.gridCells) {
      return this.moveToExtremeInGrid(direction);
    }
    if (this.isInPointMode) {
      return this.moveToExtremePoint(direction);
    }
    if (this.isInIntersectionMode) {
      return this.moveToExtremeIntersection(direction);
    }

    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    if (this.mode === NavMode.COL) {
      switch (direction) {
        case 'UPWARD':
          this.toggleNavigation();
          this.row = this.yPoints.length - 1; // Go to last Y coordinate
          break;
        case 'DOWNWARD':
          this.toggleNavigation();
          this.row = 0; // Go to first Y coordinate
          break;
        case 'FORWARD':
          this.col = this.xPoints.length - 1;
          break;
        case 'BACKWARD':
          this.col = 0;
          break;
      }
    } else {
      switch (direction) {
        case 'UPWARD':
          this.row = this.yPoints.length - 1; // Go to last Y coordinate
          break;
        case 'DOWNWARD':
          this.row = 0; // Go to first Y coordinate
          break;
        case 'FORWARD':
          this.toggleNavigation();
          this.col = this.xPoints.length - 1;
          break;
        case 'BACKWARD':
          this.toggleNavigation();
          this.col = 0;
          break;
      }
    }
    this.notifyStateUpdate();
    return true;
  }

  /**
   * The extreme within an entered cell, which is walked one way, by x.
   *
   * @param direction - The direction of the jump
   * @returns True when the cell cursor moved to its first or last point
   */
  private moveToExtremeInGridCell(direction: MovableDirection): boolean {
    if (this.cellXPoints.length === 0 || direction === 'UPWARD' || direction === 'DOWNWARD') {
      this.notifyOutOfBounds();
      return false;
    }
    this.cellPointIndex = direction === 'FORWARD' ? this.cellXPoints.length - 1 : 0;
    this.notifyStateUpdate();
    return true;
  }

  /**
   * The extreme cell of the grid in a direction.
   *
   * @param direction - The direction of the jump
   * @returns True, the grid always has an edge to jump to
   */
  private moveToExtremeInGrid(direction: MovableDirection): boolean {
    switch (direction) {
      case 'UPWARD':
        this.gridRow = this.numGridRows - 1;
        break;
      case 'DOWNWARD':
        this.gridRow = 0;
        break;
      case 'FORWARD':
        this.gridCol = this.numGridCols - 1;
        break;
      case 'BACKWARD':
        this.gridCol = 0;
        break;
    }
    this.notifyStateUpdate();
    return true;
  }

  /**
   * The first or last point of the order point mode walks in a direction:
   * reading order for left/right, column order for up/down.
   *
   * @param direction - The direction of the jump
   * @returns True when there is a point to land on
   */
  private moveToExtremePoint(direction: MovableDirection): boolean {
    if (this.flatPoints.length === 0) {
      this.notifyOutOfBounds();
      return false;
    }
    switch (direction) {
      case 'FORWARD':
        this.pointModeIndex = this.readingOrder[this.readingOrder.length - 1];
        break;
      case 'BACKWARD':
        this.pointModeIndex = this.readingOrder[0];
        break;
      // columnOrder is sorted (x asc, y desc), so up is backward in it.
      case 'UPWARD':
        this.pointModeIndex = this.columnOrder[0];
        break;
      case 'DOWNWARD':
        this.pointModeIndex = this.columnOrder[this.columnOrder.length - 1];
        break;
    }
    this.notifyStateUpdate();
    return true;
  }

  /**
   * The first or last point of the stack intersection mode is walking.
   *
   * @param direction - The direction of the jump
   * @returns True when the stack has a point to land on
   */
  private moveToExtremeIntersection(direction: MovableDirection): boolean {
    const size = this.getIntersectionStackValues().length;
    if (size === 0) {
      this.notifyOutOfBounds();
      return false;
    }
    this.intersectionStackIndex = direction === 'FORWARD' || direction === 'UPWARD' ? size - 1 : 0;
    this.notifyStateUpdate();
    return true;
  }

  public override moveToIndex(row: number, col: number): boolean {
    // Grid semantics: `col` is the x index (COL mode) and `row` is the y index
    // (ROW mode). `moveToXValueInValues` (@util/navigation) preserves X across
    // layer switches by calling moveToIndex(0, xIndex), so COL mode must read
    // the column argument (previously it read `row`, always landing on x=0).
    if (this.mode === NavMode.COL) {
      if (col >= 0 && col < this.xPoints.length) {
        this.col = col;
        this.row = 0;
        this.notifyStateUpdate();
        return true;
      } else {
        this.notifyOutOfBounds();
        return false;
      }
    } else {
      if (row >= 0 && row < this.yPoints.length) {
        this.row = row;
        // Keep the x cursor inside the target row's bounds: ROW-mode panning
        // and highlight lookup index yPoints[row].x by this.col.
        this.col = Math.max(0, Math.min(this.col, this.yPoints[row].x.length - 1));
        this.notifyStateUpdate();
        return true;
      } else {
        this.notifyOutOfBounds();
        return false;
      }
    }
  }

  /**
   * The x the reader is at, in terms of the axis they are walking.
   *
   * COL mode walks the x values, so it is the column's x. ROW mode walks the
   * y values, so the x reported is the one the reader would land on when
   * switching back to columns (the same middle-of-the-row rule
   * `toggleNavigation` applies), which keeps a layer switch near the points
   * they were hearing. The inherited reading of `values[row][col]` over
   * `[xValues, yValues]` answered with a y value at row 1 and with nothing
   * at all above it.
   *
   * @returns The current x, or null when the cursor is off the data
   */
  public override getCurrentXValue(): XValue | null {
    if (this.mode === NavMode.COL) {
      return this.xPoints[this.col]?.x ?? null;
    }
    const xs = this.yPoints[this.row]?.x;
    if (xs === undefined || xs.length === 0) {
      return null;
    }
    return xs[Math.floor(xs.length / 2)];
  }

  /**
   * Moves to the column at an x value, entering COL mode to do so.
   *
   * An exact x wins; a numeric x with no exact column falls back to the
   * nearest one, as the shared helper does for other traces, and a
   * categorical x is matched against the column labels.
   *
   * @param xValue - The x to move to
   * @returns True when a column was found and the cursor moved
   */
  public override moveToXValue(xValue: XValue): boolean {
    const index = this.xIndexNearest(xValue);
    if (index === -1) {
      return false;
    }
    this.mode = NavMode.COL;
    return this.moveToIndex(0, index);
  }

  /**
   * The column index for an x value: exact, else nearest numeric, else by
   * column label.
   *
   * @param xValue - The x to look up
   * @returns The column index, or -1 when nothing matches
   */
  private xIndexNearest(xValue: XValue): number {
    if (typeof xValue !== 'number') {
      return this.xPoints.findIndex(point => point.label === xValue);
    }
    const exact = this.xIndexByValue.get(xValue);
    if (exact !== undefined) {
      return exact;
    }
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.xValues.forEach((x, index) => {
      const distance = Math.abs(x - xValue);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  /**
   * Checks if movement in the specified direction is possible from current position.
   * @param target - Direction or coordinate to check
   * @returns True if movement is possible, false otherwise
   */
  public override isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      // Array targets are raw cursor coordinates, used by
      // Context.restoreTracePosition to keep the user's position across
      // live data updates. A rebuilt trace always starts in COL mode, where
      // the cursor is (0, xIndex); ROW mode uses (yIndex, xIndex).
      const [row, col] = target;
      if (this.mode === NavMode.COL) {
        return row === 0 && col >= 0 && col < this.xPoints.length;
      }
      return row >= 0 && row < this.yPoints.length && col >= 0 && col < this.xPoints.length;
    }

    if (this.isInPointMode) {
      switch (target) {
        case 'FORWARD':
          return this.canStepPoint(this.readingPos, this.readingOrder, +1);
        case 'BACKWARD':
          return this.canStepPoint(this.readingPos, this.readingOrder, -1);
        case 'UPWARD':
          return this.canStepPoint(this.columnPos, this.columnOrder, -1);
        case 'DOWNWARD':
          return this.canStepPoint(this.columnPos, this.columnOrder, +1);
        default:
          return false;
      }
    }

    if (this.isInIntersectionMode) {
      const stackLength = this.getIntersectionStackValues().length;
      return target === 'FORWARD' || target === 'UPWARD'
        ? this.intersectionStackIndex < stackLength - 1
        : this.intersectionStackIndex > 0;
    }

    // Check grid cell boundaries. Autoplay gates on this before every step,
    // so it has to describe the cell's point list rather than the grid the
    // cell sits in. Horizontal-only, matching moveOnceInGridCellMode.
    if (this.isInGridCellMode) {
      switch (target) {
        case 'FORWARD':
          return this.cellPointIndex < this.cellXPoints.length - 1;
        case 'BACKWARD':
          return this.cellPointIndex > 0;
        default:
          return false;
      }
    }

    // Check grid mode boundaries
    if (this.isInGridMode && this.gridCells) {
      switch (target) {
        case 'FORWARD':
          return this.gridCol < this.numGridCols - 1;
        case 'BACKWARD':
          return this.gridCol > 0;
        case 'UPWARD':
          return this.gridRow < this.numGridRows - 1;
        case 'DOWNWARD':
          return this.gridRow > 0;
        default:
          return false;
      }
    }

    if (this.mode === NavMode.COL) {
      switch (target) {
        case 'FORWARD':
          return this.col < this.xPoints.length - 1;
        case 'BACKWARD':
          return this.col > 0;
        case 'UPWARD':
        case 'DOWNWARD':
          return true;
        default:
          return false;
      }
    } else {
      switch (target) {
        case 'UPWARD':
          return this.row < this.yPoints.length - 1;
        case 'DOWNWARD':
          return this.row > 0;
        case 'FORWARD':
        case 'BACKWARD':
          return true;
        default:
          return false;
      }
    }
  }

  // ── Grid navigation methods ───────────────────────────────────────────

  public setGridMode(enabled: boolean): void {
    if (!this.gridCells) {
      this.isInGridMode = false;
      return;
    }
    this.isInGridMode = enabled;
    if (enabled) {
      this.gridRow = 0;
      this.gridCol = 0;
    }
  }

  public override supportsCompareMode(): boolean {
    return false;
  }

  public override dataModeName(): string {
    return t('rotor.rowColMode');
  }

  public supportsGridMode(): boolean {
    return this.gridCells !== null;
  }

  public getGridDimensions(): { rows: number; cols: number } | null {
    if (!this.gridCells)
      return null;
    return { rows: this.numGridRows, cols: this.numGridCols };
  }

  public getGridPosition(): { row: number; col: number } | null {
    if (!this.gridCells)
      return null;
    // Return 1-indexed position for user display
    return { row: this.gridRow + 1, col: this.gridCol + 1 };
  }

  public moveGridUp(): boolean {
    if (!this.gridCells)
      return false;
    if (this.gridRow >= this.numGridRows - 1) {
      this.notifyOutOfBounds();
      return false;
    }
    this.gridRow++;
    this.notifyStateUpdate();
    return true;
  }

  public moveGridDown(): boolean {
    if (!this.gridCells)
      return false;
    if (this.gridRow <= 0) {
      this.notifyOutOfBounds();
      return false;
    }
    this.gridRow--;
    this.notifyStateUpdate();
    return true;
  }

  public moveGridLeft(): boolean {
    if (!this.gridCells)
      return false;
    if (this.gridCol <= 0) {
      this.notifyOutOfBounds();
      return false;
    }
    this.gridCol--;
    this.notifyStateUpdate();
    return true;
  }

  public moveGridRight(): boolean {
    if (!this.gridCells)
      return false;
    if (this.gridCol >= this.numGridCols - 1) {
      this.notifyOutOfBounds();
      return false;
    }
    this.gridCol++;
    this.notifyStateUpdate();
    return true;
  }

  // ── Grid cell point navigation ──────────────────────────────────────────

  /**
   * Checks if currently in grid cell mode (navigating points within a cell).
   */
  public isInCellMode(): boolean {
    return this.isInGridCellMode;
  }

  /**
   * Enters grid cell mode to navigate points within the current cell.
   * Groups cell points by X coordinate (like COL mode) for navigation.
   * @returns true if entered successfully, false if no points in cell
   */
  public enterGridCell(): boolean {
    if (!this.gridCells || !this.isInGridMode)
      return false;
    const cell = this.gridCells[this.gridRow][this.gridCol];
    if (cell.points.length === 0) {
      this.notifyOutOfBounds();
      return false;
    }

    // Build cellXPoints by grouping cell points by X (sorted by X, then Y)
    const pointsWithSvg = cell.points.map((p, i) => ({
      point: p,
      svg: cell.svgElements[i],
      index: cell.indices[i],
    }));
    const sorted = [...pointsWithSvg].sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);

    this.cellXPoints = [];
    this.cellSvgGroups = [];
    this.cellIndexGroups = [];
    let currentX: ScatterXPoint | null = null;
    let currentSvgGroup: SVGElement[] = [];
    let currentIndexGroup: number[] = [];

    for (const { point, svg, index } of sorted) {
      if (!currentX || currentX.x !== point.x) {
        if (currentX) {
          this.cellXPoints.push(currentX);
          this.cellSvgGroups.push(currentSvgGroup);
          this.cellIndexGroups.push(currentIndexGroup);
        }
        currentX = {
          x: point.x,
          y: [],
          z: [],
          label: nameOf(point.xLabel),
          yLabels: [],
          names: [],
        };
        currentSvgGroup = [];
        currentIndexGroup = [];
      }
      currentX.y.push(point.y);
      currentX.yLabels.push(nameOf(point.yLabel));
      currentX.names.push(nameOf(point.label));
      currentX.z.push(typeof point.z === 'number' ? point.z : Number.NaN);
      if (svg)
        currentSvgGroup.push(svg);
      // Unconditional, unlike the SVG push above: a canvas cell still knows
      // which points it holds.
      currentIndexGroup.push(index);
    }
    if (currentX) {
      this.cellXPoints.push(currentX);
      this.cellSvgGroups.push(currentSvgGroup);
      this.cellIndexGroups.push(currentIndexGroup);
    }

    this.isInGridCellMode = true;
    this.cellPointIndex = 0;
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Exits grid cell mode and returns to grid navigation.
   */
  public exitGridCell(): void {
    this.isInGridCellMode = false;
    this.cellPointIndex = 0;
    this.notifyStateUpdate();
  }

  /**
   * Moves to the previous point within the current grid cell.
   * @returns true if moved, false if at boundary
   */
  public moveCellPointLeft(): boolean {
    if (!this.gridCells || !this.isInGridCellMode)
      return false;
    if (this.cellPointIndex <= 0) {
      this.notifyOutOfBounds();
      return false;
    }
    this.cellPointIndex--;
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Moves to the next X-grouped point within the current grid cell.
   * @returns true if moved, false if at boundary
   */
  public moveCellPointRight(): boolean {
    if (!this.gridCells || !this.isInGridCellMode)
      return false;
    if (this.cellPointIndex >= this.cellXPoints.length - 1) {
      this.notifyOutOfBounds();
      return false;
    }
    this.cellPointIndex++;
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Gets the current point index within the cell (0-indexed).
   */
  public getCellPointIndex(): number {
    return this.cellPointIndex;
  }

  /**
   * Gets the total number of X-grouped points in the current grid cell.
   */
  public getCellPointCount(): number {
    if (!this.isInGridCellMode)
      return 0;
    return this.cellXPoints.length;
  }

  /**
   * Gets the current X-grouped point within the grid cell.
   */
  public getCurrentCellPoint(): ScatterXPoint | null {
    if (!this.isInGridCellMode || this.cellXPoints.length === 0)
      return null;
    return this.cellXPoints[this.cellPointIndex] ?? null;
  }

  // ── Intersection navigation (INTERSECTION_MODE) ───────────────────────

  /**
   * Mirrors LineTrace's intersection rule: the mode is offered only when
   * navigating across the data is meaningful. For scatter, that means a
   * stack exists on either axis — either an x with multiple ys (column
   * stack) or a y with multiple xs (row stack). Either base mode (COL / ROW)
   * can enter the rotor and cycle through its corresponding stack, so the
   * capability check is the OR of both.
   */
  public override supportsIntersectionMode(): boolean {
    return this.hasIntersectableStack;
  }

  /**
   * Called by the rotor service when entering / leaving INTERSECTION_MODE.
   * Preserve the active NavMode: entering from COL cycles through the
   * y-stack at the current x; entering from ROW cycles through the x-stack
   * at the current y. Force-switching modes here would silently re-anchor
   * the user on a different point set — the bug fixed by this commit.
   *
   * No notifyStateUpdate(): mirrors {@link setPointMode} and
   * {@link setGridMode}; the rotor announces the mode name and the next
   * arrow press emits the focused state.
   */
  public override setIntersectionMode(enabled: boolean): void {
    if (enabled === this.isInIntersectionMode) {
      return;
    }
    this.isInIntersectionMode = enabled;
    if (enabled) {
      this.intersectionStackIndex = 0;
      // See setPointMode: entering the mode anchors the cursor on a real
      // point, so the ROW_COL initial-entry handshake is spent. Assigning the
      // flag directly rather than calling handleInitialEntry() matters here —
      // that would reset row/col/mode and re-anchor the stack this mode walks.
      this.isInitialEntry = false;
    }
  }

  /**
   * Walks one step forward through the current stack — y values at the
   * current x in COL mode, x values at the current y in ROW mode. Returns
   * false at the top of the stack so the rotor can announce the boundary;
   * no chime (consistent with LineTrace's intersection bounds).
   */
  public override moveToNextIntersection(): boolean {
    return this.stepIntersection(+1);
  }

  /**
   * Walks one step backward through the current stack.
   */
  public override moveToPrevIntersection(): boolean {
    return this.stepIntersection(-1);
  }

  /**
   * Single-direction step for intersection mode. Resolves the current stack
   * based on NavMode, then walks it. Clamps the index first so an externally
   * changed col/row doesn't read out of bounds.
   */
  private stepIntersection(delta: -1 | 1): boolean {
    if (!this.isInIntersectionMode) {
      return false;
    }
    const stack = this.getIntersectionStackValues();
    if (stack.length === 0) {
      return false;
    }
    if (this.intersectionStackIndex >= stack.length) {
      this.intersectionStackIndex = stack.length - 1;
    }
    const next = this.intersectionStackIndex + delta;
    if (next < 0 || next >= stack.length) {
      return false;
    }
    this.intersectionStackIndex = next;
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Returns the raw numeric stack the intersection rotor is currently
   * walking. COL mode: y values at the current x. ROW mode: x values at the
   * current y. Empty array when the anchor index is out of range — callers
   * treat that as a bound condition.
   */
  private getIntersectionStackValues(): number[] {
    if (this.mode === NavMode.COL) {
      return this.xPoints[this.col]?.y ?? [];
    }
    return this.yPoints[this.row]?.x ?? [];
  }

  /**
   * The z values of the stack the intersection cursor is walking, index-aligned
   * with {@link getIntersectionStackValues}.
   *
   * @returns One z per point in the current stack; empty when the trace has no z
   */
  private getIntersectionStackZ(): number[] {
    if (this.mode === NavMode.COL) {
      return this.xPoints[this.col]?.z ?? [];
    }
    return this.yPoints[this.row]?.z ?? [];
  }

  /**
   * The category names of the stack the intersection cursor is walking,
   * index-aligned with {@link getIntersectionStackValues}.
   *
   * The stack holds the *cross* axis' values — a column's y in COL mode, a
   * row's x in ROW mode — so the names come from the matching label array.
   *
   * @returns One name per point in the current stack, `undefined` where the
   *   axis is continuous; empty when the cursor is out of bounds
   */
  private getIntersectionStackLabels(): (string | undefined)[] {
    if (this.mode === NavMode.COL) {
      return this.xPoints[this.col]?.yLabels ?? [];
    }
    return this.yPoints[this.row]?.xLabels ?? [];
  }

  /**
   * What each point of the stack *is*, index-aligned with the stack.
   *
   * The same array in both modes -- a point's name does not depend on which
   * axis the cursor came in on, unlike the *category* names, which are the
   * other axis' by construction.
   *
   * @returns One name per stacked point, `undefined` where it has none
   */
  private getIntersectionStackNames(): (string | undefined)[] {
    if (this.mode === NavMode.COL) {
      return this.xPoints[this.col]?.names ?? [];
    }
    return this.yPoints[this.row]?.names ?? [];
  }

  // ── Point navigation (POINT_MODE) ─────────────────────────────────────

  public override supportsPointMode(): boolean {
    return this.flatPoints.length > 0;
  }

  /**
   * Enters or exits point-by-point navigation mode.
   *
   * On entry, the current point is seeded from whatever ROW_COL position the
   * user was on so they keep their place in the data. When the previous mode
   * highlighted a group of points (e.g. a column of points sharing an x in
   * COL mode), we pick the first point in reading order from that group —
   * highest y for COL mode, lowest x for ROW mode.
   *
   * On exit, no state needs to be unwound; the existing row/col indices are
   * untouched while in point mode, so ROW_COL navigation resumes where it
   * left off.
   */
  public setPointMode(enabled: boolean): void {
    if (enabled === this.isInPointMode) {
      return;
    }
    this.isInPointMode = enabled;
    if (enabled) {
      this.pointModeIndex = this.computeEntryPointIndex();
      // Seeding the cursor IS the entry into the data, so consume the
      // initial-entry handshake here. Leaving it armed makes moveOnce swallow
      // autoplay's first tick — it takes the initial-entry branch, notifies
      // without moving, and replays the point the user is already standing on.
      this.isInitialEntry = false;
    }
  }

  public movePointLeft(): boolean {
    return this.stepPoint(this.readingPos, this.readingOrder, -1);
  }

  public movePointRight(): boolean {
    return this.stepPoint(this.readingPos, this.readingOrder, +1);
  }

  public movePointUp(): boolean {
    // columnOrder is sorted (x asc, y desc), so y-increasing within an
    // x-column means stepping backward in that order.
    return this.stepPoint(this.columnPos, this.columnOrder, -1);
  }

  public movePointDown(): boolean {
    return this.stepPoint(this.columnPos, this.columnOrder, +1);
  }

  /**
   * Walks one step in a sort order. Out-of-bounds notifies and returns false
   * without moving the index.
   */
  private stepPoint(positions: number[], order: number[], delta: -1 | 1): boolean {
    if (!this.isInPointMode || this.flatPoints.length === 0) {
      return false;
    }
    const pos = positions[this.pointModeIndex];
    const next = pos + delta;
    if (next < 0 || next >= order.length) {
      this.notifyOutOfBounds();
      return false;
    }
    this.pointModeIndex = order[next];
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Whether {@link stepPoint} would find a next point in this order.
   *
   * Shares its bounds test so autoplay's `isMovable` gate cannot drift from
   * the movement it gates.
   *
   * @param positions - Inverse lookup from flat index to sort position
   * @param order - The sort order being walked
   * @param delta - Step direction within that order
   * @returns True when a next point exists
   */
  private canStepPoint(positions: number[], order: number[], delta: -1 | 1): boolean {
    if (!this.isInPointMode || this.flatPoints.length === 0) {
      return false;
    }
    const next = positions[this.pointModeIndex] + delta;
    return next >= 0 && next < order.length;
  }

  /**
   * Picks the seed flat-point index for entering POINT_MODE based on the
   * current ROW_COL selection. The previous mode may have highlighted several
   * points at once (a whole x-column in COL mode, a whole y-row in ROW mode);
   * we pick the first of that group in reading order so the user starts at a
   * predictable corner of the highlighted region.
   */
  private computeEntryPointIndex(): number {
    let targetX: number;
    let targetY: number;
    if (this.mode === NavMode.COL) {
      // COL mode highlights every point at xPoints[col].x; first in reading
      // order at fixed x is the one with the highest y. xPoints[col].y is
      // sorted ascending in the constructor, so the last entry is the max.
      const group = this.xPoints[this.col];
      if (!group || group.y.length === 0) {
        return 0;
      }
      targetX = group.x;
      targetY = group.y[group.y.length - 1];
    } else {
      // ROW mode highlights every point at yPoints[row].y; first in reading
      // order at fixed y is the one with the lowest x. yPoints[row].x is
      // sorted ascending, so the first entry is the min.
      const group = this.yPoints[this.row];
      if (!group || group.x.length === 0) {
        return 0;
      }
      targetX = group.x[0];
      targetY = group.y;
    }
    // Exact equality is safe here, and deliberately so: both sides are the same
    // original data values copied into two groupings, never the result of any
    // arithmetic, so they are bit-for-bit identical. A tolerance would be the
    // riskier choice — it could match a neighbouring point at a nearby x.
    const idx = this.flatPoints.findIndex(p => p.x === targetX && p.y === targetY);
    return idx === -1 ? 0 : idx;
  }

  // ── Grid construction helpers ─────────────────────────────────────────

  /**
   * Resolves grid configuration from the layer's axes.
   *
   * Grid properties are read directly from each axis:
   * `axes.x = { min, max, tickStep }` and `axes.y = { min, max, tickStep }`.
   *
   * Returns null if any of the six required values is missing.
   */
  private resolveGridConfig(
    layer: MaidrLayer,
  ): { xMin: number; xMax: number; xTickStep: number; yMin: number; yMax: number; yTickStep: number } | null {
    const axes = layer.axes;
    if (!axes)
      return null;

    const xMin = axes.x?.min;
    const xMax = axes.x?.max;
    const xTickStep = axes.x?.tickStep;
    const yMin = axes.y?.min;
    const yMax = axes.y?.max;
    const yTickStep = axes.y?.tickStep;

    // All six values must be present for a valid grid config
    if (xMin == null || xMax == null || xTickStep == null || yMin == null || yMax == null || yTickStep == null) {
      return null;
    }

    // ...and describe a grid. A zero step over a positive range asks
    // `computeGridSteps` for `Infinity` bins, which it pushes until the tab
    // runs out of memory -- inside the constructor, so nothing can catch it.
    // A negative step or an inverted range yields the opposite, a grid with
    // no cell to enter. Neither is a grid, so neither advertises one.
    if (!this.isGridAxis(xMin, xMax, xTickStep) || !this.isGridAxis(yMin, yMax, yTickStep)) {
      return null;
    }

    // ...and a grid a reader can hold. `buildGridCells` allocates one cell
    // object with six arrays per row-column pair up front, so two axes that
    // each pass the per-axis bound on their own still multiply into a grid
    // whose construction is the same tab-freezing allocation, only reached
    // by their product rather than by either one.
    const cells = ((xMax - xMin) / xTickStep) * ((yMax - yMin) / yTickStep);
    if (cells > ScatterTrace.MAX_GRID_CELLS) {
      return null;
    }

    return { xMin, xMax, xTickStep, yMin, yMax, yTickStep };
  }

  /**
   * The most bins one axis may be cut into.
   *
   * A positive but tiny step is the same hang as a zero step, only slower:
   * `computeGridSteps` would build billions of finite bins in the
   * constructor. No reader navigates a grid that fine, so a step that asks
   * for more than this is read as not describing a grid at all.
   */
  private static readonly MAX_GRID_BINS = 10_000;

  /**
   * The most cells a grid may hold across both axes.
   *
   * Bounding each axis on its own is not enough: two bounds that each look
   * reasonable multiply, and it is the product that `buildGridCells`
   * allocates in one synchronous pass in the constructor.
   */
  private static readonly MAX_GRID_CELLS = 100_000;

  /**
   * Whether one axis's range and step can be cut into at least one bin.
   * @param min - The axis minimum
   * @param max - The axis maximum
   * @param tick - The bin width
   * @returns True when the values yield a finite, positive, bounded number of bins
   */
  private isGridAxis(min: number, max: number, tick: number): boolean {
    return Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(tick)
      && tick > 0 && max > min
      && (max - min) / tick <= ScatterTrace.MAX_GRID_BINS;
  }

  /**
   * Computes bin boundaries for one axis.
   * @returns Array of { min, max } ranges. Last bin extends to axisMax.
   */
  private computeGridSteps(
    axisMin: number,
    axisMax: number,
    tick: number,
  ): { min: number; max: number }[] {
    const steps: { min: number; max: number }[] = [];
    const numBins = Math.round((axisMax - axisMin) / tick);
    for (let i = 0; i < numBins; i++) {
      const binMin = axisMin + i * tick;
      const binMax = i === numBins - 1 ? axisMax : axisMin + (i + 1) * tick;
      steps.push({ min: Math.round(binMin * 1000) / 1000, max: Math.round(binMax * 1000) / 1000 });
    }
    return steps;
  }

  /**
   * Finds which bin index a value belongs to.
   * Uses half-open intervals [min, max) except the last bin which is [min, max].
   */
  private findGridBin(
    value: number,
    bins: { min: number; max: number }[],
  ): number {
    for (let i = 0; i < bins.length; i++) {
      if (i === bins.length - 1) {
        if (value >= bins[i].min && value <= bins[i].max)
          return i;
      } else {
        if (value >= bins[i].min && value < bins[i].max)
          return i;
      }
    }
    return -1;
  }

  /**
   * Builds the 2D grid of cells and bins data points into them.
   * Also maps SVG elements to grid cells by data point index correspondence.
   * @param data - The original (unsorted) scatter point data array
   * @param xSteps - X-axis bin boundaries
   * @param ySteps - Y-axis bin boundaries
   * @param svgClones - Pre-selected SVG element clones (index-matched to data array)
   */
  private buildGridCells(
    data: ScatterPoint[],
    xSteps: { min: number; max: number }[],
    ySteps: { min: number; max: number }[],
    svgClones: SVGElement[],
  ): GridCell[][] {
    // Initialize empty grid: gridCells[row][col]
    // Row 0 = lowest Y range, row N = highest Y range
    const grid: GridCell[][] = [];
    for (let r = 0; r < ySteps.length; r++) {
      grid[r] = [];
      for (let c = 0; c < xSteps.length; c++) {
        grid[r][c] = {
          points: [],
          yValues: [],
          xValues: [],
          zValues: [],
          svgElements: [],
          indices: [],
          xRange: xSteps[c],
          yRange: ySteps[r],
        };
      }
    }

    const hasElements = svgClones.length === data.length;

    // Bin each data point into the appropriate cell
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      const colIdx = this.findGridBin(point.x, xSteps);
      const rowIdx = this.findGridBin(point.y, ySteps);
      if (rowIdx !== -1 && colIdx !== -1) {
        grid[rowIdx][colIdx].points.push(point);
        grid[rowIdx][colIdx].yValues.push(point.y);
        grid[rowIdx][colIdx].xValues.push(point.x);
        grid[rowIdx][colIdx].zValues.push(typeof point.z === 'number' ? point.z : Number.NaN);
        // Not guarded by hasElements: the identity of a binned point does not
        // depend on the binder having drawn something we could select.
        grid[rowIdx][colIdx].indices.push(i);
        if (hasElements) {
          grid[rowIdx][colIdx].svgElements.push(svgClones[i]);
        }
      }
    }

    return grid;
  }

  // ── Existing private methods ──────────────────────────────────────────

  /**
   * Groups pre-selected SVG elements by their X and Y coordinates.
   * @param elements - Array of SVG element clones (already selected from the DOM)
   * @returns Tuple of SVG element arrays grouped by X and Y, or null arrays if empty
   */
  private groupSvgElements(
    elements: SVGElement[],
  ): [SVGElement[][], SVGElement[][]] | [null, null] {
    if (elements.length === 0) {
      return [null, null];
    }

    const xGroups = new Map<number, SVGElement[]>();
    const yGroups = new Map<number, SVGElement[]>();
    elements.forEach((element) => {
      let x = Number.parseFloat(element.getAttribute('x') || '');
      let y = Number.parseFloat(element.getAttribute('y') || '');

      // SVG circles use cx/cy instead of x/y (Google Charts uses circles)
      if (Number.isNaN(x) || Number.isNaN(y)) {
        const cx = element.getAttribute('cx');
        const cy = element.getAttribute('cy');
        if (cx && cy) {
          x = Number.parseFloat(cx);
          y = Number.parseFloat(cy);
        }
      }

      // Plotly uses transform="translate(x, y)" instead of x/y attributes
      if (Number.isNaN(x) || Number.isNaN(y)) {
        const transform = element.getAttribute('transform');
        if (transform) {
          const match = transform.match(
            /translate\s*\(\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)/,
          );
          if (match) {
            x = Number.parseFloat(match[1]);
            y = Number.parseFloat(match[2]);
          }
        }
      }

      // ECharts scales its symbols into place rather than moving them:
      // `matrix(s, 0, 0, s, e, f)`, where the symbol's own path is a unit
      // shape about the origin, so the mark's centre is `(e, f)` -- the last
      // two numbers, which is what a matrix translates by whatever the other
      // four are. Read before the `d` fallback below and not after, because
      // ECharts writes both: every symbol's `d` begins `M1 0`, so the
      // fallback would answer the same coordinate for every point on the
      // chart and group the whole scatter into one column.
      if (Number.isNaN(x) || Number.isNaN(y)) {
        const transform = element.getAttribute('transform');
        if (transform) {
          const match = transform.match(
            /matrix\s*\(\s*(?:[\d.eE+-]+[\s,]+){4}([\d.eE+-]+)[\s,]+([\d.eE+-]+)/,
          );
          if (match) {
            x = Number.parseFloat(match[1]);
            y = Number.parseFloat(match[2]);
          }
        }
      }

      // Highcharts (and other path-rendered marker libraries) embed the
      // marker center in the `d` attribute as `M x y …`. Parse the initial
      // moveTo command to recover (x, y) when none of the explicit attribute
      // fallbacks matched.
      if (Number.isNaN(x) || Number.isNaN(y)) {
        const d = element.getAttribute('d');
        if (d) {
          const match = d.match(/M\s*([\d.eE+-]+)[\s,]+([\d.eE+-]+)/);
          if (match) {
            x = Number.parseFloat(match[1]);
            y = Number.parseFloat(match[2]);
          }
        }
      }

      if (!Number.isNaN(x)) {
        if (!xGroups.has(x))
          xGroups.set(x, []);
        xGroups.get(x)!.push(element);
      }

      if (!Number.isNaN(y)) {
        if (!yGroups.has(y))
          yGroups.set(y, []);
        yGroups.get(y)!.push(element);
      }
    });

    const sortedXElements = Array.from(xGroups.entries())
      .sort(([x1], [x2]) => x1 - x2)
      .map(([_, elements]) => elements);
    const sortedYElements = Array.from(yGroups.entries())
      .sort(([y1], [y2]) => y2 - y1)
      .map(([_, elements]) => elements);

    return [sortedXElements, sortedYElements];
  }

  /**
   * Converts SVG elements to center coordinates for proximity-based navigation.
   * @returns Array of center points with coordinates and indices, or null if unavailable
   */
  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const svgElements: (SVGElement | SVGElement[])[][] | null = this.highlightXValues;

    if (!svgElements) {
      return null;
    }

    const centers: {
      x: number;
      y: number;
      row: number;
      col: number;
      element: SVGElement;
    }[] = [];
    for (let row = 0; row < svgElements.length; row++) {
      for (let col = 0; col < svgElements[row].length; col++) {
        const element = svgElements[row][col];
        const targetElement = Array.isArray(element) ? element[0] : element;
        if (targetElement) {
          const bbox = targetElement.getBoundingClientRect();
          centers.push({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
            row,
            col,
            element: targetElement,
          });
        }
      }
    }

    return centers;
  }

  /**
   * Finds the nearest scatter point to the given screen coordinates.
   * @param _x - The x-coordinate in screen space
   * @param _y - The y-coordinate in screen space
   * @returns The nearest point with its element and indices, or null if unavailable
   */
  public findNearestPoint(
    _x: number,
    _y: number,
  ): NearestPoint | null {
    // Rebuild stale centers lazily: scroll/resize invalidated the cached
    // viewport coordinates (see stopViewportWatch).
    if (this.highlightCentersDirty) {
      this.highlightCenters = this.mapSvgElementsToCenters();
      this.highlightCentersDirty = false;
    }

    // loop through highlightCenters to find nearest point
    if (!this.highlightCenters) {
      return null;
    }

    let nearestDistance = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < this.highlightCenters.length; i++) {
      const center = this.highlightCenters[i];
      const distance = Math.hypot(center.x - _x, center.y - _y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    if (nearestIndex === -1) {
      return null;
    }

    return {
      element: this.highlightCenters[nearestIndex].element,
      row: this.highlightCenters[nearestIndex].row,
      col: this.highlightCenters[nearestIndex].col,
      centerX: this.highlightCenters[nearestIndex].x,
      centerY: this.highlightCenters[nearestIndex].y,
    };
  }

  /**
   * Switches scatter into column-navigation mode only when committing the
   * hovered point. Off-curve guidance probes intentionally skip the mode
   * change: `moveToPointAndGetPointerGuidance` fires on every pointermove,
   * and an unconditional reset would silently erase a `ROW` mode the user
   * set via keyboard while exploring nearby.
   */
  /**
   * Reads state at an explicit cursor, with the trace-local navigation modes
   * suspended for the duration.
   *
   * `getStateAt` moves row/col and reads the state getters, but point,
   * intersection and grid mode short-circuit those getters onto their own
   * cursor — so a live-appended point would be announced as whichever point
   * or cell the user happens to be focused on. Suspending the flags makes the
   * read positional again, which is what every caller of this method asks for.
   *
   * @param row - Row index to read at
   * @param col - Column index to read at
   * @returns The trace state at that position
   */
  public override getStateAt(row: number, col: number): TraceState {
    const wasInPointMode = this.isInPointMode;
    const wasInIntersectionMode = this.isInIntersectionMode;
    const wasInGridMode = this.isInGridMode;
    const wasInGridCellMode = this.isInGridCellMode;
    this.isInPointMode = false;
    this.isInIntersectionMode = false;
    this.isInGridMode = false;
    this.isInGridCellMode = false;
    try {
      return super.getStateAt(row, col);
    } finally {
      this.isInPointMode = wasInPointMode;
      this.isInIntersectionMode = wasInIntersectionMode;
      this.isInGridMode = wasInGridMode;
      this.isInGridCellMode = wasInGridCellMode;
    }
  }

  protected override moveToNearest(
    _x: number,
    _y: number,
    nearest: NearestPoint,
    onCurve: boolean,
  ): void {
    if (!onCurve) {
      return;
    }
    // Point and intersection mode own the cursor. Re-anchoring the base
    // row/col from a hover would swap the stack — or NavMode — out from under
    // the user while the state getters keep reading the mode's own index, so a
    // mouse twitch would re-announce an unchanged point against changed data.
    if (this.isInPointMode || this.isInIntersectionMode) {
      return;
    }
    this.mode = NavMode.COL;
    // highlightCenters stores the x-group index in `row`; feed it as the
    // column argument so moveToIndex (COL mode: col = x index) lands on the
    // hovered x position. Calling moveToIndex directly rather than delegating
    // to super avoids the base early-return guard, which compares against the
    // wrong fields for scatter's (mode, row, col) coordinate system.
    this.moveToIndex(0, nearest.row);
  }
}
