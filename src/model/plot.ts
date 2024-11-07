import {AudioState, BrailleState, PlotState, TextState} from './state';
import {Maidr} from './grammar';
import {Observer, Subject} from '../core/observer';

const DEFAULT_TILE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';
const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';

export enum PlotType {
  BAR = 'bar',
  LINE = 'line',
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export interface Plot extends Subject {
  id: string;
  type: string;

  title: string;
  xAxis: string;
  yAxis: string;
  subtitle: string;
  caption: string;

  get state(): PlotState;

  moveUp(): void;
  moveRight(): void;
  moveDown(): void;
  moveLeft(): void;
  moveBottommost(): void;
  moveLeftmost(): void;
  moveRightmost(): void;
  moveTopmost(): void;
  moveToIndex(index: number): void;
}

export abstract class AbstractPlot implements Plot {
  private observers: Observer[];

  public readonly id: string;
  public readonly type: string;
  public readonly title: string;

  public readonly subtitle: string;
  public readonly caption: string;

  public readonly xAxis: string;
  public readonly yAxis: string;

  protected readonly orientation: Orientation;

  protected constructor(maidr: Maidr) {
    this.observers = [];

    this.id = maidr.id;
    this.type = maidr.type;
    this.title = maidr.title ?? DEFAULT_TILE;

    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    this.xAxis = maidr.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = maidr.axes?.y ?? DEFAULT_Y_AXIS;

    this.orientation =
      maidr.orientation === Orientation.HORIZONTAL
        ? Orientation.HORIZONTAL
        : Orientation.VERTICAL;
  }

  public addObserver(observer: Observer): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  public notifyObservers(): void {
    const currentState = this.state;
    for (const observer of this.observers) {
      observer.update(currentState);
    }
  }

  public get state(): PlotState {
    return {
      empty: !this.isWithinRange(),
      audio: this.audio(),
      braille: this.braille(),
      text: this.text(),
    };
  }

  public moveUp(): void {
    this.up();
    this.notifyObservers();
  }
  public moveDown(): void {
    this.down();
    this.notifyObservers();
  }

  public moveLeft(): void {
    this.left();
    this.notifyObservers();
  }

  public moveRight(): void {
    this.right();
    this.notifyObservers();
  }

  public moveToIndex(index: number): void {
    if (this.isWithinRange(index)) {
      this.toIndex(index);
      this.notifyObservers();
    }
  }

  public moveBottommost(): void {
    this.extremeBottom();
    this.notifyObservers();
  }

  public moveLeftmost(): void {
    this.extremeLeft();
    this.notifyObservers();
  }

  public moveRightmost(): void {
    this.extremeRight();
    this.notifyObservers();
  }

  public moveTopmost(): void {
    this.extremeTop();
    this.notifyObservers();
  }

  protected abstract isWithinRange(index?: number): boolean;
  protected abstract audio(): AudioState;
  protected abstract braille(): BrailleState;
  protected abstract text(): TextState;

  protected abstract up(): void;
  protected abstract down(): void;
  protected abstract left(): void;
  protected abstract right(): void;
  protected abstract extremeBottom(): void;
  protected abstract extremeLeft(): void;
  protected abstract extremeRight(): void;
  protected abstract extremeTop(): void;
  protected abstract toIndex(index: number): void;
}
