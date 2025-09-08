import type { ExtremaTarget } from '@type/extrema';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, HighlightState, TextState, TraceState } from '@type/state';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

const TYPE = 'Group';
const SVG_PATH_LINE_POINT_REGEX = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;

export class LineTrace extends AbstractTrace<number> {
  protected readonly supportsExtrema = true;

  protected readonly points: LinePoint[][];
  protected readonly lineValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;

  protected readonly min: number[];
  protected readonly max: number[];

  // Track previous row for intersection label ordering
  private previousRow: number | null = null;

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as LinePoint[][];

    this.lineValues = this.points.map(row => row.map(point => Number(point.y)));
    this.min = this.lineValues.map(row => MathUtil.safeMin(row));
    this.max = this.lineValues.map(row => MathUtil.safeMax(row));

    this.highlightValues = this.mapToSvgElements(layer.selectors as string[]);
  }

  public dispose(): void {
    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  protected get values(): number[][] {
    return this.lineValues;
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.points[this.row].length,
      index: this.col,
      value: this.points[this.row][this.col].y,
      ...this.getAudioGroupIndex(),
    };
  }

  protected braille(): BrailleState {
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

  protected text(): TextState {
    const point = this.points[this.row][this.col];

    // Check for intersections at current point
    const intersections = this.findIntersections();
    let fillData: { fill: { label: string; value: string } } | Record<string, never> = {};

    if (intersections.length > 1) {
      // Multiple lines intersect - create intersection text
      let lineTypes = intersections.map((intersection) => {
        const lineIndex = intersection.groupIndex!;
        return this.points[lineIndex][0]?.fill || `l${lineIndex + 1}`;
      });

      // If previousRow is in the intersection, put its label first
      if (this.previousRow !== null) {
        const prevFill = this.points[this.previousRow][0]?.fill || `l${this.previousRow + 1}`;
        if (lineTypes.includes(prevFill)) {
          lineTypes = [prevFill, ...lineTypes.filter(l => l !== prevFill)];
        }
      }

      fillData = {
        fill: {
          label: TYPE,
          value: `intersection at (${lineTypes.join(', ')})`,
        },
      };
    } else {
      // Single line or no intersection - use normal fill data
      fillData = point.fill
        ? { fill: { label: TYPE, value: point.fill } }
        : {};
    }

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: this.points[this.row][this.col].y },
      ...fillData,
    };
  }

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.previousRow = null;
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
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
            const stateWithIntersections = { ...baseState, intersections } as TraceState;
            for (const observer of this.observers) {
              observer.update(stateWithIntersections);
            }
          } else {
            this.notifyStateUpdate();
          }
          return;
        } else {
          // No matching X value found in target line
          this.notifyOutOfBounds();
          return;
        }
      } else {
        // No valid line found based on y values - hit boundary
        this.notifyOutOfBounds();
        return;
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
      const stateWithIntersections = { ...baseState, intersections } as TraceState;
      for (const observer of this.observers) {
        observer.update(stateWithIntersections);
      }
    } else {
      this.notifyStateUpdate();
    }
  }

  /**
   * Helper function to find all lines that intersect at the current (x, y) position
   * @returns Array of AudioState for all intersecting lines
   */
  private findIntersections(): AudioState[] {
    const currentX = this.points[this.row][this.col].x;
    const currentY = this.points[this.row][this.col].y;
    const intersections: AudioState[] = [];

    for (let r = 0; r < this.points.length; r++) {
      const c = this.points[r].findIndex(p => p.x === currentX && p.y === currentY);
      if (c !== -1) {
        intersections.push({
          min: this.min[r],
          max: this.max[r],
          size: this.points[r].length,
          index: c,
          value: currentY,
          groupIndex: r,
        });
      }
    }

    return intersections;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      return (
        row >= 0 && row < this.values.length
        && col >= 0 && col < this.values[row].length // Fixed: use target row instead of current row
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
  private findLineByXAndYDirection(direction: 'UPWARD' | 'DOWNWARD'): number | null {
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

      // Check if this line's y value is in the desired direction
      const isValidDirection = direction === 'UPWARD' ? lineY > this.points[this.row][this.col].y : lineY < this.points[this.row][this.col].y;
      const distance = Math.abs(lineY - this.points[this.row][this.col].y);

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

    const svgElements: SVGElement[][] = [];
    let allFailed = true;
    for (let r = 0; r < selectors.length; r++) {
      const lineElement = Svg.selectElement(selectors[r], false);
      if (!lineElement) {
        svgElements.push([]);
        continue;
      }

      const coordinates: LinePoint[] = [];
      if (lineElement instanceof SVGPathElement) {
        const pathD = lineElement.getAttribute(Constant.D) || Constant.EMPTY;
        SVG_PATH_LINE_POINT_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null = SVG_PATH_LINE_POINT_REGEX.exec(pathD);
        while (match !== null) {
          coordinates.push({ x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) });
          match = SVG_PATH_LINE_POINT_REGEX.exec(pathD);
        }
      } else if (lineElement instanceof SVGPolylineElement) {
        const pointsAttr = lineElement.getAttribute(Constant.POINTS) || Constant.EMPTY;
        const strCoords = pointsAttr.split(/\s+/).filter(Boolean);
        for (const coordinate of strCoords) {
          const [x, y] = coordinate.split(Constant.COMMA);
          coordinates.push({ x: Number.parseFloat(x), y: Number.parseFloat(y) });
        }
      }
      if (coordinates.length !== this.lineValues[r].length) {
        if (coordinates.length < this.lineValues[r].length) {
          while (coordinates.length < this.lineValues[r].length) {
            coordinates.push({ x: Number.NaN, y: Number.NaN });
          }
        } else if (coordinates.length > this.lineValues[r].length) {
          coordinates.length = this.lineValues[r].length;
        }
      }

      const linePointElements: SVGElement[] = [];
      let lineFailed = false;
      for (const coordinate of coordinates) {
        if (Number.isNaN(coordinate.x) || Number.isNaN(coordinate.y)) {
          lineFailed = true;
          break;
        }
        linePointElements.push(Svg.createCircleElement(coordinate.x, coordinate.y, lineElement));
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

  public get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty)
      return baseState;

    const isMultiline = this.points.length > 1;
    // Add the plotType field for non-empty states
    const stateWithPlotType = {
      ...baseState,
      plotType: isMultiline ? 'multiline' : 'single line',
      ...(isMultiline && { groupCount: this.points.length }),
    };

    // Check for intersection at current (x, y)
    const intersections = this.findIntersections();
    if (intersections.length > 1) {
      return { ...stateWithPlotType, intersections };
    }
    return stateWithPlotType;
  }

  /**
   * Get extrema targets for the current line plot
   * Returns min and max values within the current group
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
    this.finalizeExtremaNavigation();
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
  protected updateVisualPointPosition(): void {
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
  public moveToXValue(xValue: XValue): boolean {
    // Handle initial entry properly
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    return super.moveToXValue(xValue);
  }

  protected highlight(): HighlightState {
    return super.highlight();
  }
}
