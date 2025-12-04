import type { Disposable } from '@type/disposable';
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { Observable, Observer } from '@type/observable';
import type {
  AudioState,
  AutoplayState,
  BrailleState,
  HighlightState,
  TextState,
  TraceState,
} from '@type/state';
import type { Trace } from './plot';
import { NavigationService } from '@service/navigation';
import { TraceType } from '@type/grammar';

const DEFAULT_SUBPLOT_TITLE = 'unavailable';

const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_FILL_AXIS = 'unavailable';

/**
 * Abstract base class for observable elements that can be moved and tracked.
 * Implements movable navigation, observer pattern, and state management for plot elements.
 */
export abstract class AbstractObservableElement<Element, State>
  implements Movable, Observable<State>, Disposable {
  protected observers: Observer<State>[];

  protected isInitialEntry: boolean;
  protected isOutOfBounds: boolean;

  protected row: number;
  protected col: number;

  protected constructor() {
    this.observers = new Array<Observer<State>>();

    this.isInitialEntry = true;
    this.isOutOfBounds = false;

    this.row = 0;
    this.col = 0;
  }

  /**
   * Cleans up resources by removing all observers.
   */
  public dispose(): void {
    for (const observer of this.observers) {
      this.removeObserver(observer);
    }
    this.observers.length = 0;
  }

  /**
   * Moves the element one step in the specified direction.
   * @param direction - The direction to move (UPWARD, DOWNWARD, FORWARD, BACKWARD)
   */
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

    switch (direction) {
      case 'UPWARD':
        this.row += 1;
        break;
      case 'DOWNWARD':
        this.row -= 1;
        break;
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }
    this.notifyStateUpdate();
  }

  /**
   * Gets safe row and column indices to prevent accessing undefined values
   * @returns Object with safe row and column indices
   */
  protected getSafeIndices(): { row: number; col: number } {
    const values = this.values;
    const safeRow = this.row >= 0 && this.row < values.length ? this.row : 0;
    const safeCol
      = this.col >= 0 && this.col < (values[safeRow]?.length || 0) ? this.col : 0;
    return { row: safeRow, col: safeCol };
  }

  /**
   * Moves the element to the extreme position in the specified direction.
   * @param direction - The direction to move to the extreme (UPWARD, DOWNWARD, FORWARD, BACKWARD)
   */
  public moveToExtreme(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    switch (direction) {
      case 'UPWARD':
        this.row = this.values.length - 1;
        break;
      case 'DOWNWARD':
        this.row = 0;
        break;
      case 'FORWARD': {
        // Safety check: ensure we don't access undefined values
        const { row: safeRow } = this.getSafeIndices();
        this.col = this.values[safeRow]?.length
          ? this.values[safeRow].length - 1
          : 0;
        break;
      }
      case 'BACKWARD':
        this.col = 0;
        break;
    }
    this.notifyStateUpdate();
  }

  /**
   * Moves the element to a specific row and column index.
   * @param row - The target row index
   * @param col - The target column index
   */
  public moveToIndex(row: number, col: number): void {
    if (this.isMovable([row, col])) {
      this.row = row;
      this.col = col;
      this.isInitialEntry = false;
      this.notifyStateUpdate();
    }
  }

  /**
   * Checks if the element can move to the specified target position or direction.
   * @param target - Either a [row, col] tuple or a MovableDirection
   * @returns True if the move is valid, false otherwise
   */
  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      const { row: safeRow } = this.getSafeIndices();
      return (
        row >= 0
        && row < this.values.length
        && col >= 0
        && col < (this.values[safeRow]?.length || 0)
      );
    }

    switch (target) {
      case 'UPWARD':
        return this.row < this.values.length - 1;
      case 'DOWNWARD':
        return this.row > 0;
      case 'FORWARD': {
        // Safety check: ensure we don't access undefined values
        const { row: safeRow } = this.getSafeIndices();
        return this.col < (this.values[safeRow]?.length || 0) - 1;
      }
      case 'BACKWARD':
        return this.col > 0;
    }
  }

  /**
   * Handles the initial entry state by normalizing row and column indices to valid ranges.
   */
  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.row = Math.max(0, Math.min(this.row, this.values.length - 1));
    // Safety check: ensure we don't access undefined values
    const { row: safeRow } = this.getSafeIndices();
    this.col = Math.max(
      0,
      Math.min(this.col, (this.values[safeRow]?.length || 0) - 1),
    );
  }

  /**
   * Ensure the trace is initialized exactly once, and announce the initial state.
   * Subsequent calls are no-ops.
   */
  public ensureInitialized(): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
    }
  }

  /**
   * Resets the element to its initial entry state with row and column at zero.
   */
  public resetToInitialEntry(): void {
    this.isInitialEntry = true;
    this.row = 0;
    this.col = 0;
  }

  /**
   * Registers an observer to receive state updates.
   * @param observer - The observer to add
   */
  public addObserver(observer: Observer<State>): void {
    this.observers.push(observer);
  }

  /**
   * Removes an observer from receiving state updates.
   * @param observer - The observer to remove
   */
  public removeObserver(observer: Observer<State>): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  /**
   * Notifies all registered observers with the current state.
   */
  public notifyStateUpdate(): void {
    const currentState = this.state;
    for (const observer of this.observers) {
      observer.update(currentState);
    }
  }

  /**
   * Notifies observers that an out-of-bounds condition occurred.
   */
  public notifyOutOfBounds(): void {
    this.isOutOfBounds = true;
    this.notifyStateUpdate();
    this.isOutOfBounds = false;
  }

  protected abstract get values(): Element[][];

  public abstract get state(): State;

  /**
   * Notifies all observers with a specific state object.
   * @param state - The state to send to observers
   */
  public notifyObserversWithState(state: State): void {
    for (const observer of this.observers) {
      observer.update(state);
    }
  }

  /**
   * Base implementation of navigation in HIGHER and LOWER modes of ROTOR
   * Needs to be implemented in Line, Bar, Heatmap, Candlestick
   */
  public moveToNextCompareValue(_direction: 'left' | 'right' | 'up' | 'down', _type: 'lower' | 'higher'): boolean {
    // no-op
    return false;
  }

  /**
   *
   * @param a Utility function to compare point values for rotor functionality
   * @param b
   * @param type
   * @returns boolean value
   */
  protected compare(a: number, b: number, type: 'lower' | 'higher'): boolean {
    if (type === 'lower') {
      return a < b;
    }
    if (type === 'higher') {
      return a > b;
    }
    return false;
  }

  /**
   * Override left, right, upward and downward navigation functionality in rotor
   */
  /**
   * Moves up in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move up function is not defined for this trace');
  }

  /**
   * Moves down in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move down function is not defined for this trace');
  }

  /**
   * Moves left in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move left function is not defined for this trace');
  }

  /**
   * Moves right in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move right function is not defined for this trace');
  }

  /**
   * Moves the element to the specified (x, y) point.
   *
   * This base implementation is intentionally left empty. Subclasses should override
   * this method to provide specific logic for moving to a point, such as updating
   * highlight values or managing selection boxes.
   *
   * @param _x - The x-coordinate to move to.
   * @param _y - The y-coordinate to move to.
   */
  public moveToPoint(_x: number, _y: number): void {
    // implement basic stuff, assuming something like highlightValues that holds the points and boxes
  }
}

/**
 * Abstract base class for trace elements representing different plot types.
 * Extends AbstractObservableElement with trace-specific functionality for audio, braille, and text output.
 */
export abstract class AbstractTrace<T>
  extends AbstractObservableElement<T, TraceState>
  implements Trace {
  protected readonly id: string;
  protected readonly type: TraceType;
  protected readonly title: string;

  protected readonly xAxis: string;
  protected readonly yAxis: string;
  protected readonly fill: string;

  protected readonly navigationService: NavigationService;

  protected readonly layer: MaidrLayer;

  protected constructor(layer: MaidrLayer) {
    super();
    this.layer = layer;
    this.navigationService = new NavigationService();
    this.id = layer.id;
    this.type = layer.type;
    this.title = layer.title ?? DEFAULT_SUBPLOT_TITLE;

    this.xAxis = layer.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = layer.axes?.y ?? DEFAULT_Y_AXIS;
    this.fill = layer.axes?.fill ?? DEFAULT_FILL_AXIS;
  }

  /**
   * Cleans up trace resources including values and highlighted SVG elements.
   */
  public dispose(): void {
    this.values.length = 0;

    if (this.highlightValues) {
      this.highlightValues.forEach(row =>
        row.forEach((el) => {
          const elements = Array.isArray(el) ? el : [el];
          elements.forEach(element => element.remove());
        }),
      );
      this.highlightValues.length = 0;
    }

    super.dispose();
  }

  /**
   * Gets the current state of the trace including audio, braille, text, and highlight information.
   * @returns The current TraceState
   */
  public get state(): TraceState {
    if (this.isOutOfBounds) {
      const values = this.values;
      const currentRow = this.row;
      const currentCol = this.col;

      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          size: values[currentRow]?.length || 0,
          index: currentCol,
        },
      };
    }

    return {
      empty: false,
      type: 'trace',
      traceType: this.type,
      plotType: this.type, // Default to traceType for other plot types
      title: this.title,
      xAxis: this.xAxis,
      yAxis: this.yAxis,
      fill: this.fill,
      hasMultiPoints: this.hasMultiPoints(),
      audio: this.audio(),
      braille: this.braille(),
      text: this.text(),
      autoplay: this.autoplay, // Remove parentheses
      highlight: this.highlight(),
    };
  }

  /**
   * Gets the current highlight state for the trace element.
   * @returns The current HighlightState
   */
  protected highlight(): HighlightState {
    if (this.highlightValues === null || this.isInitialEntry) {
      const values = this.values;
      const currentRow = this.row;
      const currentCol = this.col;

      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          size: values[currentRow]?.length || 0,
          index: currentCol,
        },
      };
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
  }

  /**
   * Gets the audio group index if the trace has multiple groups.
   * @returns Object containing groupIndex if multiple groups exist
   */
  protected getAudioGroupIndex(): { groupIndex?: number } {
    // Default implementation checks if there are multiple groups/lines
    // Uses this.values.length > 1 as the condition and this.row as the groupIndex
    // Subclasses can override this method if they need different logic
    if (this.values && this.values.length > 1) {
      return { groupIndex: this.row };
    }
    return {};
  }

  /**
   * Gets the autoplay state indicating available movement counts in each direction.
   * @returns The current AutoplayState
   */
  public get autoplay(): AutoplayState {
    // Safety check: ensure we don't access undefined values
    const { row: safeRow } = this.getSafeIndices();
    const currentRowLength = this.values[safeRow]?.length || 0;

    return {
      UPWARD: this.values.length,
      DOWNWARD: this.values.length,
      FORWARD: currentRowLength,
      BACKWARD: currentRowLength,
    };
  }

  /**
   * Checks if the trace has multiple points at the current position.
   * @returns True if multiple points exist, false otherwise
   */
  protected hasMultiPoints(): boolean {
    return false;
  }

  protected abstract audio(): AudioState;

  protected abstract braille(): BrailleState;

  protected abstract text(): TextState;

  protected abstract get highlightValues():
    | (SVGElement[] | SVGElement)[][]
    | null;

  /**
   * Get available extrema targets for the current navigation context
   * @returns Array of extrema targets that can be navigated to
   * Default implementation returns empty array (no extrema support)
   */
  public getExtremaTargets(): ExtremaTarget[] {
    return []; // Default: no extrema support
  }

  /**
   * Base implementation for navigateToExtrema
   * Subclasses must override to provide actual implementation
   * @param _target The extrema target to navigate to
   */
  public navigateToExtrema(_target: ExtremaTarget): void {
    if (this.supportsExtrema) {
      throw new Error('Extrema navigation not implemented by this plot type');
    }
    // No-op if extrema navigation is not supported
  }

  /**
   * Common post-navigation cleanup that should be called by subclasses
   * after they update their internal state
   */
  protected finalizeExtremaNavigation(): void {
    // Ensure we're not in initial entry state after navigation
    if (this.isInitialEntry) {
      this.isInitialEntry = false;
    }

    // Update visual positioning
    this.updateVisualPointPosition();

    // Notify observers of state change
    this.notifyStateUpdate();
  }

  /**
   * Default implementation for updating visual point position
   * Subclasses can override if they need custom positioning logic
   */
  protected updateVisualPointPosition(): void {
    // Default implementation - subclasses should override if needed
  }

  /**
   * Checks if this plot supports extrema navigation.
   * @returns True if extrema navigation is supported
   */
  public supportsExtremaNavigation(): boolean {
    return this.supportsExtrema;
  }

  /**
   * Abstract property that subclasses must implement to indicate extrema support
   */
  protected abstract readonly supportsExtrema: boolean;

  /**
   * Base implementation for getting current X value
   * Subclasses can override if they have different data structures
   */
  public getCurrentXValue(): XValue | null {
    // Handle traces with points array (BarTrace, LineTrace)
    if (this.hasPointsArray()) {
      const points = this.getPointsArray();
      if (this.isValidPointsArray(points)) {
        return this.navigationService.extractXValueFromPoints(
          points,
          this.row,
          this.col,
        );
      }
    }

    // Handle traces with values array (generic fallback)
    if (this.hasValuesArray()) {
      const values = this.values;
      if (this.isValidValuesArray(values)) {
        return this.navigationService.extractXValueFromValues(
          values as any,
          this.row,
          this.col,
        );
      }
    }

    return null;
  }

  /**
   * Moves to a specific X value in the trace.
   * @param xValue - The X value to navigate to
   * @returns True if the move was successful, false otherwise
   */
  public moveToXValue(xValue: XValue): boolean {
    // Handle traces with points array (BarTrace, LineTrace)
    if (this.hasPointsArray()) {
      const points = this.getPointsArray();
      if (this.isValidPointsArray(points)) {
        return this.navigationService.moveToXValueInPoints(
          points,
          xValue,
          this.moveToIndex.bind(this),
        );
      }
    }

    // Handle traces with values array (generic fallback)
    if (this.hasValuesArray()) {
      const values = this.values;
      if (this.isValidValuesArray(values)) {
        return this.navigationService.moveToXValueInValues(
          values as any,
          xValue,
          this.moveToIndex.bind(this),
        );
      }
    }

    return false;
  }

  /**
   * Type guard to check if trace has points array.
   * @returns True if points array exists
   */
  private hasPointsArray(): boolean {
    return 'points' in this && this.points !== undefined;
  }

  /**
   * Type guard to check if trace has values array.
   * @returns True if values array exists
   */
  private hasValuesArray(): boolean {
    return 'values' in this && this.values !== undefined;
  }

  /**
   * Safely gets the points array with proper typing.
   * @returns The points array
   */
  private getPointsArray(): any[] {
    return (this as any).points;
  }

  /**
   * Validates points array structure.
   * @param points - The points array to validate
   * @returns True if valid, false otherwise
   */
  private isValidPointsArray(points: any[]): boolean {
    return Array.isArray(points) && points.length > 0;
  }

  /**
   * Validates values array structure.
   * @param values - The values array to validate
   * @returns True if valid, false otherwise
   */
  private isValidValuesArray(values: any[][]): boolean {
    return Array.isArray(values) && values.length > 0;
  }

  /**
   * Gets the unique identifier for this trace.
   * @returns The trace ID
   */
  public getId(): string {
    return this.id;
  }

  protected abstract findNearestPoint(
    x: number,
    y: number,
  ): { element: SVGElement; row: number; col: number } | null;

  /**
   * Moves to the nearest point at the specified coordinates (used for hover functionality).
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   */
  public moveToPoint(x: number, y: number): void {
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

  /**
   * Checks if the specified coordinates are within bounds of the element.
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @param element - Object containing the SVG element and its position
   * @returns True if the point is in bounds, false otherwise
   */
  public isPointInBounds(
    x: number,
    y: number,
    {
      element,
      row: _row,
      col: _col,
    }: { element: SVGElement; row: number; col: number },
  ): boolean {
    // check if x y is within r distance of the bounding box of the element
    const bbox = element.getBoundingClientRect();
    let r: number = 12;
    // if plot type is heatmap bar stacked or histogram, use 0
    if (
      this.type === TraceType.HEATMAP
      || this.type === TraceType.BAR
      || this.type === TraceType.STACKED
      || this.type === TraceType.HISTOGRAM
    ) {
      r = 0;
    }
    const isInbounds
      = x >= bbox.x - r
      && x <= bbox.x + bbox.width + r
      && y >= bbox.y - r
      && y <= bbox.y + bbox.height + r;
    return isInbounds;
  }
}
