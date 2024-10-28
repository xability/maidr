import {AbstractPlot, Orientation} from './plot';
import {AudioState, BrailleState, TextState} from './state';
import {BarData, Maidr} from './grammar';

export class BarPlot extends AbstractPlot {
  private readonly x: number[] | string[];
  private readonly y: number[] | string[];

  private readonly min: number;
  private readonly max: number;

  private index: number;
  private readonly values: number[];
  private readonly brailleValues: string[];

  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as BarData;
    if (data.x.length !== data.y.length) {
      throw new Error(
        `len(x): ${data.x.length} and len(y): ${data.y.length} do not match`
      );
    }

    this.index = -1;

    this.x = data.x;
    this.y = data.y;

    if (this.orientation === Orientation.VERTICAL) {
      this.values = this.y.filter(e => typeof e === 'number');
    } else {
      this.values = this.x.filter(e => typeof e === 'number');
    }

    this.min = Math.min(...this.values);
    this.max = Math.max(...this.values);

    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.values.length,
      index: this.index,
      value: this.values[this.index],
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues,
      index: this.index,
    };
  }

  protected text(): TextState {
    if (this.orientation === Orientation.VERTICAL) {
      return {
        mainLabel: this.xAxis,
        mainValue: this.y[this.index],
        crossLabel: this.yAxis,
        crossValue: this.x[this.index],
      };
    } else {
      return {
        mainLabel: this.yAxis,
        mainValue: this.x[this.index],
        crossLabel: this.xAxis,
        crossValue: this.y[this.index],
      };
    }
  }

  // TODO: Implement 2D in bar plot to lock position and play null.
  protected up(): void {
    throw new Error(`Move up not supported for ${this.type}`);
  }

  // TODO: Implement 2D in bar plot to lock position and play null.
  protected down(): void {
    throw new Error(`Move down not supported for ${this.type}`);
  }

  protected left(): void {
    if (this.index > -1) {
      this.index -= 1;
    }
  }

  protected right(): void {
    if (this.index < this.values.length) {
      this.index += 1;
    }
  }

  public isAtEnd(): boolean {
    return this.index === 0 || this.index === this.values.length - 1;
  }

  public isWithinRange(index?: number): boolean {
    const idx = index ?? this.index;
    return idx >= 0 && idx < this.values.length;
  }

  protected toIndex(index: number): void {
    this.index = index;
  }

  private toBraille(data: number[]): string[] {
    const braille = [];

    const range = (this.max - this.min) / 4;
    const low = this.min + range;
    const medium = low + range;
    const high = medium + range;

    for (let i = 0; i < data.length; i++) {
      if (data[i] <= low) {
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
