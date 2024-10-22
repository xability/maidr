import {LineData, Maidr} from './grammar';
import {AbstractPlot} from './plot';
import {AudioState, BrailleState, TextState} from './state';

export class LinePlot extends AbstractPlot {
  private readonly x: number[] | string[] = [];
  private readonly y: number[] | string[] = [];

  private index: number;
  private readonly values: number[] = [];
  private readonly brailleValues: string[] = [];

  private readonly min: number;
  private readonly max: number;

  constructor(maidr: Maidr) {
    super(maidr);
    const data = maidr.data as LineData;
    this.index = -1;

    this.x = data.map(d => d.x);
    this.y = data.map(d => d.y).filter(e => typeof e === 'number');

    this.values = this.y.filter(e => typeof e === 'number');

    this.min = Math.min(...this.values);
    this.max = Math.max(...this.values);

    this.brailleValues = this.toBraille(this.values);
  }

  audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.values.length,
      index: this.index,
      value: this.values[this.index],
    };
  }

  braille(): BrailleState {
    return {values: this.brailleValues, index: this.index};
  }

  text(): TextState {
    return {
      mainLabel: this.yAxis,
      mainValue: this.y[this.index],
      crossLabel: this.xAxis,
      crossValue: this.x[this.index],
    };
  }

  protected down(): void {
    throw new Error(`Move up not supported for ${this.type}`);
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

  protected toIndex(index: number): void {}

  protected isWithinRange(index?: number): boolean {
    const idx = index ?? this.index;
    return idx > 0 || idx <= this.values.length;
  }

  private toBraille(values: number[]): string[] {
    const braille = [];

    const range = (this.max - this.min) / 4;
    const low = this.min + range;
    const medium = low + range;
    const medium_high = medium + range;
    const high = medium_high + range;

    for (let i = 0; i < values.length; i++) {
      if (values[i] <= low && i - 1 >= 0 && values[i - 1] > low) {
        // move from higher ranges to low
        if (values[i - 1] <= medium) {
          // move away from medium range
          braille.push('⢄');
        } else if (values[i - 1] <= medium_high) {
          // move away from medium high range
          braille.push('⢆');
        } else if (values[i - 1] > medium_high) {
          // move away from high range
          braille.push('⢇');
        }
      } else if (values[i] <= low) {
        // in the low range
        braille.push('⣀');
      } else if (i - 1 >= 0 && values[i - 1] <= low) {
        // move from low to higher ranges
        if (values[i] <= medium) {
          // move to medium range
          braille.push('⡠');
        } else if (values[i] <= medium_high) {
          // move to medium high range
          braille.push('⡰');
        } else if (values[i] > medium_high) {
          // move to high range
          braille.push('⡸');
        }
      } else if (values[i] <= medium && i - 1 >= 0 && values[i - 1] > medium) {
        if (values[i - 1] <= medium_high) {
          // move away from medium high range to medium
          braille.push('⠢');
        } else if (values[i - 1] > medium_high) {
          // move away from high range
          braille.push('⠣');
        }
      } else if (values[i] <= medium) {
        braille.push('⠤');
      } else if (i - 1 >= 0 && values[i - 1] <= medium) {
        // move from medium to higher ranges
        if (values[i] <= medium_high) {
          // move to medium high range
          braille.push('⠔');
        } else if (values[i] > medium_high) {
          // move to high range
          braille.push('⠜');
        }
      } else if (
        values[i] <= medium_high &&
        i - 1 >= 0 &&
        values[i - 1] > medium_high
      ) {
        // move away from high range to medium high
        braille.push('⠑');
      } else if (values[i] <= medium_high) {
        braille.push('⠒');
      } else if (i - 1 >= 0 && values[i - 1] <= medium_high) {
        // move from medium high to high range
        braille.push('⠊');
      } else if (values[i] <= high) {
        braille.push('⠉');
      }
    }
    return braille;
  }
}
