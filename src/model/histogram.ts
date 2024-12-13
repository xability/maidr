import {AbstractPlot} from './plot';
import {AudioState, TextState, BrailleState} from './state';
import {HistogramPoint, Maidr} from './grammar';

export class HistogramPlot extends AbstractPlot {
  private readonly points: HistogramPoint[];
  private readonly brailleValues: string[][];

  private readonly max: number;
  private readonly min: number;

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as HistogramPoint[];
    this.values = [this.points.map(point => point.y)];

    this.min = Math.min(...this.values.flat());
    this.max = Math.max(...this.values.flat());

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.points.length,
      index: this.col,
      value: this.points[this.col].y,
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues[this.row],
      index: this.col,
    };
  }

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.points[this.col].x,
      min: this.points[this.col].xmin,
      max: this.points[this.col].xmax,
      crossLabel: this.yAxis,
      crossValue: this.points[this.col].y,
    };
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
