import type { Disposable } from '@type/disposable';
import type { MaidrLayer, TraceType } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { Observable, Observer } from '@type/observable';
import type { AudioState, AutoplayState, BrailleState, HighlightState, TextState, TraceState } from '@type/state';
import type { Trace } from './plot';
import { NavigationService } from '@service/navigation';

const DEFAULT_SUBPLOT_TITLE = 'unavailable';

const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_FILL_AXIS = 'unavailable';

export abstract class AbstractObservableElement<Element, State> implements Movable, Observable<State>, Disposable {
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

  public dispose(): void {
    for (const observer of this.observers) {
      this.removeObserver(observer);
    }
    this.observers.length = 0;
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
    const safeCol = this.col >= 0 && this.col < (values[safeRow]?.length || 0) ? this.col : 0;
    return { row: safeRow, col: safeCol };
  }

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
        this.col = this.values[safeRow]?.length ? this.values[safeRow].length - 1 : 0;
        break;
      }
      case 'BACKWARD':
        this.col = 0;
        break;
    }
    this.notifyStateUpdate();
  }

  public moveToIndex(row: number, col: number): void {
    if (this.isMovable([row, col])) {
      this.row = row;
      this.col = col;
      this.isInitialEntry = false;
      this.notifyStateUpdate();
    }
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      const { row: safeRow } = this.getSafeIndices();
      return (
        row >= 0 && row < this.values.length
        && col >= 0 && col < (this.values[safeRow]?.length || 0)
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

  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.row = Math.max(0, Math.min(this.row, this.values.length - 1));
    // Safety check: ensure we don't access undefined values
    const { row: safeRow } = this.getSafeIndices();
    this.col = Math.max(0, Math.min(this.col, (this.values[safeRow]?.length || 0) - 1));
  }

  public resetToInitialEntry(): void {
    this.isInitialEntry = true;
    this.row = 0;
    this.col = 0;
  }

  public addObserver(observer: Observer<State>): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer<State>): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  public notifyStateUpdate(): void {
    const currentState = this.state;
    for (const observer of this.observers) {
      observer.update(currentState);
    }
  }

  public notifyOutOfBounds(): void {
    this.isOutOfBounds = true;
    this.notifyStateUpdate();
    this.isOutOfBounds = false;
  }

  protected abstract get values(): Element[][];

  public abstract get state(): State;

  public notifyObserversWithState(state: State): void {
    for (const observer of this.observers) {
      observer.update(state);
    }
  }
}

export abstract class AbstractTrace<T> extends AbstractObservableElement<T, TraceState> implements Trace {
  protected readonly id: string;
  protected readonly type: TraceType;
  protected readonly title: string;

  protected readonly xAxis: string;
  protected readonly yAxis: string;
  protected readonly fill: string;

  // Service for navigation business logic
  protected readonly navigationService: NavigationService;

  protected constructor(layer: MaidrLayer) {
    super();
    this.navigationService = new NavigationService();
    this.id = layer.id;
    this.type = layer.type;
    this.title = layer.title ?? DEFAULT_SUBPLOT_TITLE;

    this.xAxis = layer.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = layer.axes?.y ?? DEFAULT_Y_AXIS;
    this.fill = layer.axes?.fill ?? DEFAULT_FILL_AXIS;
  }

  public dispose(): void {
    this.values.length = 0;

    if (this.highlightValues) {
      this.highlightValues.forEach(row => row.forEach((el) => {
        const elements = Array.isArray(el) ? el : [el];
        elements.forEach(element => element.remove());
      }));
      this.highlightValues.length = 0;
    }

    super.dispose();
  }

  public get state(): TraceState {
    if (this.isOutOfBounds) {
      // Safety check: ensure we don't access undefined values
      const { row: safeRow, col: safeCol } = this.getSafeIndices();
      const values = this.values;

      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          size: values[safeRow]?.length || 0,
          index: safeCol,
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

  protected highlight(): HighlightState {
    if (this.highlightValues === null || this.isInitialEntry) {
      // Safety check: ensure we don't access undefined values
      const { row: safeRow, col: safeCol } = this.getSafeIndices();
      const values = this.values;

      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          size: values[safeRow]?.length || 0,
          index: safeCol,
        },
      };
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
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

  protected hasMultiPoints(): boolean {
    return false;
  }

  protected abstract audio(): AudioState;

  protected abstract braille(): BrailleState;

  protected abstract text(): TextState;

  protected abstract get highlightValues(): (SVGElement[] | SVGElement)[][] | null;

  /**
   * Base implementation for getting current X value
   * Subclasses can override if they have different data structures
   */
  public getCurrentXValue(): XValue | null {
    // Handle traces with points array (BarTrace, LineTrace)
    if (this.hasPointsArray()) {
      const points = this.getPointsArray();
      if (this.isValidPointsArray(points)) {
        return this.navigationService.extractXValueFromPoints(points, this.row, this.col);
      }
    }

    // Handle traces with values array (generic fallback)
    if (this.hasValuesArray()) {
      const values = this.values;
      if (this.isValidValuesArray(values)) {
        return this.navigationService.extractXValueFromValues(values as any, this.row, this.col);
      }
    }

    return null;
  }

  /**
   * Base implementation for moving to X value
   * Subclasses can override if they have different data structures
   */
  public moveToXValue(xValue: XValue): boolean {
    // Handle traces with points array (BarTrace, LineTrace)
    if (this.hasPointsArray()) {
      const points = this.getPointsArray();
      if (this.isValidPointsArray(points)) {
        return this.navigationService.moveToXValueInPoints(points, xValue, this.moveToIndex.bind(this));
      }
    }

    // Handle traces with values array (generic fallback)
    if (this.hasValuesArray()) {
      const values = this.values;
      if (this.isValidValuesArray(values)) {
        return this.navigationService.moveToXValueInValues(values as any, xValue, this.moveToIndex.bind(this));
      }
    }

    return false;
  }

  /**
   * Type guard to check if trace has points array
   */
  private hasPointsArray(): boolean {
    return 'points' in this && this.points !== undefined;
  }

  /**
   * Type guard to check if trace has values array
   */
  private hasValuesArray(): boolean {
    return 'values' in this && this.values !== undefined;
  }

  /**
   * Safely get points array with proper typing
   */
  private getPointsArray(): any[] {
    return (this as any).points;
  }

  /**
   * Validate points array structure
   */
  private isValidPointsArray(points: any[]): boolean {
    return Array.isArray(points) && points.length > 0;
  }

  /**
   * Validate values array structure
   */
  private isValidValuesArray(values: any[][]): boolean {
    return Array.isArray(values) && values.length > 0;
  }

  public getId(): string {
    return this.id;
  }
}
