import {AbstractPlot} from './plot';
import {AudioState, AutoplayState, TextState, BrailleState} from './state';
import {HistogramData, Maidr} from './grammar';
import {MovableDirection} from '../core/interface';

export class HistogramPlot extends AbstractPlot {
  private readonly bars: HistogramData[][];
  private index: number;

  private readonly max: number[];
  private readonly min: number[];

  private readonly brailleValues: string[][];
  constructor(maidr: Maidr) {
    super(maidr);

    this.bars = maidr.data as HistogramData[][];

    this.index = -1;

    const values = this.bars.map(row => row.map(point => Number(point.y)));

    this.min = values.map(row => Math.min(...row));
    this.max = values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(values);
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.bars[this.row].length,
      index: this.index,
      value: this.bars[this.row][this.col].y,
    };
  }

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.bars[this.row][this.col].x,
      min: this.bars[this.row][this.col].xmin,
      max: this.bars[this.row][this.col].xmax,
      crossLabel: this.yAxis,
      crossValue: this.bars[this.row][this.col].y,
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues[this.row],
      index: this.index,
    };
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.bars.length,
      DOWNWARD: this.bars.length,
      FORWARD: this.bars[this.row].length,
      BACKWARD: this.bars[this.row].length,
    };
  }

  public moveToExtreme(direction: MovableDirection): void {
    const movement = {
      UPWARD: () => (this.row = 0),
      DOWNWARD: () => (this.row = this.bars.length - 1),
      FORWARD: () => (this.col = this.bars[this.row].length - 1),
      BACKWARD: () => (this.col = 0),
    };

    movement[direction]();
    this.notifyStateUpdate();
  }

  public isMovable(target: number | MovableDirection): boolean {
    switch (target) {
      case MovableDirection.UPWARD:
        return this.row > 0;

      case MovableDirection.DOWNWARD:
        return this.row < this.bars.length - 1;

      case MovableDirection.FORWARD:
        return this.col < this.bars[this.row].length - 1;

      case MovableDirection.BACKWARD:
        return this.col > 0;

      default:
        return (
          this.row >= 0 &&
          this.row < this.bars.length &&
          target >= 0 &&
          target < this.bars[this.row].length
        );
    }
  }

  private toBraille(data: number[][]): string[][] {
    const braille = [];

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      const range = (this.max[row] - this.min[row]) / 4;
      const low = this.min[row] + range;
      const medium = low + range;
      const mediumHigh = medium + range;
      const high = medium + range;

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] <= low && col - 1 >= 0 && data[row][col - 1] > low) {
          if (data[row][col - 1] <= medium) {
            braille[row].push('⢄');
          } else if (data[row][col - 1] <= mediumHigh) {
            braille[row].push('⢆');
          } else if (data[row][col - 1] > mediumHigh) {
            braille[row].push('⢇');
          }
        } else if (data[row][col] <= low) {
          braille[row].push('⣀');
        } else if (col - 1 >= 0 && data[row][col - 1] <= low) {
          if (data[row][col] <= medium) {
            braille[row].push('⡠');
          } else if (data[row][col] <= mediumHigh) {
            braille[row].push('⡰');
          } else if (data[row][col] > mediumHigh) {
            braille[row].push('⡸');
          }
        } else if (
          data[row][col] <= medium &&
          col - 1 >= 0 &&
          data[row][col - 1] > medium
        ) {
          if (data[row][col - 1] <= mediumHigh) {
            braille[row].push('⠢');
          } else if (data[row][col - 1] > mediumHigh) {
            braille[row].push('⠣');
          }
        } else if (data[row][col] <= medium) {
          braille[row].push('⠤');
        } else if (col - 1 >= 0 && data[row][col - 1] <= medium) {
          if (data[row][col] <= mediumHigh) {
            braille[row].push('⠔');
          } else if (data[row][col] > mediumHigh) {
            braille[row].push('⠜');
          }
        } else if (
          data[row][col] <= mediumHigh &&
          col - 1 >= 0 &&
          data[row][col - 1] > mediumHigh
        ) {
          braille[row].push('⠑');
        } else if (data[row][col] <= mediumHigh) {
          braille[row].push('⠒');
        } else if (col - 1 >= 0 && data[row][col - 1] <= mediumHigh) {
          braille[row].push('⠊');
        } else if (data[row][col] <= high) {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }
}
