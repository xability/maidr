import {AudioState, BrailleState, TextState} from './state';
import {Maidr} from './grammar';

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

export interface Plot {
  get id(): string;
  get type(): string;
  get title(): string;
  get xAxis(): string;
  get yAxis(): string;

  audio(): AudioState;
  braille(): BrailleState;
  text(): TextState;

  moveUp(): void;
  moveRight(): void;
  moveDown(): void;
  moveLeft(): void;
}

export abstract class AbstractPlot implements Plot {
  public readonly id: string;
  public readonly type: string;
  public readonly title: string;

  public readonly xAxis: string;
  public readonly yAxis: string;

  protected readonly orientation: Orientation;

  protected constructor(maidr: Maidr) {
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

  public abstract audio(): AudioState;
  public abstract braille(): BrailleState;
  public abstract text(): TextState;

  public abstract moveLeft(): void;
  public abstract moveRight(): void;

  // TODO: Implement 2D in bar plot to lock position and play null.
  public moveUp(): void {
    throw new Error(`Move up not supported for ${this.type}`);
  }
  public moveDown(): void {
    throw new Error(`Move down not supported for ${this.type}`);
  }
}
