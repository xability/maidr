import {AbstractPlot} from './plot';
import {AudioState, AutoplayState, TextState, BrailleState} from './state';
import {HistogramData, Maidr} from './grammar';
import {MovableDirection} from '../core/interface';

export class HistogramPlot extends AbstractPlot {
  private readonly points: HistogramData[][];

  private readonly max: number[];
  private readonly min: number[];

  private readonly brailleValues: string[][];
  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as HistogramData[][];

    const values = this.points.map(row => row.map(point => Number(point.y)));

    this.min = values.map(row => Math.min(...row));
    this.max = values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(values);
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

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.points[this.row][this.col].x,
      min: this.min[this.row],
      max: this.max[this.row],
      crossLabel: this.yAxis,
      crossValue: this.points[this.row][this.col].y,
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues[this.row],
      index: this.col,
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

  public moveToExtreme(direction: MovableDirection): void {
    const movement = {
      UPWARD: () => (this.row = 0),
      DOWNWARD: () => (this.row = this.points.length - 1),
      FORWARD: () => (this.col = this.points[this.row].length - 1),
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

    const range = (this.max[0] - this.min[0]) / 4;
    const low = this.min[0] + range;
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
