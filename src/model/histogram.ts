import {AbstractPlot} from './plot';
import {AudioState, TextState, BrailleState} from './state';
import {HistogramData, Maidr} from './grammar';

export class HistogramPlot extends AbstractPlot {
  private readonly x: number[];
  private readonly y: number[];
  private HistogramData: HistogramData;
  private index: number;

  private readonly max: number;
  private readonly min: number;

  private readonly values: number[];
  private readonly brailleValues: string[];
  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as HistogramData;

    this.HistogramData = this.extractHistogramData(data);

    this.index = -1;

    this.x = this.HistogramData.map(item => item.x);
    this.y = this.HistogramData.map(item => item.y);

    this.max = Math.max(...this.HistogramData.map(item => item.y));
    this.min = Math.min(...this.HistogramData.map(item => item.y));
    this.values = data.map(item => item.y);

    this.brailleValues = this.toBraille(this.values);
  }

  private extractHistogramData(data: HistogramData): HistogramData {
    return data.map(item => ({
      x: item.x,
      xmin: item.xmin,
      xmax: item.xmax,
      y: item.y,
      ymin: item.ymin,
      ymax: item.ymax,
    }));
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
      min: this.getXMin(),
      max: this.getXMax(),
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

  private getXMin(): number {
    if (
      this.HistogramData &&
      this.index >= 0 &&
      this.index < this.HistogramData.length
    ) {
      const currentItem = this.HistogramData[this.index];
      return currentItem.xmin;
    } else {
      return 0;
    }
  }

  private getXMax(): number {
    if (
      this.HistogramData &&
      this.index >= 0 &&
      this.index < this.HistogramData.length
    ) {
      const currentItem = this.HistogramData[this.index];
      return currentItem.xmax;
    } else {
      return 0;
    }
  }
}
