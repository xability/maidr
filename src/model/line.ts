import type { MaidrLayer } from '@type/maidr';
import type { AudioState, HighlightState, TextState } from '@type/state';
import type { LinePoint } from './grammar';
import { AbstractTrace } from './plot';

const TYPE = 'Type';

export class LinePlot extends AbstractTrace<number> {
  private readonly points: LinePoint[][];
  private readonly lineValues: number[][];
  protected readonly brailleValues: string[][];

  private readonly min: number[];
  private readonly max: number[];

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as LinePoint[][];

    this.lineValues = this.points.map(row => row.map(point => Number(point.y)));
    this.min = this.lineValues.map(row => Math.min(...row));
    this.max = this.lineValues.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(this.lineValues);
  }

  public destroy(): void {
    this.points.length = 0;
    this.lineValues.length = 0;
    this.brailleValues.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.destroy();
  }

  protected get values(): number[][] {
    return this.lineValues;
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.points[this.row].length,
      index: this.col,
      value: this.points[this.row][this.col].y,
    };
  }

  protected text(): TextState {
    const point = this.points[this.row][this.col];
    const fillData = point.fill
      ? { fill: { label: TYPE, value: point.fill } }
      : {};

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: this.points[this.row][this.col].y },
      ...fillData,
    };
  }

  protected highlight(): HighlightState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
    };
  }

  private toBraille(data: number[][]): string[][] {
    const braille = new Array<Array<string>>();

    for (let row = 0; row < data.length; row++) {
      braille.push(new Array<string>());

      const range = (this.max[row] - this.min[row]) / 4;
      const low = this.min[row] + range;
      const medium = low + range;
      const mediumHigh = medium + range;
      const high = medium + range;

      for (let col = 0; col < data[row].length; col++) {
        if (data[row][col] <= low && col - 1 >= 0 && data[row][col - 1] > low) {
          if (data[row][col - 1] <= medium) {
            braille[row].push('⢄');
          } else if (data[row][col - 1] <= mediumHigh) {
            braille[row].push('⢆');
          } else if (data[row][col - 1] > mediumHigh) {
            braille[row].push('⢇');
          }
        } else if (data[row][col] <= low) {
          braille[row].push('⣀');
        } else if (col - 1 >= 0 && data[row][col - 1] <= low) {
          if (data[row][col] <= medium) {
            braille[row].push('⡠');
          } else if (data[row][col] <= mediumHigh) {
            braille[row].push('⡰');
          } else if (data[row][col] > mediumHigh) {
            braille[row].push('⡸');
          }
        } else if (
          data[row][col] <= medium
          && col - 1 >= 0
          && data[row][col - 1] > medium
        ) {
          if (data[row][col - 1] <= mediumHigh) {
            braille[row].push('⠢');
          } else if (data[row][col - 1] > mediumHigh) {
            braille[row].push('⠣');
          }
        } else if (data[row][col] <= medium) {
          braille[row].push('⠤');
        } else if (col - 1 >= 0 && data[row][col - 1] <= medium) {
          if (data[row][col] <= mediumHigh) {
            braille[row].push('⠔');
          } else if (data[row][col] > mediumHigh) {
            braille[row].push('⠜');
          }
        } else if (
          data[row][col] <= mediumHigh
          && col - 1 >= 0
          && data[row][col - 1] > mediumHigh
        ) {
          braille[row].push('⠑');
        } else if (data[row][col] <= mediumHigh) {
          braille[row].push('⠒');
        } else if (col - 1 >= 0 && data[row][col - 1] <= mediumHigh) {
          braille[row].push('⠊');
        } else if (data[row][col] <= high) {
          braille[row].push('⠉');
        }
      }
    }

    return braille;
  }
}
