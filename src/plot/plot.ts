import {BarData, LineData, Maidr} from './maidr';
import Coordinate from './coordinate';

const DEFAULT_TILE = 'MAIDR Plot';
const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

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

export abstract class AbstractPlot implements Plot {
  public readonly title: string;
  public readonly xAxis: string;
  public readonly yAxis: string;

  public readonly orientation: Orientation;
  public readonly coordinate: Coordinate;

  protected constructor(maidr: Maidr) {
    this.title = maidr.title ?? DEFAULT_TILE;

    this.xAxis = maidr.axes?.x ?? DEFAULT_X_AXIS;
    this.yAxis = maidr.axes?.y ?? DEFAULT_Y_AXIS;

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
