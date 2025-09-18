import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

export class Heatmap extends AbstractTrace<number> {
  protected readonly supportsExtrema = false;

  private readonly heatmapValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

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
    this.highlightCenters = this.mapSvgElementsToCenters();
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
      fill: {
        label: this.fill,
        value: String(this.heatmapValues[this.row][this.col]),
      },
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

  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    let svgElements: (SVGElement | SVGElement[])[][] | null;
    svgElements = this.highlightValues;

    if (!svgElements) {
      return null;
    }

    const centers: {
      x: number;
      y: number;
      row: number;
      col: number;
      element: SVGElement;
    }[] = [];
    for (let row = 0; row < svgElements.length; row++) {
      for (let col = 0; col < svgElements[row].length; col++) {
        const element = svgElements[row][col];
        const targetElement = Array.isArray(element) ? element[0] : element;
        if (targetElement) {
          const bbox = targetElement.getBoundingClientRect();
          centers.push({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
            row,
            col,
            element: targetElement,
          });
        }
      }
    }

    return centers;
  }

  public findNearestPoint(
    x: number,
    y: number,
  ): { element: SVGElement; row: number; col: number } | null {
    // loop through highlightCenters to find nearest point
    if (!this.highlightCenters) {
      return null;
    }

    let nearestDistance = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < this.highlightCenters.length; i++) {
      const center = this.highlightCenters[i];
      const distance = Math.hypot(center.x - x, center.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    if (nearestIndex === -1) {
      return null;
    }

    return {
      element: this.highlightCenters[nearestIndex].element,
      row: this.highlightCenters[nearestIndex].row,
      col: this.highlightCenters[nearestIndex].col,
    };
  }
}
