import type { Disposable } from '@type/disposable';
import { Orientation } from '@type/grammar';

/**
 * NavigationService handles orientation-specific coordinate transformations
 * and navigation logic that was previously mixed into Core Model classes.
 *
 * This service encapsulates the business logic for translating between
 * UI coordinates (row, col) and model coordinates (pointIndex, segmentType)
 * based on data orientation.
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

  public dispose(): void {
    // Currently no resources to clean up
    // This method is implemented for future extensibility
  }
}
