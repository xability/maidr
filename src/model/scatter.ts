import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, HighlightState, TextState } from '@type/state';
import type { Dimension } from './abstract';
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
enum NavMode {
  COL = 'column',
  ROW = 'row',
}

export class ScatterTrace extends AbstractTrace {
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

    [this.highlightXValues, this.highlightYValues] = this.mapToSvgElements(
      layer.selectors as string,
    );
    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovablePlane(this.xPoints, this.yPoints);
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
    return this.movable.mode === 'col'
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
    return {
      empty: false,
      id: this.id,
      values: this.values,
      min: 0,
      max: 0,
      row: this.row,
      col: this.col,
    };
  }

  protected get audio(): AudioState {
    if (this.movable.mode === 'col') {
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
    if (this.movable.mode === 'col') {
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
    return {
      rows: this.yPoints.length,
      cols: this.xPoints.length,
    };
  }

  protected get highlight(): HighlightState {
    if (this.highlightValues === null) {
      return this.outOfBoundsState as HighlightState;
    }

    const elements = this.movable.mode === 'col'
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
   * Initializes scatter plot navigation at the origin in column mode.
   */
  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    // For scatter plots, start in COL mode with row=0, col=0
    this.row = 0;
    this.col = 0;
    this.mode = NavMode.COL;
    this.movable.mode = 'col';
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
      this.movable.mode = 'row';
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
      this.movable.mode = 'col';
      this.row = 0; // Set to 0 for COL mode since values[0] = xValues
    }
  }

  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return true;
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

    if (this.mode === NavMode.COL) {
      switch (target) {
        case 'FORWARD': {
          const forwardResult = this.col < this.xPoints.length - 1;
          return forwardResult;
        }
        case 'BACKWARD': {
          const backwardResult = this.col > 0;
          return backwardResult;
        }
        case 'UPWARD':
        case 'DOWNWARD':
          return true;
      }
    } else {
      switch (target) {
        case 'UPWARD': {
          const upwardResult = this.row < this.yPoints.length - 1;
          return upwardResult;
        }
        case 'DOWNWARD': {
          const downwardResult = this.row > 0;
          return downwardResult;
        }
        case 'FORWARD':
        case 'BACKWARD':
          return true;
      }
    }
  }

  /**
   * Maps scatter points to SVG elements grouped by X and Y coordinates.
   * @param selector - CSS selector for SVG elements
   * @returns Tuple of SVG element arrays grouped by X and Y, or null arrays if unavailable
   */
  private mapToSvgElements(
    selector?: string,
  ): [SVGElement[][], SVGElement[][]] | [null, null] {
    if (!selector) {
      return [null, null];
    }

    const elements = Svg.selectAllElements(selector);
    if (elements.length === 0) {
      return [null, null];
    }

    const xGroups = new Map<number, SVGElement[]>();
    const yGroups = new Map<number, SVGElement[]>();
    elements.forEach((element) => {
      const x = Number.parseFloat(element.getAttribute('x') || '');
      const y = Number.parseFloat(element.getAttribute('y') || '');

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
    this.movable.mode = 'col';

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
