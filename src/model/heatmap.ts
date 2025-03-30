import type { MaidrLayer } from '@type/maidr';
import type { AudioState, HighlightState, TextState } from '@type/state';
import type { HeatmapData } from './grammar';
import { AbstractTrace } from './plot';

export class Heatmap extends AbstractTrace<number> {
  private readonly heatmapValues: number[][];
  protected readonly brailleValues: string[][];
  private readonly highlightValues: SVGElement[][];

  private readonly x: string[];
  private readonly y: string[];

  private readonly min: number;
  private readonly max: number;

  public constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as HeatmapData;
    this.x = data.x;
    this.y = data.y;

    this.heatmapValues = data.points;
    this.min = Math.min(...this.heatmapValues.flat());
    this.max = Math.max(...this.heatmapValues.flat());

    this.brailleValues = this.mapToBraille(this.heatmapValues);
    this.highlightValues = this.mapToSvgElements(layer.selectors as string);
  }

  public destroy(): void {
    this.heatmapValues.length = 0;
    this.brailleValues.length = 0;
    this.highlightValues.length = 0;

    this.x.length = 0;
    this.y.length = 0;

    super.destroy();
  }

  protected get values(): number[][] {
    return this.heatmapValues;
  }

  protected audio(): AudioState {
    return {
      min: this.min,
      max: this.max,
      size: this.heatmapValues.length,
      index: this.col,
      value: this.heatmapValues[this.row][this.col],
    };
  }

  protected text(): TextState {
    return {
      main: { label: this.xAxis, value: this.x[this.col] },
      cross: { label: this.yAxis, value: this.y[this.row] },
      fill: { label: this.fill, value: String(this.heatmapValues[this.row][this.col]) },
    };
  }

  protected highlight(): HighlightState {
    if (this.highlightValues.length === 0) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
      };
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
  }

  private mapToBraille(data: number[][]): string[][] {
    const braille = new Array<Array<string>>();

    const range = (this.max - this.min) / 3;
    const low = this.min + range;
    const medium = low + range;

    for (let row = 0; row < this.values.length; row++) {
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

  private mapToSvgElements(selector?: string): SVGElement[][] {
    const svgElements = new Array<Array<SVGElement>>();
    if (!selector) {
      return svgElements;
    }

    const numRows = this.heatmapValues.length;
    const numCols = this.heatmapValues[0].length;
    const domElements = Array.from(document.querySelectorAll<SVGElement>(selector));
    if (domElements.length === 0 || domElements.length !== numRows * numCols) {
      return svgElements;
    }

    if (domElements[0] instanceof SVGPathElement) {
      for (let r = 0; r < numRows; r++) {
        const rowIndex = numRows - 1 - r;
        const row = new Array<SVGElement>();
        for (let c = 0; c < numCols; c++) {
          const flatIndex = rowIndex * numCols + c;
          row.push(domElements[flatIndex]);
        }
        svgElements.push(row);
      }
    } else if (domElements[0] instanceof SVGRectElement) {
      for (let r = 0; r < numRows; r++) {
        const row = new Array<SVGElement>();
        for (let c = 0; c < numCols; c++) {
          const flatIndex = c * numRows + r;
          row.push(domElements[flatIndex]);
        }
        svgElements.push(row);
      }
    }

    return svgElements;
  }
}
