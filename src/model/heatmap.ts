import type { Maidr } from '@type/maidr';
import type { AudioState, TextState } from '@type/state';
import type { HeatmapData } from './grammar';
import { AbstractPlot } from './plot';

export class Heatmap extends AbstractPlot<number> {
  private readonly x: string[];
  private readonly y: string[];

  private readonly min: number;
  private readonly max: number;

  public constructor(maidr: Maidr) {
    super(maidr);

    const data = maidr.data as HeatmapData;
    this.x = data.x;
    this.y = data.y;

    this.values = data.points;
    this.min = Math.min(...this.values.flat());
    this.max = Math.max(...this.values.flat());

    this.row = this.values.length - 1;
    this.brailleValues = this.toBraille(this.values);
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.values.length,
      index: this.col,
      value: this.values[this.row][this.col],
    };
  }

  protected text(): TextState {
    return {
      mainLabel: this.xAxis,
      mainValue: this.x[this.col],
      crossLabel: this.yAxis,
      crossValue: this.y[this.row],
      fillLabel: this.fill,
      fillValue: String(this.values[this.row][this.col]),
    };
  }

  private toBraille(data: number[][]): string[][] {
    const braille = new Array<Array<string>>();

    const range = (this.max - this.min) / 3;
    const low = this.min + range;
    const medium = low + range;

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] === 0) {
          braille[row].push(' ');
        } else if (data[row][col] <= low) {
          braille[row].push('⠤');
        } else if (data[row][col] <= medium) {
          braille[row].push('⠒');
        } else {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }
}
