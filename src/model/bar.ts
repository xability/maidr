import {AbstractPlot, Orientation} from './plot';
import {AudioState, AutoplayState, BrailleState, TextState} from './state';
import {BarPoint, Maidr} from './grammar';
import {MovableDirection} from '../core/interface';

const DEFAULT_FILL_AXIS = 'Fill';

export class BarPlot extends AbstractPlot {
  private readonly points: BarPoint[][];
  private readonly values: number[][];
  private readonly brailleValues: string[][];

  private readonly orientation: Orientation;
  private readonly fill: string;

  private readonly min: number;
  private readonly max: number;

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as BarPoint[][];
    this.orientation =
      maidr.orientation === Orientation.HORIZONTAL
        ? Orientation.HORIZONTAL
        : Orientation.VERTICAL;
    this.fill = maidr.axes?.fill ?? DEFAULT_FILL_AXIS;

    this.values = this.points.map(row =>
      row.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x)
      )
    );
    this.min = Math.min(...this.values.flat());
    this.max = Math.max(...this.values.flat());

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size:
        this.orientation === Orientation.VERTICAL
          ? this.values[this.row].length
          : this.values.length,
      index: this.col,
      value: this.values[this.row][this.col],
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues[this.row],
      index: this.col,
    };
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = isVertical
      ? this.points[this.row][this.col]
      : this.points[this.col][this.row];

    const mainLabel = isVertical ? this.xAxis : this.yAxis;
    const mainValue = isVertical ? point.x : point.y;

    const crossLabel = isVertical ? this.yAxis : this.xAxis;
    const crossValue = isVertical ? point.y : point.x;

    const fillData = point.fill
      ? {fillLabel: this.fill, fillValue: point.fill}
      : {};

    return {
      mainLabel,
      mainValue,
      crossLabel,
      crossValue,
      ...fillData,
    };
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.values.length,
      DOWNWARD: this.values.length,
      FORWARD: this.values[this.row].length,
      BACKWARD: this.values[this.row].length,
    };
  }

  public isMovable(target: number | MovableDirection): boolean {
    switch (target) {
      case MovableDirection.UPWARD:
        return this.row > 0;

      case MovableDirection.DOWNWARD:
        return this.row < this.values.length - 1;

      case MovableDirection.FORWARD:
        return this.col < this.values[this.row].length - 1;

      case MovableDirection.BACKWARD:
        return this.col > 0;

      default:
        return (
          this.row >= 0 &&
          this.row < this.values.length &&
          target >= 0 &&
          target < this.values[this.row].length
        );
    }
  }

  private toBraille(data: number[][]): string[][] {
    const braille = [];

    const range = (this.max - this.min) / 4;
    const low = this.min + range;
    const medium = low + range;
    const high = medium + range;

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] <= low) {
          braille[row].push('⣀');
        } else if (data[row][col] <= medium) {
          braille[row].push('⠤');
        } else if (data[row][col] <= high) {
          braille[row].push('⠒');
        } else {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }
}
