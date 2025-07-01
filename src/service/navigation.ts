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
      }
    }

    // Multi-row traces (like LineTrace)
    if (Array.isArray(points)) {
      for (let row = 0; row < points.length; row++) {
        const rowPoints = points[row];
        if (Array.isArray(rowPoints)) {
          const colIndex = this.findPointIndexByX(rowPoints, xValue);
          if (colIndex !== -1) {
            moveToIndex(row, colIndex);
            return true;
          }
        }
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
    for (let row = 0; row < values.length; row++) {
      for (let col = 0; col < values[row].length; col++) {
        const value = values[row][col];
        const valueToCompare = this.extractXFromValue(value);
        if (valueToCompare === xValue) {
          moveToIndex(row, col);
          return true;
        }
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

  public dispose(): void {
    // Currently no resources to clean up
    // This method is implemented for future extensibility
  }
}
