import {AbstractPlot, Orientation} from './plot';
import {AudioState, BrailleState, TextState} from './state';
import {BoxPoint, Maidr} from './grammar';

export class BoxPlot extends AbstractPlot {
  private readonly points: BoxPoint[][];
  private readonly brailleValues: string[][];

  private readonly orientation: Orientation;

  private readonly min: number[];
  private readonly max: number[];

  constructor(maidr: Maidr) {
    super(maidr);
    this.points = maidr.data as BoxPoint[][];
    this.orientation =
      maidr.orientation === Orientation.HORIZONTAL
        ? Orientation.HORIZONTAL
        : Orientation.VERTICAL;
    this.values = this.points.map((row: BoxPoint[]) =>
      Array.isArray(row)
        ? row
            .map((point: BoxPoint) => [
              ...point.lower_outlier,
              point.min,
              point.q1,
              point.q2,
              point.q3,
              point.max,
              ...point.upper_outlier,
            ])
            .flat()
        : []
    );

    this.min = this.values.map(row => Math.min(...row.flat()));
    this.max = this.values.map(row => Math.max(...row.flat()));

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.values[this.row].length,
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
    if (this.orientation === Orientation.HORIZONTAL) {
      return {
        mainLabel: this.xAxis,
        mainValue: this.values[this.row][this.col],
        crossLabel: this.yAxis[0],
        crossValue: this.yAxis[1][this.row],
      };
    } else {
      return {
        mainLabel: this.xAxis[0],
        mainValue: this.xAxis[1][this.row],
        crossLabel: this.yAxis,
        crossValue: this.values[this.row][this.col],
      };
    }
  }

  // TODO: Braille Implementation
  private toBraille(data: number[][]): string[][] {
    const braille = [['braille to be implemented']];
    return braille;
  }
}
