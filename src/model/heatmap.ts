import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

export class Heatmap extends AbstractTrace<number> {
  protected readonly supportsExtrema = false;

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
    this.y = [...data.y].reverse();
    this.heatmapValues = [...data.points].reverse();

    const { min, max } = MathUtil.minMaxFrom2D(this.heatmapValues);
    this.min = min;
    this.max = max;

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

  /**
   * Update the visual position of the current point
   * This method should be called when navigation changes
   */
  protected updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }

  // new
  public override moveToNextCompareValue(direction: 'left' | 'right' | 'up' | 'down', type: 'lower' | 'higher'): boolean {
    switch (direction) {
      case 'left':
      case 'right':
        return this.search_in_row(direction, type);
      case 'up':
      case 'down':
        return this.search_in_col(direction, type);
      default:
        return false;
    }
  }

  public search_in_row(direction: 'left' | 'right', type: 'lower' | 'higher'): boolean {
    const cols = this.y.length;
    const current_col = this.col;

    const step = direction === 'left' ? -1 : 1;
    let i = current_col + step;
    while (i >= 0 && i < cols) {
      if (this.compare(this.heatmapValues[this.row][i], this.heatmapValues[this.row][current_col], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    return false;
  }

  public search_in_col(direction: 'up' | 'down', type: 'lower' | 'higher'): boolean {
    const rows = this.x.length;
    const current_row = this.row;

    const step = direction === 'up' ? 1 : -1;
    let i = current_row + step;
    while (i >= 0 && i < rows) {
      if (this.compare(this.heatmapValues[i][this.col], this.heatmapValues[current_row][this.col], type)) {
        this.row = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    return false;
  }

  public override moveUpRotor(mode: 'lower' | 'higher'): boolean {
    return this.moveToNextCompareValue('up', mode);
  }

  public override moveDownRotor(mode: 'lower' | 'higher'): boolean {
    return this.moveToNextCompareValue('down', mode);
  }
}
