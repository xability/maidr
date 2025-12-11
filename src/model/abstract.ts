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

export interface Dimension {
  rows: number;
  cols: number;
}

export abstract class AbstractPlot<State> implements Movable, Observable<State>, Disposable {
  protected readonly observers: Observer<State>[];

  protected constructor() {
    this.observers = new Array<Observer<State>>();
  }
  protected abstract get dimension(): Dimension;

  public dispose(): void {
    this.observers.length = 0;
  }

  public get isInitialEntry(): boolean {
    return this.movable.isInitialEntry;
  }

  public set isInitialEntry(value: boolean) {
    this.movable.isInitialEntry = value;
  }

  public get isOutOfBounds(): boolean {
    return this.movable.isOutOfBounds;
  }

  public set isOutOfBounds(value: boolean) {
    this.movable.isOutOfBounds = value;
  }

  public get row(): number {
    return this.movable.row;
  }

  public get col(): number {
    return this.movable.col;
  }

  public set row(value: number) {
    this.movable.row = value;
  }

  public set col(value: number) {
    this.movable.col = value;
  }

  /**
   * Gets safe row and column indices to prevent accessing undefined values
   * @returns Object with safe row and column indices
   */
  protected getSafeIndices(): { row: number; col: number } {
    const safeRow = this.row >= 0 && this.row < this.dimension.rows ? this.row : 0;
    const safeCol
      = this.col >= 0 && this.col < this.dimension.cols ? this.col : 0;
    return { row: safeRow, col: safeCol };
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
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Notifies all registered observers with the current state.
   */
  public notifyStateUpdate(): void {
    const currentState = this.state;
    this.observers.forEach(observer => observer.update(currentState));
  }

  /**
   * Notifies observers that an out-of-bounds condition occurred.
   */
  public notifyOutOfBounds(): void {
    const outOfBoundsState = this.outOfBoundsState;
    this.observers.forEach(observer => observer.update(outOfBoundsState));
  }

  public moveOnce(direction: MovableDirection): boolean {
    const isMoved = this.movable.moveOnce(direction);
    if (isMoved) {
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
    return isMoved;
  }

  public moveToExtreme(direction: MovableDirection): boolean {
    const isMoved = this.movable.moveToExtreme(direction);
    if (isMoved) {
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
    return isMoved;
  }

  public moveToIndex(row: number, col: number): boolean {
    const isMoved = this.movable.moveToIndex(row, col);
    if (isMoved) {
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
    return isMoved;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    return this.movable.isMovable(target);
  }

  public abstract get state(): State;

  protected abstract get outOfBoundsState(): State;

  protected abstract get movable(): Movable;

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

export abstract class AbstractTrace extends AbstractPlot<TraceState> implements Trace {
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
    return {
      empty: false,
      type: 'trace',
      traceType: this.type,
      plotType: this.type, // Default to traceType for other plot types
      title: this.title,
      xAxis: this.xAxis,
      yAxis: this.yAxis,
      fill: this.fill,
      hasMultiPoints: this.hasMultiPoints,
      audio: this.audio,
      braille: this.braille,
      text: this.text,
      autoplay: this.autoplay,
      highlight: this.highlight,
    };
  }

  protected get outOfBoundsState(): TraceState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
      audio: {
        y: this.row,
        x: this.col,
        rows: this.dimension.rows,
        cols: this.dimension.cols,
      },
    };
  }

  protected get highlight(): HighlightState {
    if (this.highlightValues === null || this.isInitialEntry) {
      return this.outOfBoundsState as HighlightState;
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
  }

  private get autoplay(): AutoplayState {
    return {
      UPWARD: this.dimension.rows,
      DOWNWARD: this.dimension.rows,
      FORWARD: this.dimension.cols,
      BACKWARD: this.dimension.cols,
    };
  }

  public resetToInitialEntry(): void {
    this.isInitialEntry = true;
    this.row = 0;
    this.col = 0;
  }

  protected get hasMultiPoints(): boolean {
    return false;
  }

  protected abstract get audio(): AudioState;

  protected abstract get braille(): BrailleState;

  protected abstract get text(): TextState;

  protected abstract get dimension(): Dimension;

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
  protected abstract get values(): (Element | number | number[])[][];

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
