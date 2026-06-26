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
  DescriptionState,
  HighlightState,
  PointerGuidanceState,
  TextState,
  TraceState,
} from '@type/state';
import type { Trace } from './plot';
import { NavigationService } from '@service/navigation';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';

export const DEFAULT_SUBPLOT_TITLE = 'unavailable';

const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_Z_AXIS = 'Level';

/**
 * Maps internal TraceType identifiers to human-readable chart type labels
 * for display in the chart description modal and other user-facing surfaces.
 */
const CHART_TYPE_LABEL: Record<TraceType, string> = {
  [TraceType.BAR]: 'Bar Chart',
  [TraceType.BOX]: 'Box Plot',
  [TraceType.CANDLESTICK]: 'Candlestick Chart',
  [TraceType.DODGED]: 'Dodged Bar Chart',
  [TraceType.HEATMAP]: 'Heatmap',
  [TraceType.HISTOGRAM]: 'Histogram',
  [TraceType.LINE]: 'Line Chart',
  [TraceType.NORMALIZED]: 'Normalized Stacked Bar Chart',
  [TraceType.SCATTER]: 'Scatter Plot',
  [TraceType.SMOOTH]: 'Smooth Line Chart',
  [TraceType.STACKED]: 'Stacked Bar Chart',
  [TraceType.VIOLIN_BOX]: 'Violin Box Plot',
  [TraceType.VIOLIN_KDE]: 'Violin Plot',
};

export interface Dimension {
  rows: number;
  cols: number;
}

export interface NearestPoint {
  element: SVGElement;
  row: number;
  col: number;
  centerX: number;
  centerY: number;
}

export abstract class AbstractPlot<State> implements Movable, Observable<State>, Disposable {
  protected readonly observers: Observer<State>[];
  protected isWarning: boolean;

  /**
   * True while {@link AbstractTrace.getStateAt} computes state at a
   * temporarily moved cursor. Enforces (structurally, not just by
   * documentation) that state getters never notify observers.
   */
  protected isComputingStateAt: boolean;

  protected constructor() {
    this.observers = new Array<Observer<State>>();
    this.isWarning = false;
    this.isComputingStateAt = false;
  }
  protected abstract get dimension(): Dimension;

  public dispose(): void {
    this.observers.length = 0;
  }

  public notifyRotorBounds(): void {
    this.isWarning = true;
    this.notifyStateUpdate();
    this.isWarning = false;
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
    if (this.isComputingStateAt) {
      throw new Error(
        'notifyStateUpdate() fired during getStateAt(): state getters must stay side-effect free',
      );
    }
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
   * Base implementation of navigation in HIGHER and LOWER modes of ROTOR, default is no-op
   * Needs to be implemented in Line, Bar, Heatmap, Candlestick
   */
  public moveToNextCompareValue(
    _direction: 'left' | 'right' | 'up' | 'down',
    _type: 'lower' | 'higher',
  ): boolean {
    // no-op
    this.notifyRotorBounds();
    return false;
  }

  /**
   *
   * @param a Utility function to compare point values for rotor functionality
   * @param b
   * @param type
   * @returns boolean value
   */
  public compare(a: number, b: number, type: 'lower' | 'higher'): boolean {
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
   * @throws Error always - subclasses must override this method
   */
  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move up function is not defined for this trace');
  }

  /**
   * Moves down in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move down function is not defined for this trace');
  }

  /**
   * Moves left in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move left function is not defined for this trace');
  }

  /**
   * Moves right in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move right function is not defined for this trace');
  }

  /**
   * Returns true if this trace supports compare (lower/higher value) navigation.
   * Override to false for trace types that don't use compare modes (e.g., scatter, which is all we
   * currently have).
   */
  public supportsCompareMode(): boolean {
    return true;
  }

  /**
   * Returns the display name for the default data navigation mode.
   * Override to provide a trace-specific name (e.g., "ROW AND COLUMN NAVIGATION" for scatter).
   */
  public dataModeName(): string {
    return Constant.DATA_MODE;
  }

  /**
   * Moves the active point to the (x, y) pointer location and returns
   * directional guidance toward the nearest data geometry.
   *
   * Combines navigation and guidance into a single call so traces compute
   * `findNearestPoint` only once per pointer event. Default returns null
   * for non-trace contexts.
   *
   * @param _x - Screen-space x position of the pointer/finger
   * @param _y - Screen-space y position of the pointer/finger
   * @returns Guidance state, or null when unavailable
   */
  public moveToPointAndGetPointerGuidance(
    _x: number,
    _y: number,
  ): PointerGuidanceState | null {
    return null;
  }
}

export abstract class AbstractTrace extends AbstractPlot<TraceState> implements Trace {
  protected readonly id: string;
  protected readonly type: TraceType;
  protected readonly title: string;

  protected readonly xAxis: string;
  protected readonly yAxis: string;
  protected readonly z: string;

  protected readonly navigationService: NavigationService;

  protected readonly layer: MaidrLayer;

  protected constructor(layer: MaidrLayer) {
    super();
    this.layer = layer;
    this.navigationService = new NavigationService();
    this.id = layer.id;
    this.type = layer.type;
    this.title = layer.title ?? DEFAULT_SUBPLOT_TITLE;

    this.xAxis = layer.axes?.x?.label ?? DEFAULT_X_AXIS;
    this.yAxis = layer.axes?.y?.label ?? DEFAULT_Y_AXIS;
    this.z = layer.axes?.z?.label ?? DEFAULT_Z_AXIS;
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
    if (this.isWarning) {
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
        warning: true,
      };
    }
    return {
      empty: false,
      type: 'trace',
      layerId: this.id,
      traceType: this.type,
      plotType: this.type, // Default to traceType for other plot types
      title: this.title,
      xAxis: this.xAxis,
      yAxis: this.yAxis,
      z: this.z,
      hasMultiPoints: this.hasMultiPoints,
      audio: this.audio,
      braille: this.braille,
      text: this.text,
      autoplay: this.autoplay,
      highlight: this.highlight,
      orientation: this.layer.orientation,
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

  /**
   * Get all highlight SVG elements for this trace
   * Used by HighlightService for high contrast mode
   * @returns Array of all SVG elements, or empty array if none
   */
  public getAllHighlightElements(): SVGElement[] {
    if (this.highlightValues === null) {
      return [];
    }

    const elements: SVGElement[] = [];
    for (const row of this.highlightValues) {
      for (const cell of row) {
        if (Array.isArray(cell)) {
          elements.push(...cell);
        } else if (cell) {
          elements.push(cell);
        }
      }
    }
    return elements;
  }

  /**
   * Get all original (visible) SVG elements for this trace.
   * These are the actual rendered elements, not the hidden clones used for highlighting.
   * Used by HighlightService for high contrast mode color changes.
   * @returns Array of all original SVG elements, or empty array if none
   */
  public getAllOriginalElements(): SVGElement[] {
    if (this.highlightValues === null) {
      return [];
    }

    const elements: SVGElement[] = [];
    for (const row of this.highlightValues) {
      for (const cell of row) {
        const cellElements = Array.isArray(cell) ? cell : cell ? [cell] : [];
        for (const clone of cellElements) {
          // The original element is the previous sibling of the hidden clone
          const original = clone.previousElementSibling as SVGElement | null;

          // Verify this is actually the paired original element:
          // - Must exist
          // - Must be the same element type (e.g., both are <path>)
          // - Must NOT be hidden (the clone is hidden, original is visible)
          if (
            original
            && original.tagName === clone.tagName
            && original.getAttribute('visibility') !== 'hidden'
          ) {
            elements.push(original);
          }
        }
      }
    }
    return elements;
  }

  protected getAudioGroupIndex(): { groupIndex?: number } {
    // Default implementation checks if there are multiple groups/lines
    // Uses this.values.length > 1 as the condition and this.row as the groupIndex
    // Subclasses can override this method if they need different logic
    if (this.values && this.values.length > 1) {
      return { groupIndex: this.row };
    }
    return {};
  }

  protected get autoplay(): AutoplayState {
    return {
      UPWARD: this.dimension.rows,
      DOWNWARD: this.dimension.rows,
      FORWARD: this.dimension.cols,
      BACKWARD: this.dimension.cols,
    };
  }

  /**
   * Computes the trace state at an arbitrary position without moving the
   * user's cursor or notifying observers. Used by monitor mode to sonify
   * and announce a newly appended point while the user stays put.
   *
   * The state getters read `this.row`/`this.col` internally, so the cursor
   * is moved temporarily and always restored in a finally block — this
   * method is the single owner of that pattern.
   *
   * Re-entrancy hazard: this is only safe because the entire call chain is
   * synchronous (no await points), so timers (e.g. autoplay ticks) cannot
   * interleave before the finally-restore, and state getters never notify
   * observers. If a getter ever becomes async or triggers notifications,
   * callers could observe the temporary cursor.
   *
   * @param row - The row of the position to compute state for
   * @param col - The column of the position to compute state for
   * @returns The trace state at the requested position
   */
  public getStateAt(row: number, col: number): TraceState {
    const previous = {
      row: this.row,
      col: this.col,
      isInitialEntry: this.isInitialEntry,
    };
    this.isComputingStateAt = true;
    try {
      this.isInitialEntry = false;
      this.row = row;
      this.col = col;
      return this.state;
    } finally {
      this.isComputingStateAt = false;
      this.row = previous.row;
      this.col = previous.col;
      this.isInitialEntry = previous.isInitialEntry;
    }
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

  public abstract get description(): DescriptionState;

  /**
   * Returns a human-readable label for this trace's chart type
   * (e.g., 'Bar Chart', 'Scatter Plot') for display in the description modal.
   * Falls back to the raw layer type if no mapping is registered.
   */
  protected getChartTypeLabel(): string {
    return CHART_TYPE_LABEL[this.layer.type] ?? this.layer.type;
  }

  /**
   * Builds the axes object for the description state, including z only when
   * the layer explicitly provides a z-axis label. Subclasses should call this
   * instead of constructing the axes object inline so charts without a real
   * z dimension don't surface the placeholder default.
   */
  protected getDescriptionAxes(): DescriptionState['axes'] {
    return {
      x: this.xAxis,
      y: this.yAxis,
      ...(this.layer.axes?.z?.label && { z: this.z }),
    };
  }

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
  protected finalizeNavigation(): void {
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
   * Returns true if this trace supports intersection navigation mode.
   * Opt-in per trace type: override to return true (possibly conditionally,
   * e.g. based on data shape) for trace types that expose point intersections
   * between series. Intersection navigation is a trace-level capability — it
   * has no meaning at the figure or subplot level, which is why it lives on
   * AbstractTrace rather than AbstractPlot.
   */
  public supportsIntersectionMode(): boolean {
    return false;
  }

  /**
   * Move to the next point intersection (right arrow in intersection rotor mode).
   * Default is a no-op returning false; subclasses that advertise
   * {@link supportsIntersectionMode} must override to provide real behavior.
   */
  public moveToNextIntersection(): boolean {
    return false;
  }

  /**
   * Move to the previous point intersection (left arrow in intersection rotor mode).
   * Default is a no-op returning false; subclasses that advertise
   * {@link supportsIntersectionMode} must override to provide real behavior.
   */
  public moveToPrevIntersection(): boolean {
    return false;
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
  ): NearestPoint | null;

  /**
   * Moves the active point to the pointer location and returns directional
   * guidance toward the nearest data geometry in a single call.
   *
   * Combining both operations avoids running `findNearestPoint` twice per
   * `pointermove` event — important on dense plots where the scan is the
   * hot path.
   *
   * @param x - Screen-space x position of the pointer/finger
   * @param y - Screen-space y position of the pointer/finger
   * @returns Guidance state relative to nearest point, or null when unavailable
   */
  public override moveToPointAndGetPointerGuidance(
    x: number,
    y: number,
  ): PointerGuidanceState | null {
    const nearest = this.findNearestPoint(x, y);
    if (!nearest) {
      return null;
    }

    const onCurve = this.isPointInBounds(x, y, nearest);
    this.moveToNearest(x, y, nearest, onCurve);

    if (onCurve) {
      return { onCurve: true };
    }

    // Fields describe where the curve center sits relative to the cursor.
    // Screen-space: y grows downward, so a smaller y is higher on screen —
    // `y < centerY` puts the curve center below the cursor. The vertical
    // tie-break collapses to 'above'; at single-pixel precision the user
    // can't perceive the difference, and forcing strict inequality avoids
    // a third "centered" state that pitch mapping would need to handle.
    // Horizontally we DO distinguish ties: heatmap centers are computed
    // pixel integers users can hit exactly, and panning left at the moment
    // the cursor crosses centerX would be a misleading directional cue.
    return {
      onCurve: false,
      distancePx: Math.hypot(nearest.centerX - x, nearest.centerY - y),
      curveVertical: y < nearest.centerY ? 'below' : 'above',
      curveHorizontal: x === nearest.centerX
        ? 'center'
        : x < nearest.centerX ? 'right' : 'left',
    };
  }

  /**
   * Moves the trace to the nearest point when the pointer is within its
   * bounds and the trace is not already focused on that point.
   *
   * `onCurve` is intentionally non-optional: the caller has already paid
   * the cost of {@link isPointInBounds} to assemble guidance state, and
   * forcing subclasses to accept the value makes the contract explicit so a
   * future override cannot silently recompute (or worse, ignore) it.
   *
   * Subclasses override this to customise hover-driven navigation:
   * - Box / ViolinBox no-op the move while still surfacing guidance.
   * - Scatter switches into column navigation mode before delegating.
   */
  protected moveToNearest(
    _x: number,
    _y: number,
    nearest: NearestPoint,
    onCurve: boolean,
  ): void {
    if (!onCurve) {
      return;
    }
    if (this.row === nearest.row && this.col === nearest.col) {
      return;
    }
    this.moveToIndex(nearest.row, nearest.col);
  }

  /**
   * Checks if the specified coordinates are within bounds of the element.
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @param element - Object containing the SVG element and its position
   * @param element.element - The SVG element to check bounds against
   * @param element.row - The row position of the element
   * @param element.col - The column position of the element
   * @returns True if the point is in bounds, false otherwise
   */
  public isPointInBounds(
    x: number,
    y: number,
    {
      element,
      row: _row,
      col: _col,
    }: NearestPoint,
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
