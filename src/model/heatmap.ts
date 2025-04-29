import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

export class Heatmap extends AbstractTrace<number> {
  private readonly heatmapValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;

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

    this.highlightValues = this.mapToSvgElements(layer.selectors as string);
  }

  public dispose(): void {
    this.heatmapValues.length = 0;

    this.x.length = 0;
    this.y.length = 0;

    super.dispose();
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

  protected braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.heatmapValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  protected text(): TextState {
    return {
      main: { label: this.xAxis, value: this.x[this.col] },
      cross: { label: this.yAxis, value: this.y[this.row] },
      fill: { label: this.fill, value: String(this.heatmapValues[this.row][this.col]) },
    };
  }

  private mapToSvgElements(selector?: string): SVGElement[][] | null {
    if (!selector) {
      return null;
    }

    const numRows = this.heatmapValues.length;
    const numCols = this.heatmapValues[0].length;
    const domElements = Svg.selectAllElements(selector);
    if (domElements.length === 0 || domElements.length !== numRows * numCols) {
      return null;
    }

    const svgElements = new Array<Array<SVGElement>>();
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
