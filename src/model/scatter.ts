import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { GridNavigable, PointNavigable } from '@type/navigation';
import type { AudioState, BrailleState, DescriptionState, HighlightState, TextState, TraceState } from '@type/state';
import type { Dimension } from './abstract';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovablePlane } from './movable';

/**
 * Represents scatter points grouped by X coordinate.
 */
interface ScatterXPoint {
  x: number;
  y: number[];
}

/**
 * Represents scatter points grouped by Y coordinate.
 */
interface ScatterYPoint {
  x: number[];
  y: number;
}

/**
 * Represents a single cell in the grid navigation overlay.
 */
interface GridCell {
  points: ScatterPoint[];
  yValues: number[];
  xValues: number[];
  svgElements: SVGElement[];
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
}

enum NavMode {
  COL = 'col',
  ROW = 'row',
}

/**
 * A single scatter datapoint as the point-navigation rotor sees it,
 * paired with its rendered SVG element (when one was found).
 */
interface FlatPoint {
  x: number;
  y: number;
  svg: SVGElement | null;
}

export class ScatterTrace extends AbstractTrace implements GridNavigable, PointNavigable {
  private mode: NavMode;
  protected readonly movable: MovablePlane;
  protected readonly supportsExtrema = false;

  private readonly xPoints: ScatterXPoint[];
  private readonly yPoints: ScatterYPoint[];

  private readonly xValues: number[];
  private readonly yValues: number[];

  private readonly highlightXValues: SVGElement[][] | null;
  private readonly highlightYValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  // Grid navigation state
  private readonly gridCells: GridCell[][] | null;
  private readonly numGridRows: number;
  private readonly numGridCols: number;
  private gridRow: number;
  private gridCol: number;
  private isInGridMode: boolean;

  // Grid cell point navigation state
  private isInGridCellMode: boolean;
  private cellPointIndex: number;
  private cellXPoints: ScatterXPoint[]; // Grouped cell points by X (like xPoints)
  private cellSvgGroups: SVGElement[][]; // SVG elements grouped by X

  // Point navigation state (POINT_MODE)
  // - flatPoints: every individual datapoint, in original data order
  // - readingOrder / columnOrder: permutations of flatPoints indices for the
  //   two arrow axes. Right/Left walk readingOrder (y desc, x asc); Down/Up
  //   walk columnOrder (x asc, y desc). Out-of-bounds at either end of either
  //   array — no wrap.
  // - readingPos / columnPos: inverse lookups (flat index -> sort position),
  //   so a single keystroke is O(1).
  private readonly flatPoints: FlatPoint[];
  private readonly readingOrder: number[];
  private readonly columnOrder: number[];
  private readonly readingPos: number[];
  private readonly columnPos: number[];
  private isInPointMode: boolean;
  private pointModeIndex: number;

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

    const sortedByX = [...data].sort((a, b) => a.x - b.x || a.y - b.y);
    this.xPoints = new Array<ScatterXPoint>();
    let currentX: ScatterXPoint | null = null;
    for (const point of sortedByX) {
      if (!currentX || currentX.x !== point.x) {
        currentX = { x: point.x, y: [] };
        this.xPoints.push(currentX);
      }
      currentX.y.push(point.y);
    }

    const sortedByY = [...data].sort((a, b) => a.y - b.y || a.x - b.x);
    this.yPoints = new Array<ScatterYPoint>();
    let currentY: ScatterYPoint | null = null;
    for (const point of sortedByY) {
      if (!currentY || currentY.y !== point.y) {
        currentY = { y: point.y, x: [] };
        this.yPoints.push(currentY);
      }
      currentY.x.push(point.x);
    }

    this.xValues = this.xPoints.map(p => p.x);
    this.yValues = this.yPoints.map(p => p.y);

    this.minX = MathUtil.safeMin(this.xValues);
    this.maxX = MathUtil.safeMax(this.xValues);
    this.minY = MathUtil.safeMin(this.yValues);
    this.maxY = MathUtil.safeMax(this.yValues);

    // Select SVG elements once, then share for COL/ROW grouping and grid cell mapping
    const selector = layer.selectors as string;
    const allSvgClones = selector ? Svg.selectAllElements(selector) : [];

    [this.highlightXValues, this.highlightYValues] = this.groupSvgElements(allSvgClones);
    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovablePlane(this.xPoints, this.yPoints);

    // Build grid if per-axis config (axes.x.{min,max,tickStep}) is provided.
    this.isInGridMode = false;
    this.gridRow = 0;
    this.gridCol = 0;
    this.isInGridCellMode = false;
    this.cellPointIndex = 0;
    this.cellXPoints = [];
    this.cellSvgGroups = [];
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

    // Point navigation: pair each data point with its rendered SVG element by
    // index (the same index correspondence buildGridCells relies on), then
    // build two sort orders. Both orders are full permutations of the flat
    // points list — the same N indices, just visited in different sequences.
    this.flatPoints = data.map((p, i) => ({
      x: p.x,
      y: p.y,
      svg: allSvgClones.length === data.length ? allSvgClones[i] : null,
    }));
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
      ? this.buildStackedSvg(data, allSvgClones, 'x')
      : null;
    this.yPointsSvg = hasSvg
      ? this.buildStackedSvg(data, allSvgClones, 'y')
      : null;
    this.hasIntersectableStack
      = this.xPoints.some(p => p.y.length >= 2)
        || this.yPoints.some(p => p.x.length >= 2);
    this.isInIntersectionMode = false;
    this.intersectionStackIndex = 0;
  }

  /**
   * Build an array parallel to xPoints / yPoints whose [col][k] (or [row][k])
   * is the SVG element for xPoints[col].y[k] / yPoints[row].x[k].
   *
   * xPoints is constructed by sorting (x asc, y asc); yPoints by (y asc, x
   * asc). We walk the same sort order over data indices and group on the
   * primary axis so each entry lines up with its rendered element. Required
   * for INTERSECTION highlight, which focuses a single point in a stack
   * rather than the whole chord.
   */
  private buildStackedSvg(
    data: ScatterPoint[],
    svgs: SVGElement[],
    primary: 'x' | 'y',
  ): (SVGElement | null)[][] {
    const secondary = primary === 'x' ? 'y' : 'x';
    const sortedIndices = data
      .map((_, i) => i)
      .sort(
        (a, b) =>
          data[a][primary] - data[b][primary]
          || data[a][secondary] - data[b][secondary],
      );
    const result: (SVGElement | null)[][] = [];
    let group: (SVGElement | null)[] | null = null;
    let prevKey: number | null = null;
    for (const i of sortedIndices) {
      const key = data[i][primary];
      if (group === null || key !== prevKey) {
        group = [];
        result.push(group);
        prevKey = key;
      }
      group.push(svgs[i] ?? null);
    }
    return result;
  }

  /**
   * Cleans up resources and removes all highlight elements from the DOM.
   */
  public dispose(): void {
    this.movable.dispose();

    this.xPoints.length = 0;
    this.yPoints.length = 0;

    if (this.highlightXValues) {
      this.highlightXValues.forEach(row => row.forEach(el => el.remove()));
      this.highlightXValues.length = 0;
    }
    if (this.highlightYValues) {
      this.highlightYValues.forEach(row => row.forEach(el => el.remove()));
      this.highlightYValues.length = 0;
    }

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
  protected getAudioGroupIndex(): { groupIndex?: number } {
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
      return this.outOfBoundsState as BrailleState;
    }
    if (this.isInPointMode) {
      // Point mode renders one datapoint at a time; braille has no meaningful
      // surface for that, so fall through to the empty state.
      return this.outOfBoundsState as BrailleState;
    }
    // Grid mode: return 2D grid of point counts for braille display
    if (this.isInGridMode && this.gridCells) {
      const gridValues: number[][] = [];
      let maxCount = 0;
      for (let r = 0; r < this.numGridRows; r++) {
        gridValues[r] = [];
        for (let c = 0; c < this.numGridCols; c++) {
          const count = this.gridCells[r][c].points.length;
          gridValues[r][c] = count;
          if (count > maxCount) {
            maxCount = count;
          }
        }
      }
      return {
        empty: false,
        id: this.id,
        values: gridValues,
        min: 0,
        max: maxCount,
        row: this.gridRow,
        col: this.gridCol,
      };
    }

    // Normal row/col mode: braille not supported (return empty state)
    return this.outOfBoundsState as BrailleState;
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
        : Math.max(0, this.xValues.indexOf(value));
      const panY = isCol ? 0 : this.row;
      const rows = isCol ? Math.max(1, stack.length) : Math.max(1, this.yPoints.length);
      const cols = Math.max(1, this.xPoints.length);
      return {
        freq: { raw: value, min, max },
        panning: { y: panY, x: panX, rows, cols },
      };
    }

    if (this.isInPointMode) {
      const point = this.flatPoints[this.pointModeIndex];
      // Pan by position among unique x values so points at the same x produce
      // identical horizontal panning; xValues is sorted ascending in the
      // constructor.
      const xIndex = this.xValues.indexOf(point.x);
      return {
        freq: {
          raw: point.y,
          min: this.minY,
          max: this.maxY,
        },
        panning: {
          y: 0,
          x: xIndex < 0 ? 0 : xIndex,
          rows: 1,
          cols: this.xValues.length,
        },
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
      };
    } else {
      const current = this.yPoints[this.row];
      // Each tone in the chord is a distinct (x, y=row's y) point, so emit
      // a per-tone pan parallel to freq.raw — the audio service walks the
      // chord and reads pan[i] for tone i. Slots are global xPoints indices
      // so the row's points pan to where they would be in normal navigation
      // rather than clumping at one location. Previously this passed a
      // single `this.col` (a leftover COL-mode index), which collapsed the
      // whole chord onto one stereo slot and saturated to one ear whenever
      // that slot fell outside the row's effective range.
      const panXArray = current.x.map(xv => Math.max(0, this.xValues.indexOf(xv)));
      return {
        freq: {
          raw: current.x,
          min: this.minX,
          max: this.maxX,
        },
        panning: {
          y: this.row,
          x: panXArray,
          rows: this.yPoints.length,
          cols: Math.max(1, this.xPoints.length),
        },
      };
    }
  }

  protected get text(): TextState {
    if (this.isInIntersectionMode) {
      // One (x, y) pair, with main/cross labels swapped to match the base
      // mode the user came from. COL: x is the shared anchor, y is the
      // varying stack value (matches existing COL announcement). ROW: y is
      // the anchor, x varies (matches existing ROW announcement).
      const stack = this.getIntersectionStackValues();
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, stack.length - 1));
      if (this.mode === NavMode.COL) {
        const xPoint = this.xPoints[this.col];
        return {
          main: { label: this.xAxis, value: xPoint?.x ?? '' },
          cross: { label: this.yAxis, value: stack[idx] ?? '' },
        };
      }
      const yPoint = this.yPoints[this.row];
      return {
        main: { label: this.yAxis, value: yPoint?.y ?? '' },
        cross: { label: this.xAxis, value: stack[idx] ?? '' },
      };
    }

    if (this.isInPointMode) {
      const point = this.flatPoints[this.pointModeIndex];
      return {
        main: { label: this.xAxis, value: point.x },
        cross: { label: this.yAxis, value: point.y },
      };
    }

    if (this.isInGridMode && this.gridCells) {
      const cell = this.gridCells[this.gridRow][this.gridCol];

      // Grid cell point navigation mode - use COL mode format (X value + array of Y values)
      if (this.isInGridCellMode && this.cellXPoints.length > 0) {
        const currentPoint = this.cellXPoints[this.cellPointIndex];
        return {
          main: { label: this.xAxis, value: currentPoint.x },
          cross: { label: this.yAxis, value: currentPoint.y },
          gridPosition: { row: this.gridRow + 1, col: this.gridCol + 1 },
        };
      }

      // Grid cell navigation mode (cell overview)
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
      return {
        main: { label: this.xAxis, value: current.x },
        cross: { label: this.yAxis, value: current.y },
      };
    } else {
      const current = this.yPoints[this.row];
      return {
        main: { label: this.yAxis, value: current.y },
        cross: { label: this.xAxis, value: current.x },
      };
    }
  }

  /**
   * Gets the description state for the scatter trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    const totalPoints = this.xPoints.reduce((sum, xp) => sum + xp.y.length, 0);

    const stats: DescriptionState['stats'] = [
      { label: 'Total points', value: totalPoints },
      { label: 'Unique X values', value: this.xPoints.length },
      { label: 'Unique Y values', value: this.yPoints.length },
      { label: 'X range', value: `${this.minX} to ${this.maxX}` },
      { label: 'Y range', value: `${this.minY} to ${this.maxY}` },
    ];

    const headers = [this.xAxis, this.yAxis];
    const rows: (string | number)[][] = this.xPoints.flatMap(xp =>
      xp.y.map(y => [xp.x, y]),
    );

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
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

  protected get highlight(): HighlightState {
    if (this.isInIntersectionMode) {
      // Highlight a single point in the current stack. Parallel SVG arrays
      // for each axis line up with the corresponding xPoints / yPoints
      // entries (both share the constructor's sort order). Falls back to
      // out-of-bounds when the binder didn't supply per-point elements.
      const svgStack = this.mode === NavMode.COL
        ? this.xPointsSvg?.[this.col]
        : this.yPointsSvg?.[this.row];
      if (!svgStack) {
        return this.outOfBoundsState as HighlightState;
      }
      const idx = Math.min(this.intersectionStackIndex, Math.max(0, svgStack.length - 1));
      const element = svgStack[idx] ?? null;
      if (!element) {
        return this.outOfBoundsState as HighlightState;
      }
      return {
        empty: false,
        elements: [element],
      };
    }

    if (this.isInPointMode) {
      const point = this.flatPoints[this.pointModeIndex];
      if (!point.svg) {
        return this.outOfBoundsState as HighlightState;
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
          return this.outOfBoundsState as HighlightState;
        }
        return {
          empty: false,
          elements,
        };
      }

      // Grid cell overview - highlight all points in cell
      if (cell.svgElements.length === 0) {
        return this.outOfBoundsState as HighlightState;
      }
      return {
        empty: false,
        elements: cell.svgElements,
      };
    }

    if (this.highlightValues === null) {
      return this.outOfBoundsState as HighlightState;
    }

    const elements = this.mode === NavMode.COL
      ? this.col < this.highlightValues.length ? this.highlightValues![this.col] : null
      : this.row < this.highlightValues.length ? this.highlightValues![this.row] : null;
    if (!elements) {
      return this.outOfBoundsState as HighlightState;
    }

    return {
      empty: false,
      elements,
    };
  }

  protected get hasMultiPoints(): boolean {
    return true;
  }

  /**
   * Returns out-of-bounds state with correct position for grid mode panning.
   * In grid mode, uses gridCol/gridRow for correct left/right audio panning.
   */
  protected get outOfBoundsState(): TraceState {
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
      const targetRow = this.yValues.indexOf(middleYValue);

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
      const targetCol = this.xValues.indexOf(middleXValue);

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

  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return true;
    }

    // Handle grid mode navigation (used by autoplay and direct calls)
    if (this.isInGridMode && this.gridCells) {
      return this.moveOnceInGridMode(direction);
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
   * Handles movement in grid mode, mapping directions to grid cell navigation.
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

  public moveToExtreme(direction: MovableDirection): boolean {
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

  public moveToIndex(row: number, col: number): boolean {
    if (this.mode === NavMode.COL) {
      if (row >= 0 && row < this.xPoints.length) {
        this.col = row;
        this.row = 0;
        this.notifyStateUpdate();
        return true;
      } else {
        this.notifyOutOfBounds();
        return false;
      }
    } else {
      if (col >= 0 && col < this.yPoints.length) {
        this.col = col;
        this.row = 0;
        this.notifyStateUpdate();
        return true;
      } else {
        this.notifyOutOfBounds();
        return false;
      }
    }
  }

  /**
   * Checks if movement in the specified direction is possible from current position.
   * @param target - Direction or coordinate to check
   * @returns True if movement is possible, false otherwise
   */
  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      return false;
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
    return Constant.ROW_COL_MODE;
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
    const pointsWithSvg = cell.points.map((p, i) => ({ point: p, svg: cell.svgElements[i] }));
    const sorted = [...pointsWithSvg].sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);

    this.cellXPoints = [];
    this.cellSvgGroups = [];
    let currentX: ScatterXPoint | null = null;
    let currentSvgGroup: SVGElement[] = [];

    for (const { point, svg } of sorted) {
      if (!currentX || currentX.x !== point.x) {
        if (currentX) {
          this.cellXPoints.push(currentX);
          this.cellSvgGroups.push(currentSvgGroup);
        }
        currentX = { x: point.x, y: [] };
        currentSvgGroup = [];
      }
      currentX.y.push(point.y);
      if (svg)
        currentSvgGroup.push(svg);
    }
    if (currentX) {
      this.cellXPoints.push(currentX);
      this.cellSvgGroups.push(currentSvgGroup);
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

    return { xMin, xMax, xTickStep, yMin, yMax, yTickStep };
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
          svgElements: [],
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
  ): { element: SVGElement; row: number; col: number } | null {
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
    };
  }

  /**
   * Moves to the nearest scatter point at the specified screen coordinates.
   * @param x - The x-coordinate in screen space
   * @param y - The y-coordinate in screen space
   */
  public moveToPoint(x: number, y: number): void {
    // set to vertical mode
    this.mode = NavMode.COL;

    const nearest = this.findNearestPoint(x, y);
    if (nearest) {
      if (this.isPointInBounds(x, y, nearest)) {
        // don't move if we're already there
        if (this.row === nearest.row && this.col === nearest.col) {
          return;
        }
        this.moveToIndex(nearest.row, nearest.col);
      }
    }
  }
}
