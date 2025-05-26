import type { Disposable } from '@type/disposable';
import type { MaidrLayer, TraceType } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { Observable, Observer } from '@type/observable';
import type { AudioState, AutoplayState, BrailleState, HighlightState, TextState, TraceState } from '@type/state';
import type { Trace } from './plot';

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
      case 'FORWARD':
        this.col = this.values[this.row].length - 1;
        break;
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
      return (
        row >= 0 && row < this.values.length
        && col >= 0 && col < this.values[this.row].length
      );
    }

    switch (target) {
      case 'UPWARD':
        return this.row < this.values.length - 1;
      case 'DOWNWARD':
        return this.row > 0;
      case 'FORWARD':
        return this.col < this.values[this.row].length - 1;
      case 'BACKWARD':
        return this.col > 0;
    }
  }

  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.row = Math.max(0, Math.min(this.row, this.values.length - 1));
    this.col = Math.max(0, Math.min(this.col, this.values[this.row].length - 1));
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

  protected notifyOutOfBounds(): void {
    this.isOutOfBounds = true;
    this.notifyStateUpdate();
    this.isOutOfBounds = false;
  }

  protected abstract get values(): Element[][];

  public abstract get state(): State;
}

export abstract class AbstractTrace<T> extends AbstractObservableElement<T, TraceState> implements Trace {
  protected readonly id: string;
  protected readonly type: TraceType;
  private readonly title: string;

  protected readonly xAxis: string;
  protected readonly yAxis: string;
  protected readonly fill: string;

  protected constructor(layer: MaidrLayer) {
    super();

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
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
      };
    }

    return {
      empty: false,
      type: 'trace',
      traceType: this.type,
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
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
      };
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
  }

  protected getAudioGroupIndex(): { groupIndex?: number } {
    // Assuming `this.values` holds the data that determines if there are multiple lines/groups.
    // The actual condition might need to be adapted based on how `this.values` is structured
    // in concrete classes (e.g., `this.lineValues.length > 1` in LineTrace).
    // This is a generalized placeholder.
    if (this.values && Array.isArray(this.values) && this.values.length > 1 && Array.isArray(this.values[0]) && this.values[0].length > 0) {
      // Check if the items in values are themselves arrays (e.g. for multi-line)
      // or if there's another property to check for multiple groups.
      // For now, we assume if `this.values` has more than one primary element, it's a multi-group scenario.
      // This might need refinement based on the specific structure of `this.values` in subclasses.
      const firstLevelArray = this.values as unknown[][];
      if (firstLevelArray.length > 1) {
        return { groupIndex: this.row };
      }
    }
    return {};
  }

  public get autoplay(): AutoplayState {
    return {
      UPWARD: this.values.length,
      DOWNWARD: this.values.length,
      FORWARD: this.values[this.row].length,
      BACKWARD: this.values[this.row].length,
    };
  }

  protected hasMultiPoints(): boolean {
    return false;
  }

  protected abstract audio(): AudioState;

  protected abstract braille(): BrailleState;

  protected abstract text(): TextState;

  protected abstract get highlightValues(): (SVGElement[] | SVGElement)[][] | null;
}
