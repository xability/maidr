import {AbstractPlot} from './plot';
import {HeatMapData, Maidr} from './grammar';
import {AudioState, TextState, BrailleState} from './state';

export class HeatmapPlot extends AbstractPlot {
  private readonly min: number;
  private readonly max: number;

  private readonly values: number[];
  private index: number;
  private xAxisIndex: number;
  private yAxisIndex: number;

  private readonly rowLength: number;
  private readonly columnLength: number;

  private readonly brailleValues: string[];
  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as HeatMapData;

    this.rowLength = data.length;
    this.columnLength = data[0].length;

    this.index = -1;
    this.xAxisIndex = -1;
    this.yAxisIndex = -1;

    this.values = data.flat();
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

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.values[this.index],
      crossLabel: this.yAxis,
      crossValue: this.xAxisLevels?.[this.xAxisIndex] ?? this.xAxisIndex,
    };
  }

  protected braille(): BrailleState {
    return {
      values: this.brailleValues,
      index: this.index,
    };
  }

  protected left(): void {
    if (this.index > -1) {
      this.index -= 1;
      this.xAxisIndex =
        (this.xAxisIndex - 1 + this.columnLength) % this.columnLength;
    }
  }

  protected right(): void {
    if (this.index < this.values.length) {
      this.index += 1;
      this.xAxisIndex = (this.xAxisIndex + 1) % this.columnLength;
    }
  }

  protected up(): void {
    if (this.index > -1) {
      this.index -= this.columnLength;
      this.yAxisIndex = Math.floor(this.index / this.columnLength);
    }
  }

  protected down(): void {
    if (this.index < this.values.length - this.columnLength) {
      this.index += this.columnLength;
      this.yAxisIndex = Math.floor(this.index / this.columnLength);
    }
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
