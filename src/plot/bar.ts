import {AbstractPlot, Orientation} from './plot';
import {PlotState} from './state';
import {BarData, Maidr} from './grammar';

export class BarPlot extends AbstractPlot {
  private readonly x: number[] | string[];
  private readonly y: number[] | string[];

  private readonly size: number;
  private readonly min: number;
  private readonly max: number;

  private index: number;
  private values: number[] = [];

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
    this.size = this.values.length;
  }

  public state(): PlotState {
    const common = {
      min: this.min,
      max: this.max,
      size: this.size,
      index: this.index,
    };

    if (this.orientation === Orientation.VERTICAL) {
      return {
        ...common,
        mainLabel: this.xAxis,
        crossLabel: this.yAxis,
        mainValue: this.y[this.index],
        crossValue: this.x[this.index],
        value: Number(this.y[this.index]),
        brailleArray: this.calculateBrailleArray(),
      };
    } else {
      return {
        ...common,
        mainLabel: this.yAxis,
        crossLabel: this.xAxis,
        mainValue: this.x[this.index],
        crossValue: this.y[this.index],
        value: Number(this.x[this.index]),
        brailleArray: this.calculateBrailleArray(),
      };
    }
  }

  private calculateBrailleArray(): string[] {
    const range = (this.max - this.min) / 4;
    const brailleArray = [];
    const low = this.min + range;
    const medium = low + range;
    const medium_high = medium + range;

    for (let i = 0; i < this.x.length; i++) {
      if (this.values[i] <= low) {
        brailleArray.push('⣀');
      } else if (this.values[i] <= medium) {
        brailleArray.push('⠤');
      } else if (this.values[i] <= medium_high) {
        brailleArray.push('⠒');
      } else {
        brailleArray.push('⠉');
      }
    }
    return brailleArray;
  }

  public moveLeft(): void {
    this.index -= this.index > 0 ? 1 : 0;
  }

  public moveRight(): void {
    this.index += this.index < this.size - 1 ? 1 : 0;
  }

  public repeatPoint(): void {}
}
