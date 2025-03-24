import type { MaidrLayer } from '@type/maidr';
import type { AudioState, HighlightState, TextState } from '@type/state';
import type { HeatmapData } from './grammar';
import { AbstractTrace } from './plot';

export class Heatmap extends AbstractTrace<number> {
  private readonly heatValues: number[][];
  protected readonly brailleValues: string[][];

  private readonly x: string[];
  private readonly y: string[];

  private readonly min: number;
  private readonly max: number;

  public constructor(maidr: MaidrLayer) {
    super(maidr);

    const data = maidr.data as HeatmapData;
    this.x = data.x;
    this.y = data.y;

    this.heatValues = data.points;
    this.min = Math.min(...this.heatValues.flat());
    this.max = Math.max(...this.heatValues.flat());

    this.brailleValues = this.toBraille(this.heatValues);
  }

  public destroy(): void {
    this.heatValues.length = 0;
    this.brailleValues.length = 0;

    this.x.length = 0;
    this.y.length = 0;

    super.destroy();
  }

  protected get values(): number[][] {
    return this.heatValues;
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.heatValues.length,
      index: this.col,
      value: this.heatValues[this.row][this.col],
    };
  }

  protected text(): TextState {
    return {
      main: { label: this.xAxis, value: this.x[this.col] },
      cross: { label: this.yAxis, value: this.y[this.row] },
      fill: { label: this.fill, value: String(this.heatValues[this.row][this.col]) },
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
