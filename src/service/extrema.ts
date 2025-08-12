import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';

/**
 * Type of extremum (minimum or maximum)
 */
export type ExtremaType = 'min' | 'max';

/**
 * Information about an extremum occurrence
 */
export interface ExtremaOccurrence {
  /** The index of the point where extremum occurs */
  pointIndex: number;
  /** The actual extremum value */
  value: number;
}

/**
 * Event payload when jumping to an extremum
 */
export interface ExtremaJumpEvent {
  /** ID of the trace */
  traceId: string;
  /** Type of extremum */
  type: ExtremaType;
  /** Current occurrence index (0-based) */
  occurrenceIndex: number;
  /** Total number of occurrences */
  totalOccurrences: number;
  /** Index of the point to jump to */
  pointIndex: number;
  /** The extremum value */
  value: number;
}

/**
 * Observer interface for extrema jump events
 */
export interface ExtremaObserver {
  onExtremaJump: (event: ExtremaJumpEvent) => void;
}

/**
 * Service for computing and navigating to extrema (min/max points) in traces.
 * Handles finding all occurrences of extrema and cycling through tied values.
 */
export class ExtremaService implements Disposable {
  private readonly observers: ExtremaObserver[] = [];
  private readonly extremaCursors: Map<string, Map<ExtremaType, number>> = new Map();

  /**
   * Add an observer for extrema jump events
   */
  public addObserver(observer: ExtremaObserver): void {
    this.observers.push(observer);
  }

  /**
   * Remove an observer for extrema jump events
   */
  public removeObserver(observer: ExtremaObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Find all indices where the extremum value occurs in a line
   * @param values Array of values for the line
   * @param type Type of extremum to find
   * @returns Array of ExtremaOccurrence objects
   */
  public getExtremaIndices(values: number[], type: ExtremaType): ExtremaOccurrence[] {
    if (values.length === 0) {
      return [];
    }

    const extremumValue = type === 'min'
      ? Math.min(...values)
      : Math.max(...values);

    const occurrences: ExtremaOccurrence[] = [];

    values.forEach((value, index) => {
      if (value === extremumValue) {
        occurrences.push({
          pointIndex: index,
          value: extremumValue,
        });
      }
    });

    return occurrences;
  }

  /**
   * Jump to the next occurrence of an extremum in a trace line
   * @param context The context to move within
   * @param traceId Unique identifier for the trace
   * @param lineIndex Index of the line within the trace (for multi-line plots)
   * @param values Array of values for the line
   * @param type Type of extremum to jump to
   * @returns The point index that was jumped to, or -1 if no extrema found
   */
  public jumpToNextExtrema(
    context: Context,
    traceId: string,
    lineIndex: number,
    values: number[],
    type: ExtremaType,
  ): number {
    const occurrences = this.getExtremaIndices(values, type);

    if (occurrences.length === 0) {
      return -1;
    }

    // Get or initialize cursor for this trace and extrema type
    const traceKey = `${traceId}_${lineIndex}`;
    if (!this.extremaCursors.has(traceKey)) {
      this.extremaCursors.set(traceKey, new Map());
    }

    const traceCursors = this.extremaCursors.get(traceKey)!;
    const currentCursor = traceCursors.get(type) ?? 0;

    // Calculate next cursor position (cycle through occurrences)
    const nextCursor = (currentCursor + 1) % occurrences.length;
    traceCursors.set(type, nextCursor);

    const selectedOccurrence = occurrences[currentCursor];

    // Move to the extrema position
    context.moveToIndex(lineIndex, selectedOccurrence.pointIndex);

    // Emit jump event
    const jumpEvent: ExtremaJumpEvent = {
      traceId: traceKey,
      type,
      occurrenceIndex: currentCursor,
      totalOccurrences: occurrences.length,
      pointIndex: selectedOccurrence.pointIndex,
      value: selectedOccurrence.value,
    };

    this.notifyObservers(jumpEvent);

    return selectedOccurrence.pointIndex;
  }

  /**
   * Reset cursor for a specific trace and extrema type
   * @param traceId Unique identifier for the trace
   * @param lineIndex Index of the line within the trace
   * @param type Type of extremum to reset (optional, resets all if not provided)
   */
  public resetCursor(traceId: string, lineIndex: number, type?: ExtremaType): void {
    const traceKey = `${traceId}_${lineIndex}`;
    const traceCursors = this.extremaCursors.get(traceKey);

    if (!traceCursors) {
      return;
    }

    if (type) {
      traceCursors.set(type, 0);
    } else {
      traceCursors.clear();
    }
  }

  /**
   * Get available extrema types for a line
   * @param values Array of values for the line
   * @returns Array of extrema types that have occurrences
   */
  public getAvailableExtremaTypes(values: number[]): ExtremaType[] {
    const types: ExtremaType[] = [];

    if (this.getExtremaIndices(values, 'min').length > 0) {
      types.push('min');
    }

    if (this.getExtremaIndices(values, 'max').length > 0) {
      types.push('max');
    }

    return types;
  }

  /**
   * Get current cursor position for a trace and extrema type
   * @param traceId Unique identifier for the trace
   * @param lineIndex Index of the line within the trace
   * @param type Type of extremum
   * @returns Current cursor position (0-based)
   */
  public getCurrentCursor(traceId: string, lineIndex: number, type: ExtremaType): number {
    const traceKey = `${traceId}_${lineIndex}`;
    const traceCursors = this.extremaCursors.get(traceKey);
    return traceCursors?.get(type) ?? 0;
  }

  /**
   * Notify all observers of an extrema jump event
   */
  private notifyObservers(event: ExtremaJumpEvent): void {
    this.observers.forEach(observer => observer.onExtremaJump(event));
  }

  public dispose(): void {
    this.observers.length = 0;
    this.extremaCursors.clear();
  }
}
