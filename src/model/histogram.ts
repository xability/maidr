import {AbstractPlot} from './plot';
import {AudioState, TextState, BrailleState} from './state';
import {HistogramData, Maidr} from './grammar';

export class HistogramPlot extends AbstractPlot {
  private readonly x: number[];
  private readonly xmax: number[];
  private readonly xmin: number[];
  private readonly y: number[];

  private index: number;

  private readonly max: number;
  private readonly min: number;

  private readonly values: number[];
  private readonly brailleValues: string[];
  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as HistogramData;

    this.index = -1;

    this.x = data.map(item => item.x);
    this.y = data.map(item => item.y);
    this.xmin = data.map(item => item.xmin);
    this.xmax = data.map(item => item.xmax);

    this.max = Math.max(...data.map(item => item.y));
    this.min = Math.min(...data.map(item => item.y));

    this.values = data.map(item => item.y);

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

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.x[this.index],
      min: this.xmin[this.index],
      max: this.xmax[this.index],
      crossLabel: this.yAxis,
      crossValue: this.y[this.index],
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues,
      index: this.index,
    };
  }

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

  protected up(): void {
    throw new Error(`Move up not supported for ${this.type}`);
  }

  protected isWithinRange(index?: number): boolean {
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
