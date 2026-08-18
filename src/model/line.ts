import type { ExtremaTarget } from '@type/extrema';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection, Node } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, DescriptionState, TextState, TraceState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace, named } from './abstract';
import { isMeasured, toBarValue } from './bar';
import { MovableGraph } from './movable';

const TYPE = 'Group';
/**
 * Splits a path `d` attribute into commands, each with its argument text.
 *
 * `A`/`a` is listed here but absent from {@link SVG_PATH_ARITY}, so an arc is
 * recognised and then skipped. Both halves matter. It has to be *recognised*
 * because the argument group runs to the next command letter: leaving `A` out
 * of the class would sweep an arc's flags and coordinates into the preceding
 * command's arguments, where they are consumed as further repetitions of that
 * command's arity. Measured on `M 0 0 L 10 10 A 5 5 0 0 1 20 20 L 30 30`,
 * that fabricated three vertices — `(5,5)`, `(0,0)`, `(1,20)` — rather than
 * leaving the arc merely unread.
 *
 * It is then *skipped* because an arc's flag arguments are legally written
 * without separators — `a1 1 0 011 1` is three flags and a coordinate pair —
 * so a plain number scan cannot tell where the endpoint starts. That leaves
 * the current point stale across an arc, which only misplaces a *relative*
 * command that follows one; line-family geometry contains neither.
 */
const SVG_PATH_COMMAND_REGEX = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;

/** One number of a path argument list, including exponent notation. */
const SVG_PATH_NUMBER_REGEX = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/**
 * How many numbers each path command takes per repetition.
 *
 * A command may carry several repetitions in one argument list — `L1 2 3 4`
 * is two linetos — so the arity is what the argument list is walked in.
 *
 * `Z` and `A` are absent, and an absent entry contributes no vertices: the
 * walk's bound is `i + arity <= args.length`, and `undefined` makes that
 * comparison false at once. `Z` is handled before the lookup because it still
 * moves the pen; `A` is not, for the reason
 * {@link SVG_PATH_COMMAND_REGEX} gives.
 */
const SVG_PATH_ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
};

/**
 * Read the uncertainty band a sample carries, when it carries one.
 *
 * Spread into the text state rather than assigned, so a point with no bounds
 * produces no `interval` key at all — the text service branches on the field
 * being present, and an `{}` would announce an empty clause.
 *
 * Only finite bounds count. A producer that fills the columns with `NaN` for
 * the samples outside its fit is describing a curve with no band there, and
 * announcing "interval NaN to NaN" would be worse than saying nothing.
 *
 * @param point - The sample under the cursor
 * @returns A spreadable `{ interval }`, or nothing
 */
function intervalOf(point: LinePoint): { interval?: { min?: number; max?: number } } {
  const min = Number.isFinite(point.yMin) ? point.yMin : undefined;
  const max = Number.isFinite(point.yMax) ? point.yMax : undefined;
  if (min === undefined && max === undefined) {
    return {};
  }
  return { interval: { min, max } };
}

/**
 * Represents a line trace plot with support for single and multi-line navigation
 */
export class LineTrace extends AbstractTrace {
  protected get values(): number[][] {
    return this.lineValues;
  }

  protected readonly supportsExtrema = true;
  protected readonly rotorSupport = true;
  protected readonly movable;

  protected readonly points: LinePoint[][];
  protected readonly lineValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  protected readonly min: number[];
  protected readonly max: number[];

  // Track previous row for intersection label ordering
  private previousRow: number | null = null;

  // Cache for intersection results, keyed by row index
  // Invalidated when active row changes
  private intersectionCache: Map<number, Array<{
    pointIndex: number;
    x: number;
    y: number;
    intersectingLines: number[];
    intersectionKind: 'point' | 'slope';
  }>> = new Map();

  // Single-entry memo for findIntersections(), keyed by the active (row, col).
  // moveOnce and the audio/text/state getters each request the intersections
  // for the same position several times per notifyStateUpdate; caching the
  // last position keeps the O(lines x points) exact-match scan to once per
  // move. The trace is rebuilt on live-data updates, so instance-level caching
  // stays correct across appends.
  private currentIntersectionsCache: { key: string; value: AudioState[] } | null = null;

  // highlightCenters holds viewport coordinates from getBoundingClientRect(),
  // which shift when the page scrolls or the window resizes. Rather than
  // recompute every rect on each pointermove, mark the cache stale on
  // scroll/resize and rebuild it lazily on the next hover (findNearestPoint).
  private highlightCentersDirty = false;

  private readonly invalidateHighlightCenters = (): void => {
    this.highlightCentersDirty = true;
  };

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as LinePoint[][];

    // `toBarValue` rather than `Number`, for the reason its own docstring
    // gives: `Number(null)` is `0`, which makes a gap indistinguishable from a
    // point genuinely measured at zero. It would sound like a real low
    // reading, be reachable as the row's minimum, and pull the range every
    // other point's pitch is scaled against. `NaN` keeps it absent, which is
    // what the audio and text services already read as missing (#925).
    //
    // Imported from `bar.ts` because that is where the convention lives and
    // where it is documented; `PieTrace`, `FunnelTrace`, `DivergingTrace` and
    // `SegmentedTrace` all reach for it the same way.
    this.lineValues = this.points.map(row =>
      row.map(point => toBarValue(point.y)),
    );
    // Gaps are filtered out of the range rather than filtered in: `Math.min`
    // of anything containing `NaN` is `NaN`, which would leave every point in
    // the row with a non-finite range to be scaled against and silence the
    // whole series rather than the one gap.
    this.min = this.lineValues.map(row => MathUtil.safeMin(row.filter(isMeasured)));
    this.max = this.lineValues.map(row => MathUtil.safeMax(row.filter(isMeasured)));

    // `layer.selectors` is `string | string[] | ...` per the schema. When a
    // single-line binder (e.g. the D3 smooth/line binders) emits a bare
    // string, wrap it in an array so the per-line length check inside
    // `mapToSvgElements` (`selectors.length !== this.lineValues.length`)
    // compares array length to line count, not character count.
    const normalizedSelectors: string[] | undefined = typeof layer.selectors === 'string'
      ? [layer.selectors]
      : (layer.selectors as string[] | undefined);
    this.highlightValues = this.mapToSvgElements(normalizedSelectors);
    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovableGraph(this.buildGraph());

    // Invalidate the cached pointer-hover centers when the viewport moves.
    // Capture phase catches scrolling of any ancestor container, not just window.
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.invalidateHighlightCenters, true);
      window.addEventListener('resize', this.invalidateHighlightCenters);
    }
  }

  /**
   * Resolves the z label: honor the user-provided spec label, otherwise fall
   * back to the LineTrace-specific default ("Group") rather than the generic
   * "Level" inherited from `AbstractTrace`.
   *
   * Reads the layer rather than `this.z`, so it needs `named` for itself:
   * the blank-label fallback `AbstractTrace` applies to `this.z` does not
   * reach a label resolved here.
   */
  private get groupLabel(): string {
    return named(this.layer.axes?.z?.label, this.groupFallbackLabel);
  }

  /**
   * What this chart calls one of its series, when the layer names no z axis.
   *
   * Overridable for the reason {@link LineTrace.seriesLabels} is: a subclass
   * navigates the same grid but draws something else, and this label is
   * announced literally beside the series' own name. A chart that named its
   * own noun everywhere else and then said "Group is Honda Civic" -- or
   * "Group is Ash" -- would use two words for one referent in a single
   * sentence.
   *
   * @returns The fallback label
   */
  protected get groupFallbackLabel(): string {
    return TYPE;
  }

  /**
   * Name a line carries in the spec, or `undefined` when the data authors
   * none. Consumers that have nothing meaningful to say without a real name
   * (e.g. the position announcement) can then stay silent about groups.
   *
   * Protected for the same reason {@link LineTrace.groupNameAt} is: a subclass
   * that names its series from its own data -- a contour from its level --
   * still has to answer for a series the layer named and nothing else did, and
   * calling `groupNameAt` for that would recurse.
   */
  protected authoredGroupNameAt(row: number): string | undefined {
    const authored = this.points[row]?.[0]?.z;
    return authored === undefined || authored === null || authored === ''
      ? undefined
      : String(authored);
  }

  /**
   * Human-readable name of a single line: the authored name when the spec
   * provides one, otherwise a positional fallback ("Line 2").
   *
   * Protected rather than private because a subclass naming a series in its
   * own description -- which competitor led, which observation is an outlier
   * -- has to name it the way every other announcement does, and reaching for
   * `points[row][0].z` directly would skip the fallback and report
   * `undefined` for an unnamed series.
   */
  protected groupNameAt(row: number): string {
    return this.authoredGroupNameAt(row) ?? `Line ${row + 1}`;
  }

  /**
   * Label and name of the line the cursor sits on. Resolved from the row
   * rather than from `text.z`, which is replaced by the intersection summary
   * when several lines meet at the current point.
   */
  private get currentGroup(): { label: string; value: string } | undefined {
    const value = this.authoredGroupNameAt(this.row);
    return value === undefined ? undefined : { label: this.groupLabel, value };
  }

  /**
   * Gets the line series with human-readable labels. Used by the candlestick
   * delta feature to list reference-line candidates (e.g., moving averages).
   * @returns One entry per series with its label and points
   */
  public getSeries(): { label: string; points: readonly LinePoint[] }[] {
    return this.points.map((line, index) => ({
      label: String(
        line[0]?.z
        ?? (this.points.length > 1 ? `Line ${index + 1}` : this.title),
      ),
      points: line,
    }));
  }

  /**
   * What this chart calls its series and its samples, in the description.
   *
   * A subclass navigates the same grid but draws something else, and the
   * description dialog renders these labels literally -- so a radar inheriting
   * "Number of lines" tells a reader they are on a chart they are not, which
   * is the same problem the spoken plot type is overridden to avoid.
   *
   * Defaulted to the line's own wording, so nothing changes for the chart this
   * class is named after.
   *
   * @returns The four labels the description uses
   */
  protected get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: 'Number of lines',
      perSeries: 'Points per line',
      names: 'Line names',
      column: 'Line',
    };
  }

  /**
   * Gets the description state for the line trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    const isMultiline = this.points.length > 1;
    const labels = this.seriesLabels;

    const stats: DescriptionState['stats'] = [
      { label: labels.count, value: this.points.length },
      { label: labels.perSeries, value: this.points[0].length },
      { label: 'Min value', value: MathUtil.safeMin(this.min) },
      { label: 'Max value', value: MathUtil.safeMax(this.max) },
    ];

    if (isMultiline) {
      const lineNames = this.points
        .map((_line, i) => this.groupNameAt(i))
        .join(', ');
      stats.push({ label: labels.names, value: lineNames });
    }

    // How wide the uncertainty gets, when the chart draws any. That is what
    // the per-sample statistics above cannot show: `Min value` and `Max value`
    // describe the fitted curve, not the band around it, so a reader opening
    // the description of a regression chart would otherwise learn nothing
    // about how well determined it is.
    const widths = this.points
      .flat()
      .map(point => Number(point.yMax) - Number(point.yMin))
      .filter(width => Number.isFinite(width));
    if (widths.length > 0) {
      stats.push(
        { label: 'Narrowest interval', value: MathUtil.safeMin(widths) },
        { label: 'Widest interval', value: MathUtil.safeMax(widths) },
      );
    }

    let headers: string[];
    let rows: (string | number)[][];

    if (isMultiline) {
      headers = [this.xAxis, this.yAxis, labels.column];
      rows = this.points.flatMap((line, i) => {
        const lineName = this.groupNameAt(i);
        // A gap prints as an empty cell rather than as a number it does
        // not have; `TextService` names it "missing" when spoken.
        return line.map(p => [p.x, p.y ?? '', lineName]);
      });
    } else {
      headers = [this.xAxis, this.yAxis];
      rows = this.points[0].map(p => [p.x, p.y ?? '']);
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  public override dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.invalidateHighlightCenters, true);
      window.removeEventListener('resize', this.invalidateHighlightCenters);
    }

    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  private buildGraph(): (Node | null)[][] {
    const rowCount = this.points.length;
    if (rowCount === 0) {
      return new Array<Array<Node | null>>();
    }

    const maxCols = Math.max(0, ...this.points.map(row => row.length));
    const graph: (Node | null)[][] = this.points.map(row =>
      row.map(() => ({ up: null, down: null, left: null, right: null, top: null, bottom: null, start: null, end: null })),
    );

    for (let c = 0; c < maxCols; c++) {
      const pointsAtCol = this.points
        .map((row, idx) => ({ y: row[c]?.y, row: idx }))
        .filter(p => p.y !== undefined);
      if (pointsAtCol.length === 0) {
        continue;
      }

      // Gaps take no part in the ordering: there is no magnitude to rank
      // them by, and `null - null` would sort them somewhere arbitrary and
      // then report one as the column's top or bottom.
      const measured = pointsAtCol.filter(p => p.y !== null);
      if (measured.length === 0) {
        continue;
      }
      const sortedPoints = [...measured].sort((a, b) => a.y! - b.y!);
      const bottom = { row: sortedPoints[0].row, col: c };
      const top = { row: sortedPoints[sortedPoints.length - 1].row, col: c };
      for (let i = 0; i < sortedPoints.length; i++) {
        const { row } = sortedPoints[i];
        const node = graph[row][c];
        if (!node) {
          continue;
        }

        i > 0 && (node.down = { row: sortedPoints[i - 1].row, col: c });
        i < sortedPoints.length - 1 && (node.up = { row: sortedPoints[i + 1].row, col: c });
        node.bottom = bottom;
        node.top = top;
      }
    }

    for (let r = 0; r < rowCount; r++) {
      const start = this.points[r].length > 0 ? { row: r, col: 0 } : null;
      const end = this.points[r].length > 0
        ? { row: r, col: this.points[r].length - 1 }
        : null;

      for (let c = 0; c < this.points[r].length; c++) {
        const node = graph[r][c];
        if (!node) {
          continue;
        }

        c > 0 && (node.left = { row: r, col: c - 1 });
        c < this.points[r].length - 1 && (node.right = { row: r, col: c + 1 });
        node.start = start;
        node.end = end;
      }
    }

    return graph;
  }

  /**
   * Where a cell sits in the stereo field.
   *
   * Split out because two places need it and they must agree: the tone for the
   * cursor's own point, and the tones of every series a chord sounds at an
   * intersection. A subclass that hears its columns somewhere other than a
   * straight left-to-right sweep -- a radar's spokes go out and back around a
   * circle -- overrides this one method and both follow, rather than one of
   * them keeping the line's sweep and contradicting the other.
   *
   * @param row - The series index
   * @param col - The column index
   * @returns The panning for that cell
   */
  protected panningFor(row: number, col: number): AudioState['panning'] {
    return {
      x: col,
      y: row,
      rows: this.lineValues.length,
      cols: this.lineValues[row].length,
    };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min[this.row],
        max: this.max[this.row],
        raw: this.lineValues[this.row][this.col],
      },
      panning: this.panningFor(this.row, this.col),
      group: this.row,
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.lineValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.points[this.row][this.col];

    // Check for intersections at current point
    const intersections = this.findIntersections();
    let zData:
      | { z: { label: string; value: string } }
      | Record<string, never> = {};

    const zLabel = this.groupLabel;

    if (intersections.length > 1) {
      // Multiple lines intersect - create intersection text
      let lineTypes = intersections.map((intersection) => {
        const lineIndex = intersection.group!;
        return this.points[lineIndex][0]?.z || `l${lineIndex + 1}`;
      });

      // If previousRow is in the intersection, put its label first
      if (this.previousRow !== null) {
        const prevZ
          = this.points[this.previousRow][0]?.z || `l${this.previousRow + 1}`;
        if (lineTypes.includes(prevZ)) {
          lineTypes = [prevZ, ...lineTypes.filter(l => l !== prevZ)];
        }
      }

      zData = {
        z: {
          label: zLabel,
          value: `intersection at (${lineTypes.join(', ')})`,
        },
      };
    } else {
      // Single line or no intersection - use normal z data
      zData = point.z ? { z: { label: zLabel, value: point.z } } : {};
    }

    // An ordinal y travels as a numeric level plus the level's name: `y` has
    // to stay numeric because it drives sonification, braille and the range,
    // so the human-readable name rides alongside as `label`. Announce the name
    // when there is one, and the number otherwise — which is the right reading
    // for the continuous y that most line charts have.
    // `lineValues`, not `point.y`: identical for every measured point, and
    // `NaN` for a gap, which `TextService.formatSingleValue` already announces
    // as "missing". Reading `point.y` here would hand it a `null` instead —
    // which it also names correctly, but only because the text layer is
    // tolerant, and the two would then disagree with what audio and braille
    // were given.
    const label = point.label;
    const value = this.lineValues[this.row][this.col];
    const crossValue = label === undefined || label === '' ? value : label;

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: crossValue },
      ...zData,
      ...intervalOf(point),
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.lineValues.length,
      cols: this.lineValues[this.row]?.length ?? 0,
    };
  }

  public override moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
      this.previousRow = null;
      this.notifyStateUpdate();
      return true;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return false;
    }

    // Store previous row before moving
    this.previousRow = this.row;

    // Enhanced navigation for UPWARD/DOWNWARD - consider y values at current x position
    if (direction === 'UPWARD' || direction === 'DOWNWARD') {
      const targetRow = this.findLineByXAndYDirection(direction);
      const currentX = this.points[this.row][this.col].x;

      if (targetRow !== null && targetRow !== this.row) {
        // Find the column in the target line that has the same X value
        const targetCol = this.findColumnByXValue(targetRow, currentX);

        if (targetCol !== -1) {
          this.row = targetRow;
          this.col = targetCol;

          // Check for intersections and emit appropriate state
          const intersections = this.findIntersections();
          if (intersections.length > 1) {
            const baseState = super.state;
            const stateWithIntersections = {
              ...baseState,
              intersections,
            } as TraceState;
            for (const observer of this.observers) {
              observer.update(stateWithIntersections);
            }
          } else {
            this.notifyStateUpdate();
          }
          return true;
        } else {
          // No matching X value found in target line
          this.notifyOutOfBounds();
          return false;
        }
      } else {
        // No valid line found based on y values - hit boundary
        this.notifyOutOfBounds();
        return false;
      }
    }

    // Default navigation for FORWARD/BACKWARD only
    switch (direction) {
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }

    // Check for intersections and emit appropriate state
    const intersections = this.findIntersections();
    if (intersections.length > 1) {
      const baseState = super.state;
      const stateWithIntersections = {
        ...baseState,
        intersections,
      } as TraceState;
      for (const observer of this.observers) {
        observer.update(stateWithIntersections);
      }
    } else {
      this.notifyStateUpdate();
    }
    return true;
  }

  /**
   * Helper function to find all lines that intersect at the current (x, y) position
   * @returns Array of AudioState for all intersecting lines
   */
  private findIntersections(): AudioState[] {
    // A crossing requires at least two lines; single-line charts can never
    // produce one, so skip the O(points) scan entirely.
    if (this.points.length < 2) {
      return [];
    }

    // Reuse the last result while the cursor stays on the same point — the
    // exact-match scan is deterministic for a fixed (row, col) and immutable
    // data, so the value cannot change between the repeated calls per move.
    const key = `${this.row},${this.col}`;
    if (this.currentIntersectionsCache && this.currentIntersectionsCache.key === key) {
      return this.currentIntersectionsCache.value;
    }

    const currentX = this.points[this.row][this.col].x;
    const currentY = this.points[this.row][this.col].y;
    const intersections: AudioState[] = [];

    for (let r = 0; r < this.points.length; r++) {
      const c = this.points[r].findIndex(
        p => p.x === currentX && p.y === currentY,
      );
      if (c !== -1) {
        intersections.push(
          {
            freq: {
              min: this.min[r],
              max: this.max[r],
              raw: toBarValue(currentY),
            },
            // The cursor's own cell, not series `r`'s -- an intersection is
            // one point that several series share, so every tone in the chord
            // has to arrive from the same place. `group: r` is what tells them
            // apart.
            panning: this.panningFor(this.row, this.col),
            group: r,
          },
        );
      }
    }

    this.currentIntersectionsCache = { key, value: intersections };
    return intersections;
  }

  public override isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      return (
        row >= 0
        && row < this.values.length
        && col >= 0
        && col < this.values[row].length // Fixed: use target row instead of current row
      );
    }

    switch (target) {
      case 'UPWARD':
      case 'DOWNWARD': {
        // For y-value-based navigation, check if there's a valid target line with same X value
        const targetRow = this.findLineByXAndYDirection(target);
        if (targetRow === null) {
          return false;
        }
        // Also check if the target line has a point with the same X value
        const currentX = this.points[this.row][this.col].x;
        return this.findColumnByXValue(targetRow, currentX) !== -1;
      }
      case 'FORWARD':
        return this.col < this.values[this.row].length - 1;
      case 'BACKWARD':
        return this.col > 0;
    }
  }

  /**
   * Finds a line with the same X value but Y value in the desired direction
   * Uses strict equality (===) for X value matching
   * @param direction The direction to search (UPWARD for higher Y values, DOWNWARD for lower Y values)
   * @returns The row index of the target line, or null if no suitable line is found
   */
  private findLineByXAndYDirection(
    direction: 'UPWARD' | 'DOWNWARD',
  ): number | null {
    const currentX = this.points[this.row][this.col].x;

    let bestRow: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    // Check all lines for points with the same X value
    for (let row = 0; row < this.points.length; row++) {
      // Skip current row
      if (row === this.row) {
        continue;
      }

      // Find the point in this line with the EXACT same X value (strict equality)
      const matchingPointIndex = this.points[row].findIndex((point) => {
        const matches = point.x === currentX;
        return matches;
      });

      if (matchingPointIndex === -1) {
        // No point with this exact X value in this line - skip navigation to this line
        continue;
      }

      const lineY = this.points[row][matchingPointIndex].y;
      const cursorY = this.points[this.row][this.col].y;

      // Neither end of the comparison can be a gap. "The nearest line above
      // this one" is a question about two magnitudes, and a sample with no
      // reading is not above or below anything -- `null > n` is false and
      // `null < n` is true, so leaving it in would make every gap look like a
      // candidate in one direction and rank it at distance `n` from nothing.
      if (lineY === null || cursorY === null) {
        continue;
      }

      // Check if this line's y value is in the desired direction
      const isValidDirection
        = direction === 'UPWARD' ? lineY > cursorY : lineY < cursorY;
      const distance = Math.abs(lineY - cursorY);

      if (!isValidDirection) {
        continue;
      }

      // Update best candidate if this is closer
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRow = row;
      }
    }

    return bestRow;
  }

  /**
   * Finds the column index for a given X value in a specific line
   * Uses strict equality (===) for X value matching
   * @param row The line index
   * @param xValue The X value to find
   * @returns The column index, or -1 if not found
   */
  private findColumnByXValue(row: number, xValue: number | string): number {
    return this.points[row].findIndex(point => point.x === xValue);
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    // Try element-based approach first (e.g. Recharts individual dot circles).
    // If the selector matches multiple DOM elements whose count equals the
    // expected data points, use them directly — no path parsing needed.
    const elementBased = this.mapViaDomElements(selectors);
    // Fall back to path-based approach: parse coordinates from a single
    // <path> or <polyline> element per series and create synthetic circles.
    const mapped = elementBased ?? this.mapViaPathParsing(selectors);

    return this.drawsPointsReversed && mapped !== null
      ? mapped.map(row => [...row].reverse())
      : mapped;
  }

  /**
   * Whether the chart draws this layer's points in the opposite order from the
   * one the payload lists them in.
   *
   * Both mappers above hand back one element per point in the order the
   * library* drew them: a path's vertices come out in path order, and a
   * series' markers sit in the DOM in the order they were added. Neither
   * notices that a reversed axis put the first-listed point at the far end of
   * the chart. An adapter that has reversed its payload to read the chart the
   * way it is drawn says so with `domMapping.pointOrder`, and the two lists
   * are paired back up here (#1007).
   *
   * Reversing the resolved elements rather than the payload keeps this to the
   * highlight: the announcement, the pan and the braille all follow
   * `layer.data`, which the adapter has already put in drawn order.
   */
  private get drawsPointsReversed(): boolean {
    return this.layer.domMapping?.pointOrder === 'reverse';
  }

  /**
   * Element-based SVG mapping: select all matching elements per selector
   * and use them directly for highlighting (like BarTrace does).
   * Works when the charting library renders individual dot/circle elements.
   */
  private mapViaDomElements(selectors: string[]): SVGElement[][] | null {
    const svgElements: SVGElement[][] = [];
    let allFailed = true;

    for (let r = 0; r < selectors.length; r++) {
      // Pass shouldClone=false so we DON'T mutate the DOM by inserting a
      // hidden clone after every match. Inserting a clone shifts
      // :nth-child(N) indices for subsequent iterations: a multi-series
      // line chart with sibling <path> elements in the same <g> ends up
      // with iteration r=1 matching the clone of path0 (instead of path1)
      // and r=2 matching the clone of clone of path0, etc. The downstream
      // mapViaPathParsing then reads series 0's `d` for every series, so
      // all highlights collapse onto series 0 even though navigation
      // announcement (which uses lineValues, not the DOM) is correct.
      // Highlighting always re-clones via Svg.createHighlightElement, so
      // we don't need the pre-cloned hidden elements.
      const elements = Svg.selectAllElements(selectors[r], false);
      if (elements.length === 0 || elements.length !== this.lineValues[r].length) {
        svgElements.push([]);
        continue;
      }
      allFailed = false;
      svgElements.push(elements);
    }

    return allFailed ? null : svgElements;
  }

  /**
   * Path-based SVG mapping: find a single <path> or <polyline> per selector,
   * parse data point coordinates from its attributes, and create synthetic
   * circle elements for highlighting.
   *
   * Supports M/L commands (linear paths) and C commands (cubic bezier curves).
   */
  private mapViaPathParsing(selectors: string[]): SVGElement[][] | null {
    const svgElements: SVGElement[][] = [];
    let allFailed = true;

    // Detect selector layout:
    //   - Standard case (e.g. matplotlib/seaborn multi-line): each series has
    //     a UNIQUE selector that resolves to exactly one <path> (e.g.
    //     "g[id='maidr-<uuid-A>'] path", "g[id='maidr-<uuid-B>'] path", ...).
    //   - Color-hue case (e.g. Vega-Lite single mark with a color encoding):
    //     all entries in `selectors` are IDENTICAL — Vega renders N sibling
    //     `<g class="mark-line role-mark layer_0_marks">` groups, each with
    //     exactly one `<path>`, so a single shared selector matches all N.
    // For the standard case, selectNthElement(selectors[r], r) would ask for
    // the r-th match of a selector that has only 1 match, returning null for
    // r >= 1 and crashing the highlight pipeline downstream. So branch on
    // selector uniqueness.
    const uniqueSelectors = new Set(selectors).size === selectors.length;

    for (let r = 0; r < selectors.length; r++) {
      const lineElement = uniqueSelectors
        ? Svg.selectElement(selectors[r], false)
        : Svg.selectNthElement(selectors[0], r);
      if (!lineElement) {
        svgElements.push([]);
        continue;
      }

      const coordinates: LinePoint[] = [];
      if (lineElement instanceof SVGPathElement) {
        const pathD = lineElement.getAttribute(Constant.D) || Constant.EMPTY;
        this.extractPathCoordinates(pathD, coordinates);
      } else if (lineElement instanceof SVGPolylineElement) {
        const pointsAttr
          = lineElement.getAttribute(Constant.POINTS) || Constant.EMPTY;
        const strCoords = pointsAttr.split(/\s+/).filter(Boolean);
        for (const coordinate of strCoords) {
          const [x, y] = coordinate.split(Constant.COMMA);
          coordinates.push({
            x: Number.parseFloat(x),
            y: Number.parseFloat(y),
          });
        }
      }
      this.reconcilePathCoordinates(coordinates, r);

      const linePointElements: SVGElement[] = [];
      let lineFailed = false;
      for (const coordinate of coordinates) {
        // `toBarValue` so a gap reaches the same branch a NaN already did:
        // there is no y to put a marker at. A series carrying one therefore
        // gets no synthesized highlight at all, which is the existing
        // behaviour for an unusable coordinate rather than a new limitation --
        // and only affects charts whose highlight maidr draws itself.
        const markerY = toBarValue(coordinate.y);
        if (Number.isNaN(Number(coordinate.x)) || !Number.isFinite(markerY)) {
          lineFailed = true;
          break;
        }
        linePointElements.push(
          Svg.createCircleElement(coordinate.x, markerY, lineElement),
        );
      }
      if (lineFailed) {
        svgElements.push([]);
        continue;
      }
      if (linePointElements.length > 0) {
        allFailed = false;
      }
      svgElements.push(linePointElements);
    }

    if (allFailed) {
      return null;
    }
    return svgElements;
  }

  /**
   * Reconciles the vertices parsed out of a rendered `<path>` with the number
   * of data points in a series, mutating `coordinates` in place so it ends up
   * one entry per data point in data order.
   *
   * SVG renderers (e.g. Plotly) may simplify a path by dropping collinear
   * vertices, leaving fewer coordinates than data points; those are recovered
   * by interpolating along the surviving segments. Extra vertices are dropped
   * from the end, which is right for a straight polyline whose vertices are
   * its data points — subclasses whose rendered geometry has vertices that are
   * not data points (see {@link StepTrace}) override this.
   * @param coordinates - Vertices parsed from the path, mutated in place
   * @param row - Index of the series these coordinates belong to
   */
  protected reconcilePathCoordinates(coordinates: LinePoint[], row: number): void {
    const expected = this.lineValues[row].length;
    if (coordinates.length === expected) {
      return;
    }

    if (coordinates.length >= 2 && coordinates.length < expected) {
      const pathXMin = Number(coordinates[0].x);
      const pathXMax = Number(coordinates[coordinates.length - 1].x);
      const dataPoints = this.points[row];
      const dataXMin = Number(dataPoints[0].x);
      const dataXMax = Number(dataPoints[dataPoints.length - 1].x);
      const dataXRange = dataXMax - dataXMin;

      const full: LinePoint[] = [];
      for (let i = 0; i < expected; i++) {
        const dataX = Number(dataPoints[i].x);
        const svgX = dataXRange > 0
          ? pathXMin + ((dataX - dataXMin) / dataXRange) * (pathXMax - pathXMin)
          : pathXMin;

        // Find y by interpolating along the simplified path segments
        let svgY = Number(coordinates[0].y);
        for (let j = 0; j < coordinates.length - 1; j++) {
          const cjx = Number(coordinates[j].x);
          const cj1x = Number(coordinates[j + 1].x);
          if (svgX >= cjx - 0.01 && svgX <= cj1x + 0.01) {
            const segLen = cj1x - cjx;
            const t = segLen > 0 ? (svgX - cjx) / segLen : 0;
            svgY = Number(coordinates[j].y) + t * (Number(coordinates[j + 1].y) - Number(coordinates[j].y));
            break;
          }
        }
        full.push({ x: svgX, y: svgY });
      }
      coordinates.length = 0;
      coordinates.push(...full);
    } else if (coordinates.length < expected) {
      while (coordinates.length < expected) {
        coordinates.push({ x: Number.NaN, y: Number.NaN });
      }
    } else {
      coordinates.length = expected;
    }
  }

  /**
   * Extracts data point coordinates from an SVG path `d` attribute.
   *
   * One vertex per drawing command, taken at that command's endpoint — which
   * for a curve is where it lands, not where its control points sit. The path
   * is walked rather than pattern-matched because the endpoint of `H`, `V`,
   * and every relative command is only defined against the current point,
   * which a regex over the whole string cannot know.
   *
   * That is what this used to be, and it left `H`/`V` unread. A staircase is
   * precisely the shape a renderer draws with them, every segment being
   * axis-aligned, so a Plotly step chart parsed to its single `M` and nothing
   * else: measured, `M0,399H246.67V147H493.33V273H740V21` yielded 1 vertex for
   * 4 samples. `reconcilePathCoordinates` then padded with `NaN`, the series
   * was marked failed, and `mapToSvgElements` returned null — correct audio,
   * braille and text, no highlight, and nothing anywhere saying why (#907).
   *
   * `M`, `L` and `C` behave exactly as they did; a cubic still contributes its
   * endpoint alone.
   *
   * @param pathD - The `d` attribute of the rendered path
   * @param coordinates - Vertex list to append to, mutated in place
   */
  private extractPathCoordinates(pathD: string, coordinates: LinePoint[]): void {
    let x = 0;
    let y = 0;
    // Where the current subpath began, which is where `Z` returns to.
    let startX = 0;
    let startY = 0;

    SVG_PATH_COMMAND_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null = SVG_PATH_COMMAND_REGEX.exec(pathD);
    while (match !== null) {
      const command = match[1];
      const absolute = command.toUpperCase();
      const isRelative = command !== absolute;
      const args = (match[2].match(SVG_PATH_NUMBER_REGEX) ?? []).map(Number);
      match = SVG_PATH_COMMAND_REGEX.exec(pathD);

      if (absolute === 'Z') {
        // A closepath draws back to a vertex already recorded, so it moves the
        // pen without adding a point. Emitting one would duplicate the start.
        x = startX;
        y = startY;
        continue;
      }

      const arity = SVG_PATH_ARITY[absolute];
      for (let i = 0; i + arity <= args.length; i += arity) {
        if (absolute === 'H') {
          x = isRelative ? x + args[i] : args[i];
        } else if (absolute === 'V') {
          y = isRelative ? y + args[i] : args[i];
        } else {
          // The endpoint is the last pair of every remaining command; the
          // control points before it are not on the drawn path.
          const endX = args[i + arity - 2];
          const endY = args[i + arity - 1];
          x = isRelative ? x + endX : endX;
          y = isRelative ? y + endY : endY;
        }

        // Only the first pair of a moveto starts a subpath; the repetitions
        // after it are implicit linetos, per the SVG path grammar.
        if (absolute === 'M' && i === 0) {
          startX = x;
          startY = y;
        }
        coordinates.push({ x, y });
      }
    }
  }

  public override get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty)
      return baseState;

    const isMultiline = this.points.length > 1;
    const group = isMultiline ? this.currentGroup : undefined;
    // Add the plotType field for non-empty states
    const stateWithPlotType = {
      ...baseState,
      plotType: isMultiline ? 'multiline' : 'single line',
      ...(isMultiline && { groupCount: this.points.length }),
      ...(group && { group }),
    };

    // Check for intersection at current (x, y)
    const intersections = this.findIntersections();
    if (intersections.length > 1) {
      return { ...stateWithPlotType, intersections };
    }
    return stateWithPlotType;
  }

  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const svgElements: (SVGElement | SVGElement[])[][] | null = this.highlightValues;

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

  public findNearestPoint(
    x: number,
    y: number,
  ): NearestPoint | null {
    // Rebuild stale centers lazily: scroll/resize invalidated the cached
    // viewport coordinates (see invalidateHighlightCenters).
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
      const distance = Math.hypot(center.x - x, center.y - y);
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
   * Check if two line segments intersect and return the intersection point
   * Uses parametric line intersection formula
   * @param p1 Start point of first segment
   * @param p1.x X coordinate of start point of first segment
   * @param p1.y Y coordinate of start point of first segment
   * @param p2 End point of first segment
   * @param p2.x X coordinate of end point of first segment
   * @param p2.y Y coordinate of end point of first segment
   * @param p3 Start point of second segment
   * @param p3.x X coordinate of start point of second segment
   * @param p3.y Y coordinate of start point of second segment
   * @param p4 End point of second segment
   * @param p4.x X coordinate of end point of second segment
   * @param p4.y Y coordinate of end point of second segment
   * @returns Intersection point {x, y} if segments intersect, null otherwise
   */
  private getSegmentIntersection(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ): { x: number; y: number } | null {
    const x1 = p1.x;
    const y1 = p1.y;
    const x2 = p2.x;
    const y2 = p2.y;
    const x3 = p3.x;
    const y3 = p3.y;
    const x4 = p4.x;
    const y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // Lines are parallel (no intersection or infinite intersections)
    if (Math.abs(denom) < 1e-10) {
      return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // Check if intersection is within both segments (t and u must be in [0, 1])
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const intersectX = x1 + t * (x2 - x1);
      const intersectY = y1 + t * (y2 - y1);
      return { x: intersectX, y: intersectY };
    }

    return null;
  }

  /** Tolerance for comparing intersection coordinates (for deduplication) */
  private static readonly INTERSECTION_EPSILON = 1e-6;

  /**
   * Lazily-built mapping from non-numeric x values (e.g. the date strings of
   * a candlestick moving-average layer) to ordinal positions on a shared x
   * domain. Lines may start/end at different offsets (a long-window moving
   * average starts later than a short-window one), so per-line column indices
   * are not comparable across lines; instead each line's x sequence is merged
   * into one ordered domain, preserving relative order. Built once per
   * instance — trace data is immutable (live-data updates rebuild the trace).
   *
   * Complexity: near-linear when lines are consistent subsequences of one
   * shared domain (the moving-average case — indexOf hits at the merge cursor
   * and splice appends). Lines that disagree on relative order degrade toward
   * O(points × domain) in the worst case; acceptable for a one-time build.
   */
  private xOrdinalMap: Map<string, number> | null = null;

  private getXOrdinalMap(): Map<string, number> {
    if (this.xOrdinalMap) {
      return this.xOrdinalMap;
    }

    const domain: string[] = [];
    const seen = new Set<string>();
    for (const line of this.points) {
      let insertAt = 0;
      for (const point of line) {
        const key = String(point.x);
        if (seen.has(key)) {
          // Already placed. If it sits at/after the merge cursor, advance
          // past it; if it sits before the cursor the lines disagree on
          // order — keep the earlier position.
          const existing = domain.indexOf(key, insertAt);
          if (existing !== -1) {
            insertAt = existing + 1;
          }
        } else {
          seen.add(key);
          domain.splice(insertAt, 0, key);
          insertAt += 1;
        }
      }
    }

    this.xOrdinalMap = new Map(domain.map((key, index) => [key, index]));
    return this.xOrdinalMap;
  }

  /**
   * Numeric x coordinate for intersection geometry. Numeric (or numeric
   * string) x values pass through unchanged; categorical values (e.g.
   * '2019-11-05') resolve to their ordinal position on the shared x domain so
   * segment-intersection math works on date/category axes too — Number()
   * alone yields NaN for them, which used to make every intersection check
   * fail. Mixing numeric and categorical x values across lines is
   * unsupported, matching the exact-match detection in findIntersections.
   * @param x The point's raw x value
   * @returns A finite coordinate, or NaN for an unknown value
   */
  private numericX(x: number | string): number {
    const numeric = Number(x);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    return this.getXOrdinalMap().get(String(x)) ?? Number.NaN;
  }

  /**
   * Find all points where the current line intersects with other lines
   * Uses line segment intersection algorithm to find crossings between data points
   * Results are cached per row and invalidated when the active row changes
   * @returns Array of intersection info containing nearest point index and intersecting line indices
   */
  private findAllIntersectionsForCurrentLine(): Array<{
    pointIndex: number;
    x: number;
    y: number;
    intersectingLines: number[];
    intersectionKind: 'point' | 'slope';
  }> {
    const currentGroup = this.row;

    // Return cached results if available
    if (this.intersectionCache.has(currentGroup)) {
      return this.intersectionCache.get(currentGroup)!;
    }

    if (currentGroup < 0 || currentGroup >= this.points.length) {
      return [];
    }

    // Only check for intersections if there are multiple lines
    if (this.points.length <= 1) {
      return [];
    }

    const currentLinePoints = this.points[currentGroup];
    if (currentLinePoints.length < 2) {
      return [];
    }

    // Collect all raw intersections first
    const rawIntersections: Array<{
      pointIndex: number;
      x: number;
      y: number;
      otherLine: number;
    }> = [];

    // Numeric coordinates for segment math; categorical x values resolve to
    // ordinal positions on the shared domain (see numericX).
    const numericLines = this.points.map(line =>
      line.map(point => ({ x: this.numericX(point.x), y: Number(point.y) })),
    );
    const currentLine = numericLines[currentGroup];

    // A line sorted by ascending x lets the scan below skip segment pairs
    // whose x-ranges cannot overlap. NaN-safe: a NaN coordinate fails the
    // comparison and marks the line unsorted, forcing the exhaustive scan.
    const isSortedByX = (line: { x: number }[]): boolean => {
      for (let i = 0; i < line.length - 1; i++) {
        if (!(line[i + 1].x >= line[i].x)) {
          return false;
        }
      }
      return true;
    };
    const currentSorted = isSortedByX(currentLine);

    const checkSegmentPair = (
      segIndex: number,
      otherLine: number,
      otherSegIndex: number,
    ): void => {
      const seg1Start = currentLine[segIndex];
      const seg1End = currentLine[segIndex + 1];
      const seg2Start = numericLines[otherLine][otherSegIndex];
      const seg2End = numericLines[otherLine][otherSegIndex + 1];

      const intersection = this.getSegmentIntersection(seg1Start, seg1End, seg2Start, seg2End);
      if (!intersection) {
        return;
      }

      // Find the nearest point on the current line to navigate to
      // Use Euclidean distance for accuracy with nearly vertical segments
      const distToStart = Math.hypot(intersection.x - seg1Start.x, intersection.y - seg1Start.y);
      const distToEnd = Math.hypot(intersection.x - seg1End.x, intersection.y - seg1End.y);
      const nearestPointIndex = distToStart <= distToEnd ? segIndex : segIndex + 1;

      rawIntersections.push({
        pointIndex: nearestPointIndex,
        x: intersection.x,
        y: intersection.y,
        otherLine,
      });
    };

    for (let otherLine = 0; otherLine < this.points.length; otherLine++) {
      if (otherLine === currentGroup) {
        continue;
      }

      const otherPoints = numericLines[otherLine];
      if (otherPoints.length < 2) {
        continue;
      }

      if (currentSorted && isSortedByX(otherPoints)) {
        // Both lines sorted by x: sweep with a forward-only cursor so each
        // current segment is only tested against other segments whose
        // x-range overlaps — O(n + matches) instead of O(n²), which matters
        // for daily financial series with thousands of points.
        let cursor = 0;
        for (let segIndex = 0; segIndex < currentLine.length - 1; segIndex++) {
          const segXMin = currentLine[segIndex].x;
          const segXMax = currentLine[segIndex + 1].x;
          while (cursor < otherPoints.length - 1 && otherPoints[cursor + 1].x < segXMin) {
            cursor++;
          }
          for (let k = cursor; k < otherPoints.length - 1 && otherPoints[k].x <= segXMax; k++) {
            checkSegmentPair(segIndex, otherLine, k);
          }
        }
      } else {
        // Fallback exhaustive scan for unsorted (or NaN-containing) lines.
        for (let segIndex = 0; segIndex < currentLine.length - 1; segIndex++) {
          for (let otherSegIndex = 0; otherSegIndex < otherPoints.length - 1; otherSegIndex++) {
            checkSegmentPair(segIndex, otherLine, otherSegIndex);
          }
        }
      }
    }

    // Group intersections using tolerance-based deduplication
    const groupedIntersections: Array<{
      pointIndex: number;
      x: number;
      y: number;
      intersectingLines: Set<number>;
    }> = [];

    for (const raw of rawIntersections) {
      // Find existing group within tolerance
      const existingGroup = groupedIntersections.find(
        g => Math.abs(g.x - raw.x) < LineTrace.INTERSECTION_EPSILON
          && Math.abs(g.y - raw.y) < LineTrace.INTERSECTION_EPSILON,
      );

      if (existingGroup) {
        existingGroup.intersectingLines.add(raw.otherLine);
      } else {
        const intersectingLines = new Set<number>();
        intersectingLines.add(raw.otherLine);
        groupedIntersections.push({
          pointIndex: raw.pointIndex,
          x: raw.x,
          y: raw.y,
          intersectingLines,
        });
      }
    }

    // Convert to final format and sort by x coordinate
    // Note: intersectingLines excludes currentGroup (only other lines)
    const result = groupedIntersections
      .map(entry => ({
        pointIndex: entry.pointIndex,
        x: entry.x,
        y: entry.y,
        intersectingLines: Array.from(entry.intersectingLines).sort((a, b) => a - b),
        // Classify once during target generation so UI can announce the right
        // type. The precomputed numeric lines are passed through so
        // classification doesn't re-coerce every point per intersection —
        // Number() on categorical x strings is expensive at daily-series scale.
        intersectionKind: this.classifyIntersectionKind(
          numericLines,
          currentGroup,
          Array.from(entry.intersectingLines),
          entry.x,
          entry.y,
        ),
      }))
      .sort((a, b) => a.x - b.x);

    // Cache the result
    this.intersectionCache.set(currentGroup, result);

    return result;
  }

  /**
   * Get a formatted label for intersecting lines
   * Note: intersectingLines should only contain OTHER lines (not the current line)
   * since the user is already on the current line.
   * @param intersectingLines Array of line indices that intersect (excluding current line)
   * @returns Formatted string of line names (e.g., "Line A, Line B")
   */
  private getIntersectionLabel(intersectingLines: number[]): string {
    return intersectingLines.map((lineIndex) => {
      // Access first point to get the line's z/name
      // Falls back to "Line N" if z is not defined
      const firstPoint = this.points[lineIndex][0];
      return firstPoint?.z || `Line ${lineIndex + 1}`;
    }).join(', ');
  }

  /**
   * Check whether a line contains a sampled point at the given coordinate.
   * Operates on the precomputed numeric coordinates (see numericX) so the
   * comparison is consistent with the segment math on categorical x axes and
   * avoids re-coercing raw values on every call.
   * @param numericLines Precomputed numeric coordinates for all lines
   * @param lineIndex The line index to inspect
   * @param x X coordinate
   * @param y Y coordinate
   * @returns True if the coordinate exists in the line's sampled points
   */
  private hasPointAtCoordinate(
    numericLines: { x: number; y: number }[][],
    lineIndex: number,
    x: number,
    y: number,
  ): boolean {
    if (lineIndex < 0 || lineIndex >= numericLines.length) {
      return false;
    }

    return numericLines[lineIndex].some(point =>
      Math.abs(point.x - x) < LineTrace.INTERSECTION_EPSILON
      && Math.abs(point.y - y) < LineTrace.INTERSECTION_EPSILON,
    );
  }

  /**
   * Classify an intersection as either point-based (sampled in SVG data) or
   * slope-based (created by segment crossing between sampled points).
   * @param numericLines Precomputed numeric coordinates for all lines
   * @param currentLine The current active line index
   * @param intersectingLines Other lines participating in this intersection
   * @param x Intersection x coordinate
   * @param y Intersection y coordinate
   * @returns Intersection kind
   */
  private classifyIntersectionKind(
    numericLines: { x: number; y: number }[][],
    currentLine: number,
    intersectingLines: number[],
    x: number,
    y: number,
  ): 'point' | 'slope' {
    // Point intersection requires both lines to contain the sampled coordinate.
    const currentHasPoint = this.hasPointAtCoordinate(numericLines, currentLine, x, y);
    if (!currentHasPoint) {
      return 'slope';
    }

    const otherHasPoint = intersectingLines.some(lineIndex =>
      this.hasPointAtCoordinate(numericLines, lineIndex, x, y),
    );

    return otherHasPoint ? 'point' : 'slope';
  }

  /**
   * Get extrema targets for the current line plot
   * Returns min, max values, and intersection points within the current group
   * @returns Array of extrema targets for navigation
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const targets: ExtremaTarget[] = [];
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.lineValues.length) {
      return targets;
    }

    const groupValues = this.lineValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return targets;
    }
    // Use pre-computed min/max values instead of recalculating
    const groupMin = this.min[currentGroup];
    const groupMax = this.max[currentGroup];
    // Find indices of min/max values
    const maxIndices: number[] = [];
    const minIndices: number[] = [];
    for (let index = 0; index < groupValues.length; index++) {
      const value = groupValues[index];
      if (value === groupMax) {
        maxIndices.push(index);
      }
      if (value === groupMin) {
        minIndices.push(index);
      }
    }

    // Add max targets
    for (const maxIndex of maxIndices) {
      targets.push({
        label: `Max point at ${this.getPointLabel(maxIndex)}`,
        value: groupMax,
        pointIndex: maxIndex,
        segment: 'line',
        type: 'max',
        navigationType: 'point',
        xValue: this.points[this.row]?.[maxIndex]?.x,
      });
    }

    // Add min target
    for (const minIndex of minIndices) {
      targets.push({
        label: `Min point at ${this.getPointLabel(minIndex)}`,
        value: groupMin,
        pointIndex: minIndex,
        segment: 'line',
        type: 'min',
        navigationType: 'point',
        xValue: this.points[this.row]?.[minIndex]?.x,
      });
    }

    // Add intersection targets for multiline plots
    const intersections = this.findAllIntersectionsForCurrentLine();
    for (const intersection of intersections) {
      // intersectingLines only contains OTHER lines (not current line)
      const otherLineNames = this.getIntersectionLabel(intersection.intersectingLines);
      // Format the intersection coordinates for display. On categorical x
      // axes intersection.x is an ordinal position (see numericX), so show
      // the x label of the nearest sampled point instead.
      const nearestX = this.points[this.row]?.[intersection.pointIndex]?.x;
      const xDisplay = nearestX !== undefined && !Number.isFinite(Number(nearestX))
        ? String(nearestX)
        : intersection.x.toFixed(2);
      const coordsDisplay = `x=${xDisplay}, y=${intersection.y.toFixed(2)}`;
      const intersectionLabel = intersection.intersectionKind === 'point'
        ? 'Point intersection'
        : 'Slope intersection';

      targets.push({
        label: `${intersectionLabel} at ${coordsDisplay}`,
        value: intersection.y,
        pointIndex: intersection.pointIndex,
        segment: 'intersection',
        type: 'intersection',
        intersectionKind: intersection.intersectionKind,
        navigationType: 'point',
        intersectingLines: intersection.intersectingLines,
        display: {
          coords: coordsDisplay,
          otherLines: otherLineNames,
        },
      });
    }

    return targets;
  }

  /**
   * Navigate to a specific extrema target
   * @param target The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    // Update the current point index (column)
    this.col = target.pointIndex;

    // Use common finalization method
    this.finalizeNavigation();
  }

  /**
   * Get a clean label for a specific point
   * @param pointIndex The index of the point
   * @returns A clean label for the point
   */
  private getPointLabel(pointIndex: number): string {
    if (this.points[this.row] && this.points[this.row][pointIndex]) {
      const point = this.points[this.row][pointIndex];
      return `${point.x}`;
    }
    return `Point ${pointIndex}`;
  }

  /**
   * Update the visual position of the current point
   * This method should be called when navigation changes
   */
  protected override updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }

  /**
   * Get available X values for navigation
   * @returns Array of X values
   */
  public getAvailableXValues(): XValue[] {
    return this.points[this.row].map(val => val.x);
  }

  /**
   * Move the line plot to the position that matches the given X value
   * @param xValue The X value to move to
   * @returns true if the position was found and set, false otherwise
   */
  public override moveToXValue(xValue: XValue): boolean {
    // Handle initial entry properly
    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }
    return super.moveToXValue(xValue);
  }

  public override moveToNextCompareValue(direction: string, type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.lineValues.length) {
      return false;
    }

    const groupValues = this.lineValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    const step = direction === 'right' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compare(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    this.notifyRotorBounds();
    return false;
  }

  public override moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    this.moveOnce('UPWARD');
    return true;
  }

  public override moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    this.moveOnce('DOWNWARD');
    return true;
  }

  /**
   * Intersection navigation mode is available only when the plot has
   * multiple lines. `points` is a 2-D array whose outer dimension is the line
   * index, so `length > 1` means at least two lines exist — a prerequisite for
   * any crossing between sampled series to be possible.
   */
  public override supportsIntersectionMode(): boolean {
    return this.points.length > 1;
  }

  /**
   * Collect point-type intersections for the current line, sorted by
   * pointIndex (column), with duplicate pointIndexes removed so that
   * navigation advances one data point at a time.
   *
   * Sort rationale: {@link findAllIntersectionsForCurrentLine} sorts its
   * results by continuous x-coordinate, which can differ from `pointIndex`
   * order when an intersection falls between sampled points (the "nearest
   * point" mapping is non-monotonic in those cases). Rotor navigation moves
   * by column, so we sort explicitly by pointIndex here.
   *
   * Performance note: the underlying {@link findAllIntersectionsForCurrentLine}
   * caches results per active row, so repeated calls while the cursor stays on
   * the same line are O(n) over the cached intersection list (typically small).
   */
  private getPointIntersectionIndices(): number[] {
    const intersections = this.findAllIntersectionsForCurrentLine();
    const seen = new Set<number>();
    for (const intersection of intersections) {
      if (intersection.intersectionKind === 'point') {
        seen.add(intersection.pointIndex);
      }
    }
    return [...seen].sort((a, b) => a - b);
  }

  public override moveToNextIntersection(): boolean {
    const indices = this.getPointIntersectionIndices();
    const target = indices.find(index => index > this.col);
    if (target === undefined) {
      return false;
    }
    this.col = target;
    this.finalizeNavigation();
    return true;
  }

  public override moveToPrevIntersection(): boolean {
    const indices = this.getPointIntersectionIndices();
    // Walk the sorted indices backwards to find the largest value < col.
    // A reverse loop avoids both Array.prototype.findLast (ES2023) and the
    // array allocation that [...indices].reverse() would introduce.
    let target: number | undefined;
    for (let i = indices.length - 1; i >= 0; i--) {
      if (indices[i] < this.col) {
        target = indices[i];
        break;
      }
    }
    if (target === undefined) {
      return false;
    }
    this.col = target;
    this.finalizeNavigation();
    return true;
  }
}
