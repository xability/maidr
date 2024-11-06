import {AbstractPlot} from './plot';
import {AudioState, AutoplayState, BrailleState, TextState} from './state';
import {LinePoint, Maidr} from './grammar';
import {MovableDirection} from '../core/interface';

export class LinePlot extends AbstractPlot {
  private readonly points: LinePoint[][];

  private readonly min: number[];
  private readonly max: number[];

  private readonly values: number[][];
  private readonly brailleValues: string[][];

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as LinePoint[][];

    this.values = this.points.map(row => row.map(point => Number(point.y)));
    this.min = this.values.map(row => Math.min(...row));
    this.max = this.values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(this.values);
  }

  public moveUp(): void {
    if (this.isMovable(MovableDirection.UPWARD)) {
      this.row += 1;
      this.col = this.getColOnVerticalNavigation();
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  public moveDown(): void {
    if (this.isMovable(MovableDirection.DOWNWARD)) {
      this.row -= 1;
      this.col = this.getColOnVerticalNavigation();
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
  }

  private getColOnVerticalNavigation(): number {
    const colLength = this.points[this.row].length - 1;
    return this.col > colLength ? colLength : this.col;
  }

  public moveToIndex(index: number): void {
    if (this.isMovable(index)) {
      this.col = index;
      this.notifyStateUpdate();
    }
  }

  protected audio(): AudioState {
    return {index: 0, max: 0, min: 0, size: 0, value: 0};
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues[this.row],
      index: this.col,
    };
  }

  protected text(): TextState {
    return {
      mainLabel: this.yAxis,
      mainValue: this.points[this.row][this.col].y,
      crossLabel: this.xAxis,
      crossValue: this.points[this.row][this.col].x,
    };
  }

  protected autoplay(): AutoplayState {
    return {
      plotDuration: this.points.length,
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
