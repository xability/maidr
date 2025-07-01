import type { Disposable } from '@type/disposable';
import type { PointWithX, ValuesArray, XValue } from '@type/navigation';
import { Orientation } from '@type/grammar';
import { hasXProperty, isPointWithX, isXValue } from '@type/navigation';

/**
 * NavigationService handles orientation-specific coordinate transformations
 * and navigation logic that was previously mixed into Core Model classes.
 *
 * This service encapsulates the business logic for translating between
 * UI coordinates (row, col) and model coordinates (pointIndex, segmentType)
 * based on data orientation, as well as X-value navigation across trace types.
 */
export class NavigationService implements Disposable {
  /**
   * Compute normalized point index and segment type based on orientation
   * @param row The row coordinate from UI/ViewModel
   * @param col The column coordinate from UI/ViewModel
   * @param orientation The data orientation
   * @param sections Array of available section names (e.g., ['open', 'high', 'low', 'close'])
   * @returns Object containing pointIndex and segmentType
   */
  public computeIndexAndSegment<T extends string>(
    row: number,
    col: number,
    orientation: Orientation,
    sections: readonly T[],
  ): {
      pointIndex: number;
      segmentType: T;
    } {
    if (orientation === Orientation.HORIZONTAL) {
      return {
        pointIndex: row,
        segmentType: sections[col],
      };
    } else {
      return {
        pointIndex: col,
        segmentType: sections[row],
      };
    }
  }

  /**
   * Compute visual coordinates for highlighting based on orientation
   * @param pointIndex The data point index
   * @param segmentPosition The segment position (e.g., dynamic sorted position)
   * @param orientation The data orientation
   * @returns Object containing row and col for visual highlighting
   */
  public computeVisualCoordinates(
    pointIndex: number,
    segmentPosition: number,
    orientation: Orientation,
  ): {
      row: number;
      col: number;
    } {
    if (orientation === Orientation.HORIZONTAL) {
      return {
        row: pointIndex,
        col: segmentPosition,
      };
    } else {
      return {
        row: segmentPosition,
        col: pointIndex,
      };
    }
  }

  /**
   * Extract X value from points array based on current position
   */
  public extractXValueFromPoints(points: PointWithX[][] | PointWithX[], row: number, col: number): XValue | null {
    // Single-row traces (like BarTrace)
    if (Array.isArray(points) && points.length === 1 && Array.isArray(points[0])) {
      const point = points[0][col];
      return this.extractXFromPoint(point);
    }

    // Multi-row traces (like LineTrace)
    if (Array.isArray(points) && Array.isArray(points[row]) && points[row][col]) {
      const point = points[row][col];
      return this.extractXFromPoint(point);
    }

    return null;
  }

  /**
   * Extract X value from values array based on current position
   */
  public extractXValueFromValues(values: ValuesArray, row: number, col: number): XValue | null {
    if (this.isValidPosition(values, row, col)) {
      const value = values[row][col];
      return this.extractXFromValue(value);
    }
    return null;
  }

  /**
   * Move to X value in points array
   */
  public moveToXValueInPoints(
    points: PointWithX[][] | PointWithX[],
    xValue: XValue,
    moveToIndex: (row: number, col: number) => void,
  ): boolean {
    // Single-row traces (like BarTrace)
    if (Array.isArray(points) && points.length === 1 && Array.isArray(points[0])) {
      const targetIndex = this.findPointIndexByX(points[0], xValue);
      if (targetIndex !== -1) {
        moveToIndex(0, targetIndex);
        return true;
      } else {
        // Fallback: find nearest or categorical X
        const nearestIndex = this.findNearestPointIndexByX(points[0], xValue);
        if (nearestIndex !== -1) {
          const _actualX = extractXValue(points[0][nearestIndex]);
          if (typeof xValue === 'number' && typeof _actualX === 'number') {
            moveToIndex(0, nearestIndex);
            return true;
          } else if (typeof xValue === 'string' && typeof _actualX === 'string') {
            moveToIndex(0, nearestIndex);
            return true;
          }
        }
      }
    }

    // Multi-row traces (like LineTrace)
    let bestRow = -1;
    let bestCol = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    let fallbackType: 'numeric' | 'categorical' | 'generic' | null = null;

    if (Array.isArray(points)) {
      for (let row = 0; row < points.length; row++) {
        const rowPoints = points[row];
        if (Array.isArray(rowPoints)) {
          const colIndex = this.findPointIndexByX(rowPoints, xValue);
          if (colIndex !== -1) {
            moveToIndex(row, colIndex);
            return true;
          }
          // Fallback: find nearest/categorical in this row
          const nearestCol = this.findNearestPointIndexByX(rowPoints, xValue);
          if (nearestCol !== -1) {
            const _actualX = extractXValue(rowPoints[nearestCol]);
            let dist = Number.POSITIVE_INFINITY;
            if (typeof xValue === 'number' && typeof _actualX === 'number') {
              dist = Math.abs(_actualX - xValue);
              if (dist < bestDist) {
                bestDist = dist;
                bestRow = row;
                bestCol = nearestCol;
                fallbackType = 'numeric';
              }
            } else if (typeof xValue === 'string' && typeof _actualX === 'string') {
              if (bestRow === -1) {
                bestRow = row;
                bestCol = nearestCol;
                fallbackType = 'categorical';
              }
            } else if (bestRow === -1) {
              bestRow = row;
              bestCol = nearestCol;
              fallbackType = 'generic';
            }
          }
        }
      }
    }

    if (bestRow !== -1 && bestCol !== -1) {
      const rowPoints = points[bestRow];
      let _actualX;
      if (Array.isArray(rowPoints)) {
        _actualX = extractXValue(rowPoints[bestCol]);
      }
      if (fallbackType !== null) {
        moveToIndex(bestRow, bestCol);
        return true;
      }
    }

    return false;
  }

  /**
   * Move to X value in values array
   */
  public moveToXValueInValues(
    values: ValuesArray,
    xValue: XValue,
    moveToIndex: (row: number, col: number) => void,
  ): boolean {
    let bestRow = -1;
    let bestCol = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    let fallbackType: 'numeric' | 'categorical' | 'generic' | null = null;
    for (let row = 0; row < values.length; row++) {
      for (let col = 0; col < values[row].length; col++) {
        const value = values[row][col];
        const valueToCompare = this.extractXFromValue(value);
        if (valueToCompare === xValue) {
          moveToIndex(row, col);
          return true;
        }
        // Fallback: find nearest/categorical
        if (typeof xValue === 'number' && typeof valueToCompare === 'number') {
          const dist = Math.abs(valueToCompare - xValue);
          if (dist < bestDist) {
            bestDist = dist;
            bestRow = row;
            bestCol = col;
            fallbackType = 'numeric';
          }
        } else if (typeof xValue === 'string' && typeof valueToCompare === 'string') {
          if (bestRow === -1) {
            bestRow = row;
            bestCol = col;
            fallbackType = 'categorical';
          }
        } else if (bestRow === -1) {
          bestRow = row;
          bestCol = col;
          fallbackType = 'generic';
        }
      }
    }
    if (bestRow !== -1 && bestCol !== -1) {
      const _actualX = this.extractXFromValue(values[bestRow][bestCol]);
      if (fallbackType === 'numeric') {
        moveToIndex(bestRow, bestCol);
        return true;
      } else if (fallbackType === 'categorical') {
        moveToIndex(bestRow, bestCol);
        return true;
      } else {
        moveToIndex(bestRow, bestCol);
        return true;
      }
    }
    return false;
  }

  /**
   * Extract X value from a point object
   */
  private extractXFromPoint(point: unknown): XValue | null {
    if (isPointWithX(point)) {
      return point.x;
    }
    return null;
  }

  /**
   * Extract X value from a generic value
   */
  private extractXFromValue(value: unknown): XValue | null {
    if (hasXProperty(value)) {
      return value.x;
    }
    if (isXValue(value)) {
      return value;
    }
    return null;
  }

  /**
   * Find point index by X value
   */
  private findPointIndexByX(points: PointWithX[], xValue: XValue): number {
    return points.findIndex(point => point.x === xValue);
  }

  /**
   * Validate position in values array
   */
  private isValidPosition(values: ValuesArray, row: number, col: number): boolean {
    return row >= 0 && row < values.length
      && col >= 0 && col < values[row].length;
  }

  // Helper: find nearest X index in a flat array, robust to data type
  private findNearestPointIndexByX(points: PointWithX[], xValue: XValue): number {
    if (typeof xValue === 'number') {
      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < points.length; i++) {
        const px = extractXValue(points[i]);
        if (typeof px === 'number') {
          const dist = Math.abs(px - xValue);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        } else if (typeof px === 'string') {
          const pxNum = Number(px);
          if (!Number.isNaN(pxNum)) {
            const dist = Math.abs(pxNum - xValue);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
        }
      }
      if (bestIdx !== -1) {
        const _actualX = extractXValue(points[bestIdx]);
        return bestIdx;
      }
    } else if (typeof xValue === 'string') {
      for (let i = 0; i < points.length; i++) {
        const px = extractXValue(points[i]);
        if (px === xValue) {
          return i;
        }
      }
      const xValueNum = Number(xValue);
      if (!Number.isNaN(xValueNum)) {
        let bestIdx = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < points.length; i++) {
          const px = extractXValue(points[i]);
          if (typeof px === 'number') {
            const dist = Math.abs(px - xValueNum);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          } else if (typeof px === 'string') {
            const pxNum = Number(px);
            if (!Number.isNaN(pxNum)) {
              const dist = Math.abs(pxNum - xValueNum);
              if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
              }
            }
          }
        }
        if (bestIdx !== -1) {
          const _actualX = extractXValue(points[bestIdx]);
          return bestIdx;
        }
      }
      for (let i = 0; i < points.length; i++) {
        const px = extractXValue(points[i]);
        if (typeof px === 'string') {
          return i;
        }
      }
    }
    if (points.length > 0) {
      const _actualX = extractXValue(points[0]);
      return 0;
    }
    return -1;
  }

  public dispose(): void {
    // Currently no resources to clean up
    // This method is implemented for future extensibility
  }
}

/**
 * Type guards for known point types
 */
function isBarPoint(point: any): point is { x: string | number; y: string | number } {
  return point && typeof point === 'object' && 'x' in point && 'y' in point;
}

function isLinePoint(point: any): point is { x: number; y: number; fill?: string } {
  return point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number';
}

function isHistogramPoint(point: any): point is { x: number; y: number; xMin: number; xMax: number } {
  return point && typeof point === 'object' && 'xMin' in point && 'xMax' in point;
}

function isSegmentedPoint(point: any): point is { x: string | number; y: number; fill?: string } {
  return point && typeof point === 'object' && 'x' in point && 'y' in point;
}

function isSmoothPoint(point: any): point is { x: number; y: number } {
  return point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number';
}

function isCandlestickPoint(point: any): point is { value: number | string } {
  return point && typeof point === 'object' && 'value' in point;
}

/**
 * Centralized X extraction for all known point types
 * @param point The point object
 * @returns The X value or null if not found
 */
function extractXValue(point: any): XValue | null {
  if (!point)
    return null;
  if (isBarPoint(point) || isLinePoint(point) || isSegmentedPoint(point) || isSmoothPoint(point)) {
    return point.x;
  }
  if (isHistogramPoint(point)) {
    return point.x;
  }
  if (isCandlestickPoint(point)) {
    return point.value;
  }
  // Add more cases as needed
  return null;
}
