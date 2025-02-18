import type { BarPoint, Maidr } from './grammar';
import type { Movable, Observable, Observer } from './interface';
import type {
  AudioState,
  AutoplayState,
  BrailleState,
  PlotState,
  TextState,
} from './state';
import { MovableDirection } from './interface';

const DEFAULT_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';
const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_FILL_AXIS = 'Fill';

export enum PlotType {
  BAR = 'bar',
  BOX = 'box',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  STACKED = 'stacked_bar',
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export interface Plot extends Movable, Observable {
  id: string;
  type: string;

  title: string;
  subtitle: string;
  caption: string;

  xAxis: string;
  yAxis: string;

  get state(): PlotState;

  get hasMultiPoints(): boolean;
}

export abstract class AbstractPlot<T> implements Plot {
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

  protected values: T[][];
  protected brailleValues: string[][];

  protected row: number;
  protected col: number;

  protected constructor(maidr: Maidr) {
    this.observers = [];

    this.id = maidr.id;
    this.type = maidr.type;

    this.title = maidr.title ?? DEFAULT_TITLE;
    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    this.xAxis = maidr.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = maidr.axes?.y ?? DEFAULT_Y_AXIS;
    this.fill = maidr.axes?.fill ?? DEFAULT_FILL_AXIS;

    this.values = [];
    this.brailleValues = [];

    this.isOutOfBounds = true;
    this.row = -1;
    this.col = -1;
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
    if (this.row < 0 && this.col < 0) {
      this.isOutOfBounds = false;
    }
  }

  protected braille(): BrailleState {
    return {
      empty: false,
      values: this.brailleValues,
      row: this.row,
      col: this.col,
    };
  }

  public get state(): PlotState {
    if (this.isOutOfBounds) {
      return { empty: true };
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
    // we set our movement functions to account for our -1, -1 starting position
    const movement = {
      UPWARD: () => {
        this.row += 1;
        this.row = this.values.length - 1;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      DOWNWARD: () => {
        this.row -= 1;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      FORWARD: () => {
        this.col += 1;
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
      },
      BACKWARD: () => {
        this.col -= 1;
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
      },
    };

    if (this.isMovable(direction)) {
      this.isOutOfBounds = false;
      movement[direction]();
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  public moveToExtreme(direction: MovableDirection): void {
    const movement = {
      UPWARD: () => {
        this.row = this.values.length - 1;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      DOWNWARD: () => {
        this.row = 0;
        if (this.col < 0)
          this.col = 0;
        if (this.col > this.values[this.row]?.length - 1)
          this.col = this.values[this.row].length - 1;
      },
      FORWARD: () => {
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
        this.col = this.values[this.row].length - 1;
      },
      BACKWARD: () => {
        this.col = 0;
        if (this.row < 0)
          this.row = 0;
        if (this.row > this.values.length - 1)
          this.row = this.values.length - 1;
      },
    };

    this.isOutOfBounds = false;
    movement[direction]();
    this.notifyStateUpdate();
  }

  public moveToIndex(index: number): void {
    if (this.isMovable(index)) {
      if (this.row < 0)
        this.row = 0;
      this.col = index;
      this.isOutOfBounds = false;
      this.notifyStateUpdate();
    }
  }

  public isMovable(target: number | MovableDirection): boolean {
    switch (target) {
      case MovableDirection.UPWARD:
        return this.row < this.values.length - 1;

      case MovableDirection.DOWNWARD:
        return this.row > 0;

      case MovableDirection.FORWARD:
        // we start charts at -1-1, so we need to not break on the first move
        return (
          this.row === -1
          || this.col === -1
          || this.col < this.values[this.row].length - 1
        );

      case MovableDirection.BACKWARD:
        return this.col > 0;

      default:
        return (
          this.row >= 0
          && this.row < this.values.length
          && target >= 0
          && target < this.values[this.row].length
        );
    }
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.values.length,
      DOWNWARD: this.values.length,
      FORWARD: this.values[this.row].length,
      BACKWARD: this.values[this.row].length,
    };
  }

  protected abstract audio(): AudioState;

  protected abstract text(): TextState;

  get hasMultiPoints(): boolean {
    return false;
  }
}

export abstract class AbstractBarPlot<
  T extends BarPoint,
> extends AbstractPlot<number> {
  protected readonly points: T[][];
  protected readonly orientation: Orientation;

  protected readonly min: number[];
  protected readonly max: number[];

  protected constructor(maidr: Maidr, points: T[][]) {
    super(maidr);

    this.points = points;
    this.orientation = maidr.orientation ?? Orientation.VERTICAL;

    this.values = points.map(row =>
      row.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x),
      ),
    );
    this.min = this.values.map(row => Math.min(...row));
    this.max = this.values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const size = isVertical ? this.values[0].length : this.values.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];

    return {
      min: Math.min(...this.min),
      max: Math.max(...this.max),
      size,
      index,
      value,
    };
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const mainLabel = isVertical ? this.xAxis : this.yAxis;
    const mainValue = isVertical ? point.x : point.y;

    const crossLabel = isVertical ? this.yAxis : this.xAxis;
    const crossValue = isVertical ? point.y : point.x;

    return {
      mainLabel,
      mainValue,
      crossLabel,
      crossValue,
    };
  }

  protected toBraille(data: number[][]): string[][] {
    return data.map((row, index) =>
      this.createBraille(row, this.min[index], this.max[index]),
    );
  }

  protected createBraille(data: number[], min: number, max: number): string[] {
    const braille = new Array<string>();

    const range = (max - min) / 4;
    const low = min + range;
    const medium = low + range;
    const high = medium + range;

    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) {
        braille.push(' ');
      } else if (data[i] <= low) {
        braille.push('⣀');
      } else if (data[i] <= medium) {
        braille.push('⠤');
      } else if (data[i] <= high) {
        braille.push('⠒');
      } else {
        braille.push('⠉');
      }
    }

    return braille;
  }
}
