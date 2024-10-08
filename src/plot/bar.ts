import {AbstractPlot, Orientation} from './plot';
import {AudioState, BrailleState, TextState} from './state';
import {BarData, FillData, Maidr} from './grammar';

export class BarPlot extends AbstractPlot {
  private readonly x: string[] | number[][];
  private readonly y: string[] | number[][];

  private min = 0;
  private max = 0;

  private index: number;
  private crossIndex: number;

  private values: number[] = [];
  private brailleValues: string[] = [];

  private fillData?: FillData;

  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as BarData;
    this.fillData = maidr.axes?.fill;

    if (
      (maidr.subtype === 'stacked' &&
        this.orientation === Orientation.VERTICAL &&
        data.x.length !== data.y[0].length) ||
      (this.orientation === Orientation.HORIZONTAL &&
        data.x[0].length !== data.y.length)
    ) {
      throw new Error(
        `len(x): ${data.x.length} and len(y): ${data.y.length} do not match`
      );
    }

    this.index = -1;
    this.crossIndex = 0;

    this.x = data.x;
    this.y = data.y;

    this.init();
  }

  protected init(): void {
    if (this.orientation === Orientation.VERTICAL) {
      this.values = (this.y[this.crossIndex] as number[]).filter(
        e => typeof e === 'number'
      );
    } else {
      this.values = (this.x[this.crossIndex] as number[]).filter(
        e => typeof e === 'number'
      );
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
        mainLabel: this.yAxis,
        mainValue: this.y[this.crossIndex][this.index],
        crossLabel: this.xAxis,
        crossValue: this.x[this.index],
        fillLabel: this.fillData?.label,
        fillValue: this.fillData?.level?.[this.crossIndex],
      };
    } else {
      return {
        mainLabel: this.xAxis,
        mainValue: this.x[this.crossIndex][this.index],
        crossLabel: this.yAxis,
        crossValue: this.y[this.index],
        fillLabel: this.fillData?.label,
        fillValue: this.fillData?.level?.[this.crossIndex],
      };
    }
  }

  // TODO: Implement 2D in bar plot to lock position and play null.
  protected up(): void {
    console.log(this.crossIndex, this.y.length);
    if (this.crossIndex < this.y.length) {
      this.crossIndex += 1;
      this.init();
    }
  }

  // TODO: Implement 2D in bar plot to lock position and play null.
  protected down(): void {
    if (this.crossIndex > 0) {
      this.crossIndex -= 1;
      this.init();
    }
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
