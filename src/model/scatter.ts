import {AbstractPlot} from './plot';
import {AudioState, AutoplayState, BrailleState, TextState} from './state';
import {Maidr, ScatterData, ScatterDataTransformed} from './grammar';
import {MovableDirection} from '../core/interface';

export class ScatterPlot extends AbstractPlot {
  private readonly min: number;
  private readonly max: number;

  private index: number;
  private readonly values: number[];
  private readonly brailleValues: string[];

  private readonly scatterData: ScatterDataTransformed[];

  constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as ScatterData[];

    this.scatterData = this.transformScatterData(data);
    this.values = data.map(point => point.x);
    this.index = -1;
    this.min = Math.min(...this.values);
    this.max = Math.max(...this.values);

    this.brailleValues = this.toBraille();
  }

  private transformScatterData(data: ScatterData[]): ScatterDataTransformed[] {
    const scatterData: ScatterDataTransformed[] = [];

    data.forEach(point => {
      const existingRow = scatterData.find(row => row[0] === point.x);
      if (existingRow) {
        existingRow[1].push(point.y);
      } else {
        scatterData.push([point.x, [point.y]]);
      }
    });

    return scatterData;
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
      mainValue: this.values[this.index],
      crossLabel: this.yAxis,
      crossValue:
        this.scatterData.find(row => row[0] === this.values[this.index])?.[1] ||
        [],
    };
  }

  public isMovable(target: number | MovableDirection): boolean {
    switch (target) {
      case MovableDirection.UPWARD:
        throw new Error('Upward movement is not supported on this plot.');

      case MovableDirection.DOWNWARD:
        throw new Error('Downward movement is not supported on this plot.');

      case MovableDirection.FORWARD:
        return this.index < this.values.length - 1;

      case MovableDirection.BACKWARD:
        return this.index > 0;

      default:
        return (
          this.index >= 0 &&
          this.index < this.values.length &&
          target >= 0 &&
          target < this.values.length
        );
    }
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.values.length,
      DOWNWARD: this.values.length,
      FORWARD: this.values.length,
      BACKWARD: this.values.length,
    };
  }

  public moveToExtreme(direction: MovableDirection) {
    const movement = {
      UPWARD: () => (this.row = 0),
      DOWNWARD: () => (this.row = this.values.length - 1),
      FORWARD: () => (this.col = this.values.length - 1),
      BACKWARD: () => (this.col = 0),
    };

    movement[direction]();
    this.notifyStateUpdate();
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
