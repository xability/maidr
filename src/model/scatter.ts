import {AbstractPlot} from './plot';
import {AudioState, BrailleState, TextState} from './state';
import {Maidr, ScatterData, ScatterDataRaw} from './grammar';

export class ScatterPlot extends AbstractPlot {
  private readonly x: number[] = [];
  private readonly y: number[][] = [];

  private readonly min: number;
  private readonly max: number;

  private index: number;
  private readonly values: number[];
  private readonly brailleValues: string[];

  private readonly scatterData: ScatterData[];

  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as ScatterDataRaw;

    this.scatterData = this.transformScatterData(data);

    this.prepareScatterData();

    this.values = this.x;
    this.index = -1;
    this.min = Math.min(...this.values);
    this.max = Math.max(...this.values);

    this.brailleValues = this.toBraille();
  }

  private transformScatterData(data: ScatterDataRaw): ScatterData[] {
    const scatterData: ScatterData[] = [];

    for (let i = 0; i < data.x.length; i++) {
      const x = data.x[i];
      const y = data.y[i];

      if (
        scatterData.length > 0 &&
        scatterData[scatterData.length - 1].x === x
      ) {
        scatterData[scatterData.length - 1].y.push(y);
      } else {
        scatterData.push({x, y: [y]});
      }
    }

    return scatterData;
  }

  private prepareScatterData(): void {
    for (const dataPoint of this.scatterData) {
      this.x.push(dataPoint.x);
      this.y.push(dataPoint.y);
    }
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
    return {
      mainLabel: this.xAxis,
      mainValue: this.x[this.index],
      crossLabel: this.yAxis,
      crossValue: this.y[this.index],
    };
  }

  protected up(): void {
    throw new Error(`Move up not supported for ${this.type}`);
  }

  protected down(): void {
    throw new Error(`Move down not supported for ${this.type}`);
  }

  protected left(): void {
    if (this.index > -1) {
      console.log(this.index);
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

  private toBraille(): string[] {
    return [];
  }
}
