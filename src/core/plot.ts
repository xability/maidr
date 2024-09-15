import {BarData, LineData, Maidr} from './maidr';
import Coordinate from './coordinate';

export interface Plot {
  get title(): string;
  get xAxis(): string;
  get yAxis(): string;
  get orientation(): Orientation;
  get coordinate(): Coordinate;

  moveUp(): void;
  moveRight(): void;
  moveDown(): void;
  moveLeft(): void;

  autoplayForward(): void;
  autoplayBackward(): void;
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

export abstract class AbstractPlot implements Plot {
  // Default values.
  protected static readonly DEFAULT_TITLE: string = 'MAIDR Plot';
  protected static readonly DEFAULT_X_AXIS: string = 'X';
  protected static readonly DEFAULT_Y_AXIS: string = 'Y';

  // Plot information.
  public readonly title: string;

  public readonly xAxis: string;
  public readonly yAxis: string;

  public readonly orientation: Orientation;
  public readonly coordinate: Coordinate;

  protected constructor(maidr: Maidr) {
    this.title = maidr.title ?? AbstractPlot.DEFAULT_TITLE;

    this.xAxis = maidr.axes?.x ?? AbstractPlot.DEFAULT_X_AXIS;
    this.yAxis = maidr.axes?.y ?? AbstractPlot.DEFAULT_Y_AXIS;

    this.orientation =
      maidr.orientation === Orientation.HORIZONTAL
        ? Orientation.HORIZONTAL
        : Orientation.VERTICAL;

    this.coordinate = this.initCoordinate(maidr.data);
  }

  protected abstract initCoordinate(data: BarData | LineData): Coordinate;

  public moveDown(): void {}

  public moveLeft(): void {}

  public moveRight(): void {}

  public moveUp(): void {}

  public autoplayBackward(): void {}

  public autoplayForward(): void {}
}
