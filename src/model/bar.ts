import {AbstractPlot, Orientation} from './plot';
import {AudioState, TextState} from './state';
import {BarPoint, Maidr} from './grammar';

export class BarPlot extends AbstractPlot {
  private readonly points: BarPoint[];
  private readonly orientation: Orientation;

  private readonly min: number;
  private readonly max: number;

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as BarPoint[];
    this.orientation =
      maidr.orientation === Orientation.HORIZONTAL
        ? Orientation.HORIZONTAL
        : Orientation.VERTICAL;

    this.values = [
      this.points.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x)
      ),
    ];
    this.min = Math.min(...this.values.flat());
    this.max = Math.max(...this.values.flat());

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const size = isVertical ? this.values[this.row].length : this.values.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];

    return {
      min: this.min,
      max: this.max,
      size: size,
      index: index,
      value: value,
    };
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = isVertical ? this.points[this.col] : this.points[this.row];

    const mainLabel = isVertical ? this.xAxis : this.yAxis;
    const mainValue = isVertical ? point.x : point.y;
    s;
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
    const braille = [];

    for (let row = 0; row < data.length; row++) {
      braille.push(this.createBraille(data[row], this.min, this.max));
    }

    return braille;
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
