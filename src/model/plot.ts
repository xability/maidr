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
  HEAT = 'heat',
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

  public readonly xAxisLevels?: string[];
  public readonly yAxisLevels?: string[];

  protected readonly orientation: Orientation;

  protected constructor(maidr: Maidr) {
    this.observers = [];

    this.id = maidr.id;
    this.type = maidr.type;
    this.title = maidr.title ?? DEFAULT_TILE;

    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    if (maidr.axes) {
      if (typeof maidr.axes.x === 'string') {
        this.xAxis = maidr.axes.x;
        this.xAxisLevels = undefined;
      } else {
        this.xAxis = maidr.axes.x.label;
        this.xAxisLevels = maidr.axes.x.level;
      }
      if (typeof maidr.axes.y === 'string') {
        this.yAxis = maidr.axes.y;
        this.yAxisLevels = undefined;
      } else {
        this.yAxis = maidr.axes.y.label;
        this.yAxisLevels = maidr.axes.y.level;
      }
    } else {
      this.xAxis = DEFAULT_X_AXIS;
      this.yAxis = DEFAULT_Y_AXIS;
    }

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

  protected abstract isWithinRange(index?: number): boolean;
  protected abstract audio(): AudioState;
  protected abstract braille(): BrailleState;
  protected abstract text(): TextState;

  protected abstract up(): void;
  protected abstract down(): void;
  protected abstract left(): void;
  protected abstract right(): void;
  protected abstract toIndex(index: number): void;
}
