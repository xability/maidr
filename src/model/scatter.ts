import type { AxisConfig, MaidrLayer, ScatterPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { GridNavigable } from '@type/navigation';
import type { AudioState, BrailleState, HighlightState, TextState, TraceState } from '@type/state';
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

export class ScatterTrace extends AbstractTrace implements GridNavigable {
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

    // Build grid if config is provided (supports both axes.x.min and axes.min.x formats)
    this.isInGridMode = false;
    this.gridRow = 0;
    this.gridCol = 0;
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
    if (this.isInGridMode && this.gridCells) {
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
      return {
        freq: {
          raw: current.x,
          min: this.minX,
          max: this.maxX,
        },
        panning: {
          y: this.row,
          x: this.col,
          rows: this.yPoints.length,
          cols: current.x.length,
        },
      };
    }
  }

  protected get text(): TextState {
    if (this.isInGridMode && this.gridCells) {
      const cell = this.gridCells[this.gridRow][this.gridCol];
      return {
        main: { label: this.xAxis, value: '' },
        cross: { label: this.yAxis, value: '' },
        range: { min: cell.xRange.min, max: cell.xRange.max },
        crossRange: { min: cell.yRange.min, max: cell.yRange.max },
        gridPoints: cell.points,
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

  protected get dimension(): Dimension {
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
    if (this.isInGridMode && this.gridCells) {
      const cell = this.gridCells[this.gridRow][this.gridCol];
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

  // ── Grid construction helpers ─────────────────────────────────────────

  /**
   * Resolves grid configuration from the layer's axes, supporting two formats:
   * - Format A (per-axis): `axes.x = { min, max, tickStep }` and `axes.y = { min, max, tickStep }`
   * - Format B (grouped):  `axes.min = { x, y }`, `axes.max = { x, y }`, `axes.tickStep = { x, y }`
   * Both formats can coexist; per-axis values take precedence.
   * Returns null if no grid config is found.
   */
  private resolveGridConfig(
    layer: MaidrLayer,
  ): { xMin: number; xMax: number; xTickStep: number; yMin: number; yMax: number; yTickStep: number } | null {
    const axes = layer.axes;
    if (!axes)
      return null;

    const axisX = typeof axes.x === 'object' ? axes.x as AxisConfig : null;
    const axisY = typeof axes.y === 'object' ? axes.y as AxisConfig : null;

    // Per-axis (Format A) takes precedence, then grouped (Format B)
    const xMin = axisX?.min ?? axes.min?.x;
    const xMax = axisX?.max ?? axes.max?.x;
    const xTickStep = axisX?.tickStep ?? axes.tickStep?.x;
    const yMin = axisY?.min ?? axes.min?.y;
    const yMax = axisY?.max ?? axes.max?.y;
    const yTickStep = axisY?.tickStep ?? axes.tickStep?.y;

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
