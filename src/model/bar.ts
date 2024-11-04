import {AbstractPlot, Orientation} from './plot';
import {AudioState, BrailleState, TextState} from './state';
import {BarPoint, Maidr} from './grammar';

const DEFAULT_FILL_AXIS = 'Fill';

export class BarPlot extends AbstractPlot {
  private readonly points: BarPoint[][];
  private readonly fill: string;

  private row: number;
  private col: number;

  private readonly min: number;
  private readonly max: number;

  private readonly values: number[][];
  private readonly brailleValues: string[][];

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as BarPoint[][];
    this.fill = maidr.axes?.fill ?? DEFAULT_FILL_AXIS;

    this.row = 0;
    this.col = -1;

    this.values = this.points.map(row => row.map(
      point => this.orientation === Orientation.VERTICAL
        ? Number(point.y)
        : Number(point.x)
    ));
    this.min = Math.min(...this.values.flat());
    this.max = Math.max(...this.values.flat());

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.orientation === Orientation.VERTICAL
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
    if (this.orientation === Orientation.VERTICAL) {
      return {
        mainLabel: this.yAxis,
        mainValue: this.points[this.row][this.col].y,
        crossLabel: this.xAxis,
        crossValue: this.points[this.row][this.col].x,
        ...(this.points[this.row][this.col].fill
          ? {
            fillLabel: this.fill,
            fillValue: this.points[this.row][this.col].fill,
          }
          : {}),
      };
    } else {
      return {
        mainLabel: this.xAxis,
        mainValue: this.points[this.col][this.row].x,
        crossLabel: this.yAxis,
        crossValue: this.points[this.col][this.row].y,
        ...(this.points[this.col][this.row].fill
          ? {
            fillLabel: this.fill,
            fillValue: this.points[this.col][this.row].fill,
          }
          : {}),
      };
    }
  }

  protected up(): void {
    if (this.row < this.values.length) {
      this.row += 1;
    }
  }

  protected down(): void {
    if (this.row > 0) {
      this.row -= 1;
    }
  }

  protected left(): void {
    if (this.col > -1) {
      this.col -= 1;
    }
  }

  protected right(): void {
    if (this.col < this.values[this.row].length) {
      this.col += 1;
    }
  }

  protected isWithinRange(index?: number): boolean {
    const idx = index ?? this.col;
    return this.row >= 0 && this.row < this.values.length
      && idx >= 0 && idx < this.values[this.row].length;
  }

  protected toIndex(index: number): void {
    this.col = index;
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
