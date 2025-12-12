import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, TextState } from '@type/state';
import type { Dimension } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

export class Heatmap extends AbstractTrace {
  protected get values(): number[][] {
    return this.heatmapValues;
  }

  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;
  private readonly heatmapValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  private readonly x: string[];
  private readonly y: string[];

  private readonly min: number;
  private readonly max: number;

  /**
   * Creates a new Heatmap instance from a MAIDR layer
   * @param layer - The MAIDR layer containing heatmap data
   */
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
    this.movable = new MovableGrid<number>(this.heatmapValues);
  }

  /**
   * Cleans up resources and disposes of the heatmap instance
   */
  public dispose(): void {
    this.heatmapValues.length = 0;

    this.x.length = 0;
    this.y.length = 0;

    super.dispose();
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.heatmapValues[this.row][this.col],
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.heatmapValues.length,
        cols: this.heatmapValues[this.row].length,
      },
    };
  }

  protected get braille(): BrailleState {
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

  protected get text(): TextState {
    return {
      main: { label: this.xAxis, value: this.x[this.col] },
      cross: { label: this.yAxis, value: this.y[this.row] },
      fill: {
        label: this.fill,
        value: String(this.heatmapValues[this.row][this.col]),
      },
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.heatmapValues.length,
      cols: this.heatmapValues[this.row].length,
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
      // If layer.domMapping?.order === 'row', use row-major mapping for rects.
      // Otherwise, preserve current default: column-major mapping.
      if (this.layer.domMapping?.order === 'row') {
        for (let r = 0; r < numRows; r++) {
          const row = new Array<SVGElement>();
          for (let c = 0; c < numCols; c++) {
            const flatIndex = r * numCols + c;
            row.push(domElements[flatIndex]);
          }
          svgElements.push(row);
        }
      } else {
        for (let r = 0; r < numRows; r++) {
          const row = new Array<SVGElement>();
          for (let c = 0; c < numCols; c++) {
            const flatIndex = c * numRows + r;
            row.push(domElements[flatIndex]);
          }
          svgElements.push(row);
        }
      }
    }

    return svgElements;
  }

  /**
   * Updates the visual position of the current point to safe bounds
   */
  protected updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }

  /**
   * Moves to the next cell matching the comparison criteria in the specified direction
   * @param direction - Direction to search (left, right, up, or down)
   * @param type - Comparison type (lower or higher than current value)
   * @returns True if a matching cell was found and moved to
   */
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

  /**
   * Searches for a matching value in the current row
   * @param direction - Search direction (left or right)
   * @param type - Comparison type (lower or higher)
   * @returns True if a matching value was found
   */
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

  /**
   * Searches for a matching value in the current column
   * @param direction - Search direction (up or down)
   * @param type - Comparison type (lower or higher)
   * @returns True if a matching value was found
   */
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

  /**
   * Moves upward in rotor mode to find lower or higher values
   * @param mode - Comparison mode (lower or higher)
   * @returns True if movement was successful
   */
  public override moveUpRotor(mode: 'lower' | 'higher'): boolean {
    return this.moveToNextCompareValue('up', mode);
  }

  /**
   * Moves downward in rotor mode to find lower or higher values
   * @param mode - Comparison mode (lower or higher)
   * @returns True if movement was successful
   */
  public override moveDownRotor(mode: 'lower' | 'higher'): boolean {
    return this.moveToNextCompareValue('down', mode);
  }

  /**
   * Maps SVG elements to their center coordinates for click navigation
   * @returns Array of center coordinates with row/col indices or null
   */
  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const svgElements: (SVGElement | SVGElement[])[][] | null = this.highlightValues;

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

  /**
   * Finds the nearest heatmap cell to the given coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Nearest cell information or null
   */
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
