import {AbstractPlot} from './plot';
import {AudioState, AutoplayState, BrailleState, TextState} from './state';
import {LinePoint, Maidr} from './grammar';
import {MovableDirection} from '../core/interface';

export class LinePlot extends AbstractPlot {
  private readonly points: LinePoint[][];
  private readonly brailleValues: string[][];

  private readonly min: number[];
  private readonly max: number[];

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as LinePoint[][];

    const values = this.points.map(row => row.map(point => Number(point.y)));
    this.min = values.map(row => Math.min(...row));
    this.max = values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(values);
  }

  public moveUp(): void {
    if (this.isMovable(MovableDirection.UPWARD)) {
      this.row += 1;
      this.col = Math.min(this.col, this.points[this.row].length - 1);
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  public moveDown(): void {
    if (this.isMovable(MovableDirection.DOWNWARD)) {
      this.row -= 1;
      this.col = Math.min(this.col, this.points[this.row].length - 1);
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.points[this.row].length,
      index: this.col,
      value: this.points[this.row][this.col].y,
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
      mainValue: this.points[this.row][this.col].x,
      crossLabel: this.yAxis,
      crossValue: this.points[this.row][this.col].y,
    };
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.points.length,
      DOWNWARD: this.points.length,
      FORWARD: this.points[this.row].length,
      BACKWARD: this.points[this.row].length,
    };
  }

  public isMovable(target: number | MovableDirection): boolean {
    switch (target) {
      case MovableDirection.UPWARD:
        return this.row > 0;

      case MovableDirection.DOWNWARD:
        return this.row < this.points.length - 1;

      case MovableDirection.FORWARD:
        return this.col < this.points[this.row].length - 1;

      case MovableDirection.BACKWARD:
        return this.col > 0;

      default:
        return (
          this.row >= 0 &&
          this.row < this.points.length &&
          target >= 0 &&
          target < this.points[this.row].length
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
