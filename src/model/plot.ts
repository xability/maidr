import {AudioState, BrailleState, PlotState, TextState} from './state';
import {Maidr} from './grammar';
import {Movable, Observable, Observer} from '../core/interface';

const DEFAULT_TILE = 'MAIDR Plot';
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

export interface Plot extends Movable, Observable {
  id: string;
  type: string;

  title: string;
  xAxis: string;
  yAxis: string;

  get state(): PlotState;
}

export abstract class AbstractPlot implements Plot {
  private observers: Observer[];

  public readonly id: string;
  public readonly type: string;
  public readonly title: string;

  public readonly xAxis: string;
  public readonly yAxis: string;

  protected readonly orientation: Orientation;

  protected constructor(maidr: Maidr) {
    this.observers = [];

    this.id = maidr.id;
    this.type = maidr.type;
    this.title = maidr.title ?? DEFAULT_TILE;

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

  public abstract isAtEnd(): boolean;
  public abstract isWithinRange(index?: number): boolean;
  protected abstract audio(): AudioState;
  protected abstract braille(): BrailleState;
  protected abstract text(): TextState;

  protected abstract up(): void;
  protected abstract down(): void;
  protected abstract left(): void;
  protected abstract right(): void;
  protected abstract toIndex(index: number): void;
}
