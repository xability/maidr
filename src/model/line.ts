import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

const TYPE = 'Type';
const SVG_PATH_LINE_POINT_REGEX = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;

export class LineTrace extends AbstractTrace<number> {
  protected readonly points: LinePoint[][];
  protected readonly lineValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;

  protected readonly min: number[];
  protected readonly max: number[];

  // Track the last navigation direction for slope-based audio
  protected lastNavigationDirection: 'FORWARD' | 'BACKWARD' | null = null;

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
    const rowYValues = this.lineValues[this.row];
    const col = this.col;

    // Helper function to safely get Y value at index
    const getY = (i: number): number =>
      rowYValues[Math.max(0, Math.min(i, rowYValues.length - 1))];

    // Get previous, current, and next Y values for continuous audio
    const prev = col > 0 ? getY(col - 1) : getY(col);
    const curr = getY(col);
    const next = col < rowYValues.length - 1 ? getY(col + 1) : getY(col);

    // Calculate slope based on navigation direction
    let slope = 0;
    if (this.lastNavigationDirection === 'FORWARD') {
      // Moving right: calculate slope from previous to current point
      slope = curr - prev;
    } else if (this.lastNavigationDirection === 'BACKWARD') {
      // Moving left: calculate slope from current to next point (reversed direction)
      slope = next - curr;
    } else {
      // Default: calculate forward slope
      slope = next - curr;
    }

    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: rowYValues.length,
      index: col,
      value: [prev, curr, next],
      isContinuous: true,
      slope,
      navigationDirection: this.lastNavigationDirection || 'FORWARD',
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
    const fillData = point.fill
      ? { fill: { label: TYPE, value: point.fill } }
      : {};

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: this.points[this.row][this.col].y },
      ...fillData,
    };
  }

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    // Enhanced navigation for UPWARD/DOWNWARD - consider y values at current x position
    if (direction === 'UPWARD' || direction === 'DOWNWARD') {
      const targetRow = this.findLineByXAndYDirection(direction);

      if (targetRow !== null && targetRow !== this.row) {
        // Find the column in the target line that has the same X value
        const currentX = this.points[this.row][this.col].x;
        const targetCol = this.findColumnByXValue(targetRow, currentX);

        if (targetCol !== -1) {
          this.row = targetRow;
          this.col = targetCol;
          this.notifyStateUpdate();
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
        this.lastNavigationDirection = 'FORWARD';
        break;
      case 'BACKWARD':
        this.col -= 1;
        this.lastNavigationDirection = 'BACKWARD';
        break;
    }
    this.notifyStateUpdate();
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      return (
        row >= 0 && row < this.values.length
        && col >= 0 && col < this.values[this.row].length
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
    const currentY = this.points[this.row][this.col].y;

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
      const isValidDirection = direction === 'UPWARD' ? lineY > currentY : lineY < currentY;

      if (!isValidDirection) {
        continue;
      }

      // Calculate distance (absolute difference in y values)
      const distance = Math.abs(lineY - currentY);

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
}
