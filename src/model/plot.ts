import {
  AudioState,
  AutoplayState,
  BrailleState,
  PlotState,
  TextState,
} from './state';
import {Maidr} from './grammar';
import {MovableDirection, Observer, Plot} from '../core/interface';

const DEFAULT_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';
const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_FILL_AXIS = 'Fill';

export enum PlotType {
  BAR = 'bar',
  HISTOGRAM = 'hist',
  LINE = 'line',
  HEATMAP = 'heat',
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export abstract class AbstractPlot implements Plot {
  private observers: Observer[];
  protected isOutOfBounds: boolean;

  public readonly id: string;
  public readonly type: string;

  public readonly title: string;
  public readonly subtitle: string;
  public readonly caption: string;

  public readonly xAxis: string;
  public readonly yAxis: string;
  protected readonly fill: string;

  protected row: number;
  protected col: number;

  protected constructor(maidr: Maidr) {
    this.observers = [];
    this.isOutOfBounds = false;

    this.id = maidr.id;
    this.type = maidr.type;

    this.title = maidr.title ?? DEFAULT_TITLE;
    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    this.xAxis = maidr.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = maidr.axes?.y ?? DEFAULT_Y_AXIS;
    this.fill = maidr.axes?.fill ?? DEFAULT_FILL_AXIS;

    this.row = 0;
    this.col = 0;
  }

  public addObserver(observer: Observer): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer): void {
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

  public get state(): PlotState {
    if (this.isOutOfBounds) {
      return {empty: true};
    }

    return {
      empty: false,
      audio: this.audio(),
      braille: this.braille(),
      text: this.text(),
      autoplay: this.autoplay(),
    };
  }

  public moveOnce(direction: MovableDirection): void {
    const movement = {
      UPWARD: () => (this.row -= 1),
      DOWNWARD: () => (this.row += 1),
      FORWARD: () => (this.col += 1),
      BACKWARD: () => (this.col -= 1),
    };

    if (this.isMovable(direction)) {
      movement[direction]();
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  public moveToIndex(index: number): void {
    if (this.isMovable(index)) {
      this.col = index;
      this.notifyStateUpdate();
    }
  }

  public abstract moveToExtreme(direction: MovableDirection): void;
  public abstract isMovable(target: number | MovableDirection): boolean;

  protected abstract audio(): AudioState;
  protected abstract braille(): BrailleState;
  protected abstract text(): TextState;
  protected abstract autoplay(): AutoplayState;
}
