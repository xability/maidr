import {AbstractPlot} from './plot';
import {AudioState, AutoplayState, BrailleState, TextState} from './state';
import {HeatmapData, Maidr} from './grammar';
import {MovableDirection} from '../core/interface';

export class Heatmap extends AbstractPlot {
  private readonly x: string[];
  private readonly y: string[];

  private readonly points: number[][];
  private readonly brailleValues: string[][];

  private readonly min: number;
  private readonly max: number;

  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as HeatmapData;
    this.x = data.x;
    this.y = data.y;

    this.points = data.points;
    this.min = Math.min(...this.points.flat());
    this.max = Math.max(...this.points.flat());

    this.brailleValues = this.toBraille(this.points);
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.points.length,
      index: this.col,
      value: this.points[this.row][this.col],
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
      mainValue: this.x[this.col],
      crossLabel: this.yAxis,
      crossValue: this.y[this.row],
      fillLabel: this.fill,
      fillValue: String(this.points[this.row][this.col]),
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

  public moveToExtreme(direction: MovableDirection) {
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

    const range = (this.max - this.min) / 3;
    const low = this.min + range;
    const medium = low + range;

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] === 0) {
          braille[row].push(' ');
        } else if (data[row][col] <= low) {
          braille[row].push('⠤');
        } else if (data[row][col] <= medium) {
          braille[row].push('⠒');
        } else {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }
}
