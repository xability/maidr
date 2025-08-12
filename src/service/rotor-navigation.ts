import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import { Emitter } from '@type/event';

/**
 * Navigation unit types for rotor-based navigation
 */
export enum RotorNavigationUnit {
  DATA_POINT = 'DATA_POINT',
  HIGHER_VALUE = 'HIGHER_VALUE',
  LOWER_VALUE = 'LOWER_VALUE',
}

/**
 * Direction for rotor navigation search
 */
export enum RotorDirection {
  FORWARD = 'FORWARD',
  BACKWARD = 'BACKWARD',
  UPWARD = 'UPWARD',
  DOWNWARD = 'DOWNWARD',
}

/**
 * Events emitted by RotorNavigationService
 */
export interface RotorNavigationEvent {
  unit: RotorNavigationUnit;
  unitName: string;
}

export interface RotorNavigationTargetNotFoundEvent {
  unit: RotorNavigationUnit;
  direction: RotorDirection;
  message: string;
}

/**
 * RotorNavigationService manages rotor-based navigation units and search logic.
 *
 * Provides three navigation units:
 * - Data point: existing sequential navigation (default)
 * - Higher value: move to next/previous point with strictly higher value
 * - Lower value: move to next/previous point with strictly lower value
 *
 * This service is stateless aside from current navigation unit.
 */
export class RotorNavigationService implements Disposable {
  private readonly availableUnits: RotorNavigationUnit[] = [
    RotorNavigationUnit.DATA_POINT,
    RotorNavigationUnit.HIGHER_VALUE,
    RotorNavigationUnit.LOWER_VALUE,
  ];

  private currentUnitIndex: number = 0; // Default to DATA_POINT

  private readonly onUnitChangedEmitter = new Emitter<RotorNavigationEvent>();
  private readonly onTargetNotFoundEmitter = new Emitter<RotorNavigationTargetNotFoundEvent>();

  public readonly onUnitChanged = this.onUnitChangedEmitter.event;
  public readonly onTargetNotFound = this.onTargetNotFoundEmitter.event;

  /**
   * Get the current navigation unit
   */
  public getCurrentUnit(): RotorNavigationUnit {
    return this.availableUnits[this.currentUnitIndex];
  }

  /**
   * Get user-friendly name for navigation unit
   */
  public getUnitName(unit: RotorNavigationUnit): string {
    switch (unit) {
      case RotorNavigationUnit.DATA_POINT:
        return 'Data point';
      case RotorNavigationUnit.HIGHER_VALUE:
        return 'Higher value';
      case RotorNavigationUnit.LOWER_VALUE:
        return 'Lower value';
      default:
        return 'Unknown';
    }
  }

  /**
   * Cycle to next navigation unit (wrapping)
   */
  public cycleNext(): void {
    this.currentUnitIndex = (this.currentUnitIndex + 1) % this.availableUnits.length;
    this.emitUnitChanged();
  }

  /**
   * Cycle to previous navigation unit (wrapping)
   */
  public cyclePrev(): void {
    this.currentUnitIndex = this.currentUnitIndex === 0
      ? this.availableUnits.length - 1
      : this.currentUnitIndex - 1;
    this.emitUnitChanged();
  }

  /**
   * Find target coordinates for higher/lower value navigation
   * @param context Current trace context
   * @param direction Movement direction
   * @param unit Navigation unit (HIGHER_VALUE or LOWER_VALUE)
   * @returns Target coordinates {row, col} or null if not found
   */
  public findTargetForValueNavigation(
    context: Context,
    direction: RotorDirection,
    unit: RotorNavigationUnit,
  ): { row: number; col: number } | null {
    if (unit === RotorNavigationUnit.DATA_POINT) {
      return null; // Not applicable for data point navigation
    }

    // Get current active plot - should be a trace when in trace context
    const trace = context.active as any; // Type assertion to access row/col properties
    if (!trace) {
      return null;
    }

    const traceType = trace.constructor.name;
    const currentRow = trace.row;
    const currentCol = trace.col;

    switch (traceType) {
      case 'Candlestick':
        return this.findTargetInCandlestick(trace, currentRow, currentCol, direction, unit);
      case 'LineTrace':
        return this.findTargetInLine(trace, currentRow, currentCol, direction, unit);
      case 'Heatmap':
        return this.findTargetInHeatmap(trace, currentRow, currentCol, direction, unit);
      default:
        return null;
    }
  }

  /**
   * Search for higher/lower value in candlestick trace
   */
  private findTargetInCandlestick(
    trace: any,
    currentRow: number,
    currentCol: number,
    direction: RotorDirection,
    unit: RotorNavigationUnit,
  ): { row: number; col: number } | null {
    // For candlestick, compare using Close values (index 4) or current active segment
    const values = trace.values as number[][];
    if (!values || values.length === 0) {
      return null;
    }

    // Determine current value - use Close (index 4) as default, or current segment if available
    let valueIndex = 4; // Close value
    if (trace.currentSegmentType && trace.sections) {
      const segmentIndex = trace.sections.indexOf(trace.currentSegmentType);
      if (segmentIndex > 0) { // Skip volatility (index 0)
        valueIndex = segmentIndex;
      }
    }

    const currentValue = values[currentRow] ? values[currentRow][valueIndex] : null;
    if (currentValue === null || currentValue === undefined) {
      return null;
    }

    // Search in the specified direction
    const isForward = direction === RotorDirection.FORWARD || direction === RotorDirection.DOWNWARD;
    const startIndex = isForward ? currentRow + 1 : currentRow - 1;
    const endIndex = isForward ? values.length : -1;
    const step = isForward ? 1 : -1;

    for (let i = startIndex; i !== endIndex; i += step) {
      if (values[i] && values[i][valueIndex] !== null && values[i][valueIndex] !== undefined) {
        const candidateValue = values[i][valueIndex];

        if (unit === RotorNavigationUnit.HIGHER_VALUE && candidateValue > currentValue) {
          return { row: i, col: currentCol };
        } else if (unit === RotorNavigationUnit.LOWER_VALUE && candidateValue < currentValue) {
          return { row: i, col: currentCol };
        }
      }
    }

    return null;
  }

  /**
   * Search for higher/lower value in line trace
   */
  private findTargetInLine(
    trace: any,
    currentRow: number,
    currentCol: number,
    direction: RotorDirection,
    unit: RotorNavigationUnit,
  ): { row: number; col: number } | null {
    const values = trace.values as number[][];
    if (!values || !values[currentRow]) {
      return null;
    }

    const currentValue = values[currentRow][currentCol];
    if (currentValue === null || currentValue === undefined) {
      return null;
    }

    // For line traces, search within the same row (series)
    const rowValues = values[currentRow];
    const isForward = direction === RotorDirection.FORWARD || direction === RotorDirection.DOWNWARD;
    const startIndex = isForward ? currentCol + 1 : currentCol - 1;
    const endIndex = isForward ? rowValues.length : -1;
    const step = isForward ? 1 : -1;

    for (let i = startIndex; i !== endIndex; i += step) {
      if (rowValues[i] !== null && rowValues[i] !== undefined) {
        const candidateValue = rowValues[i];

        if (unit === RotorNavigationUnit.HIGHER_VALUE && candidateValue > currentValue) {
          return { row: currentRow, col: i };
        } else if (unit === RotorNavigationUnit.LOWER_VALUE && candidateValue < currentValue) {
          return { row: currentRow, col: i };
        }
      }
    }

    return null;
  }

  /**
   * Search for higher/lower value in heatmap trace
   */
  private findTargetInHeatmap(
    trace: any,
    currentRow: number,
    currentCol: number,
    direction: RotorDirection,
    unit: RotorNavigationUnit,
  ): { row: number; col: number } | null {
    const values = trace.values as number[][];
    if (!values || !values[currentRow]) {
      return null;
    }

    const currentValue = values[currentRow][currentCol];
    if (currentValue === null || currentValue === undefined) {
      return null;
    }

    // For heatmap: horizontal movement searches within same row, vertical within same column
    if (direction === RotorDirection.FORWARD || direction === RotorDirection.BACKWARD) {
      // Horizontal movement - search within same row
      return this.searchInArray(values[currentRow], currentCol, direction, currentValue, unit)
        ? { row: currentRow, col: this.searchInArray(values[currentRow], currentCol, direction, currentValue, unit)! }
        : null;
    } else {
      // Vertical movement - search within same column
      const columnValues = values.map(row => row[currentCol]);
      const targetRow = this.searchInArray(columnValues, currentRow, direction, currentValue, unit);
      return targetRow !== null ? { row: targetRow, col: currentCol } : null;
    }
  }

  /**
   * Helper method to search in a 1D array for higher/lower values
   */
  private searchInArray(
    array: number[],
    currentIndex: number,
    direction: RotorDirection,
    currentValue: number,
    unit: RotorNavigationUnit,
  ): number | null {
    const isForward = direction === RotorDirection.FORWARD || direction === RotorDirection.DOWNWARD;
    const startIndex = isForward ? currentIndex + 1 : currentIndex - 1;
    const endIndex = isForward ? array.length : -1;
    const step = isForward ? 1 : -1;

    for (let i = startIndex; i !== endIndex; i += step) {
      if (array[i] !== null && array[i] !== undefined) {
        const candidateValue = array[i];

        if (unit === RotorNavigationUnit.HIGHER_VALUE && candidateValue > currentValue) {
          return i;
        } else if (unit === RotorNavigationUnit.LOWER_VALUE && candidateValue < currentValue) {
          return i;
        }
      }
    }

    return null;
  }

  /**
   * Emit unit changed event
   */
  private emitUnitChanged(): void {
    const currentUnit = this.getCurrentUnit();
    this.onUnitChangedEmitter.fire({
      unit: currentUnit,
      unitName: this.getUnitName(currentUnit),
    });
  }

  /**
   * Emit target not found event
   */
  public emitTargetNotFound(unit: RotorNavigationUnit, direction: RotorDirection): void {
    const unitName = this.getUnitName(unit);
    const directionName = direction.toLowerCase().replace('_', ' ');

    this.onTargetNotFoundEmitter.fire({
      unit,
      direction,
      message: `No ${unitName.toLowerCase()} found ${directionName}`,
    });
  }

  /**
   * Dispose of the service
   */
  public dispose(): void {
    this.onUnitChangedEmitter.dispose();
    this.onTargetNotFoundEmitter.dispose();
  }
}
