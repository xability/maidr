import type { ExtremaTarget } from '@type/extrema';
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { isMeasured, toBarValue } from './bar';
import { MovableGrid } from './movable';

/** How an unmeasured cell is named in the data table, matching the text service. */
const MISSING_CELL = 'missing';

/**
 * Reads one grid row, keeping a cell the chart drew nothing at out of the data.
 *
 * A heat grid is a rectangle and a chart's data need not fill it, so a hole
 * arrives here as `null` -- or as a non-finite number, which is what a
 * round trip through JSON leaves of a `NaN`. `Number(null)` is `0`, which
 * would make an absent cell indistinguishable from one measured at zero: it
 * would sound like a real low reading, could be reached as the grid's
 * minimum, and would pull the range every other cell's pitch is scaled
 * against (#1191).
 *
 * `toBarValue` is the bar trace's answer to the same question, reused rather
 * than restated: `NaN` keeps the cell absent, which is what the audio service
 * already sounds as an empty tone and the text service already announces as
 * "missing".
 *
 * @param row - One row of `HeatmapData.points`
 * @returns The row's magnitudes, with every hole as `NaN`
 */
function measuredRow(row: readonly (number | null)[]): number[] {
  return row.map(cell => toBarValue(cell));
}

export class Heatmap extends AbstractTrace {
  protected get values(): number[][] {
    return this.heatmapValues;
  }

  protected readonly supportsExtrema = true;
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
    this.heatmapValues = [...data.points].reverse().map(measuredRow);

    // Measured cells only. `MathUtil.minMax` seeds from the first element and
    // every comparison against a `NaN` is false, so one hole in the corner
    // would leave both bounds `NaN` and silence the whole grid.
    const { min, max } = MathUtil.minMax(this.heatmapValues.flat().filter(isMeasured));
    this.min = min;
    this.max = max;

    this.highlightValues = this.mapToSvgElements(layer.selectors as string | string[][] | undefined);
    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovableGrid<number>(this.heatmapValues);
  }

  /**
   * Cleans up resources and disposes of the heatmap instance
   */
  public override dispose(): void {
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
      z: {
        label: this.z,
        value: this.heatmapValues[this.row][this.col],
      },
    };
  }

  /**
   * Gets the description state for the heatmap trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: 'Rows', value: this.y.length },
      { label: 'Columns', value: this.x.length },
      // A grid of nothing but holes has no range, and `-Infinity` is not one.
      { label: 'Min value', value: isMeasured(this.min) ? this.min : MISSING_CELL },
      { label: 'Max value', value: isMeasured(this.max) ? this.max : MISSING_CELL },
    ];

    const headers = [this.yAxis, ...this.x];
    const rows: (string | number)[][] = this.y.map((yLabel, r) => [
      yLabel,
      // `NaN` in a table cell reads as the string "NaN", which is a value.
      ...this.heatmapValues[r].map(cell => (isMeasured(cell) ? cell : MISSING_CELL)),
    ]);

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.heatmapValues.length,
      cols: this.heatmapValues[this.row]?.length ?? 0,
    };
  }

  private mapToSvgElements(selector?: string | string[][]): SVGElement[][] | null {
    if (!selector) {
      return null;
    }

    const numRows = this.heatmapValues.length;
    const numCols = this.heatmapValues[0].length;

    // Per-cell selector grid: `selector[r][c]` resolves to the SVG element for
    // logical row `r`, column `c`. Used by adapters (e.g. Highcharts) that
    // stamp coordinate attributes onto cells so the model→DOM mapping is
    // independent of DOM insertion order.
    if (Array.isArray(selector)) {
      if (selector.length !== numRows) {
        return null;
      }
      const svgElements: SVGElement[][] = [];
      for (let r = 0; r < numRows; r++) {
        const rowSelectors = selector[r];
        if (!Array.isArray(rowSelectors) || rowSelectors.length !== numCols) {
          return null;
        }
        const row: SVGElement[] = [];
        for (let c = 0; c < numCols; c++) {
          // Routed through `Svg` rather than `document` so a grid cell holding
          // an unusable selector degrades to "no highlight" instead of throwing.
          const el = Svg.selectElement<SVGElement>(rowSelectors[c], false);
          if (!el) {
            return null;
          }
          row.push(el);
        }
        svgElements.push(row);
      }
      return svgElements;
    }

    const domElements = Svg.selectAllElements(selector, false);

    // Plotly renders heatmaps as a single <image> element (canvas PNG).
    // Create transparent overlay rects so the highlight service can work.
    if (
      domElements.length === 1
      && domElements[0] instanceof SVGImageElement
    ) {
      return this.createOverlayRects(domElements[0], numRows, numCols);
    }

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
        // Rects are laid out top-to-bottom row-major in the DOM (as produced
        // by a standard D3 heatmap join). The model has already reversed
        // `heatmapValues` so row 0 = bottom of the visual grid (Cartesian
        // convention, matches navigation where UP increments row). Flip the
        // DOM row index so the highlight tracks that same reversal, mirroring
        // what the SVGPath branch above does.
        for (let r = 0; r < numRows; r++) {
          const rowIndex = numRows - 1 - r;
          const row = new Array<SVGElement>();
          for (let c = 0; c < numCols; c++) {
            const flatIndex = rowIndex * numCols + c;
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
   * Create transparent overlay <rect> elements on top of a Plotly heatmap
   * <image> element so the highlight service can target individual cells.
   */
  private createOverlayRects(
    imageEl: SVGImageElement,
    numRows: number,
    numCols: number,
  ): SVGElement[][] | null {
    const imgX = Number.parseFloat(imageEl.getAttribute('x') ?? '0');
    const imgY = Number.parseFloat(imageEl.getAttribute('y') ?? '0');
    const imgW = Number.parseFloat(imageEl.getAttribute('width') ?? '0');
    const imgH = Number.parseFloat(imageEl.getAttribute('height') ?? '0');

    if (imgW === 0 || imgH === 0) {
      return null;
    }

    const cellW = imgW / numCols;
    const cellH = imgH / numRows;
    const parent = imageEl.parentElement;
    if (!parent) {
      return null;
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const svgElements = new Array<Array<SVGElement>>();

    for (let r = 0; r < numRows; r++) {
      // Row 0 is the bottom of the visual grid, the same convention the rect
      // and path branches above flip the DOM index for. SVG `y` grows
      // downward, so the bottom row is the last band of the image and the
      // index has to be turned over to land on it (#971).
      const band = numRows - 1 - r;
      const row = new Array<SVGElement>();
      for (let c = 0; c < numCols; c++) {
        const rect = document.createElementNS(svgNS, 'rect') as SVGRectElement;
        rect.setAttribute('x', String(imgX + c * cellW));
        rect.setAttribute('y', String(imgY + band * cellH));
        rect.setAttribute('width', String(cellW));
        rect.setAttribute('height', String(cellH));
        rect.setAttribute('fill', 'transparent');
        rect.setAttribute('stroke', 'none');
        rect.setAttribute('pointer-events', 'none');
        Svg.markOwned(rect);
        parent.appendChild(rect);
        row.push(rect);
      }
      svgElements.push(row);
    }

    return svgElements;
  }

  /**
   * Updates the visual position of the current point to safe bounds
   */
  protected override updateVisualPointPosition(): void {
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
        this.notifyRotorBounds();
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
    const cols = this.heatmapValues[this.row].length;
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
    this.notifyRotorBounds();
    return false;
  }

  /**
   * Searches for a matching value in the current column
   * @param direction - Search direction (up or down)
   * @param type - Comparison type (lower or higher)
   * @returns True if a matching value was found
   */
  public search_in_col(direction: 'up' | 'down', type: 'lower' | 'higher'): boolean {
    const rows = this.heatmapValues.length;
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
    this.notifyRotorBounds();
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
  ): NearestPoint | null {
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
      centerX: this.highlightCenters[nearestIndex].x,
      centerY: this.highlightCenters[nearestIndex].y,
    };
  }

  /**
   * Gets extrema targets for the heatmap trace
   * @returns Array of extrema targets for navigation
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const targets: ExtremaTarget[] = [];
    const currentRow = this.row;
    const currentCol = this.col;

    // 1. Global Maximum
    const globalMax = this.findGlobalExtrema('max');
    if (globalMax) {
      targets.push({
        label: `Global Maximum: ${globalMax.value} at ${this.x[globalMax.col]}, ${this.y[globalMax.row]}`,
        value: globalMax.value,
        pointIndex: globalMax.row * this.heatmapValues[0].length + globalMax.col,
        segment: 'global',
        type: 'max',
        navigationType: 'group',
        groupIndex: globalMax.row,
        categoryIndex: globalMax.col,
        xValue: this.x[globalMax.col],
      });
    }

    // 2. Global Minimum
    const globalMin = this.findGlobalExtrema('min');
    if (globalMin) {
      targets.push({
        label: `Global Minimum: ${globalMin.value} at ${this.x[globalMin.col]}, ${this.y[globalMin.row]}`,
        value: globalMin.value,
        pointIndex: globalMin.row * this.heatmapValues[0].length + globalMin.col,
        segment: 'global',
        type: 'min',
        navigationType: 'group',
        groupIndex: globalMin.row,
        categoryIndex: globalMin.col,
        xValue: this.x[globalMin.col],
      });
    }

    // 3. Maximum on current row
    const rowMax = this.findRowExtrema(currentRow, 'max');
    if (rowMax) {
      targets.push({
        label: `Row Maximum: ${rowMax.value} at ${this.x[rowMax.col]}, ${this.y[currentRow]}`,
        value: rowMax.value,
        pointIndex: currentRow * this.heatmapValues[0].length + rowMax.col,
        segment: `row-${currentRow}`,
        type: 'max',
        navigationType: 'group',
        groupIndex: currentRow,
        categoryIndex: rowMax.col,
        xValue: this.x[rowMax.col],
      });
    }

    // 4. Minimum on current row
    const rowMin = this.findRowExtrema(currentRow, 'min');
    if (rowMin) {
      targets.push({
        label: `Row Minimum: ${rowMin.value} at ${this.x[rowMin.col]}, ${this.y[currentRow]}`,
        value: rowMin.value,
        pointIndex: currentRow * this.heatmapValues[0].length + rowMin.col,
        segment: `row-${currentRow}`,
        type: 'min',
        navigationType: 'group',
        groupIndex: currentRow,
        categoryIndex: rowMin.col,
        xValue: this.x[rowMin.col],
      });
    }

    // 5. Maximum on current column
    const colMax = this.findColExtrema(currentCol, 'max');
    if (colMax) {
      targets.push({
        label: `Column Maximum: ${colMax.value} at ${this.x[currentCol]}, ${this.y[colMax.row]}`,
        value: colMax.value,
        pointIndex: colMax.row * this.heatmapValues[0].length + currentCol,
        segment: `col-${currentCol}`,
        type: 'max',
        navigationType: 'group',
        groupIndex: colMax.row,
        categoryIndex: currentCol,
        xValue: this.x[currentCol],
      });
    }

    // 6. Minimum on current column
    const colMin = this.findColExtrema(currentCol, 'min');
    if (colMin) {
      targets.push({
        label: `Column Minimum: ${colMin.value} at ${this.x[currentCol]}, ${this.y[colMin.row]}`,
        value: colMin.value,
        pointIndex: colMin.row * this.heatmapValues[0].length + currentCol,
        segment: `col-${currentCol}`,
        type: 'min',
        navigationType: 'group',
        groupIndex: colMin.row,
        categoryIndex: currentCol,
        xValue: this.x[currentCol],
      });
    }

    return targets;
  }

  /**
   * Finds the global maximum or minimum in the heatmap
   * @param type - Whether to find 'max' or 'min'
   * @returns Object with row, col, and value of the extrema
   */
  private findGlobalExtrema(type: 'max' | 'min'): { row: number; col: number; value: number } | null {
    if (this.heatmapValues.length === 0) {
      return null;
    }

    // Seeded from the first *measured* cell rather than from cell (0, 0).
    // Every comparison against a `NaN` is false, so a hole in the corner would
    // hold the seed and the extrema would be announced as "NaN at" its label
    // -- a reading of a cell the chart drew nothing at (#1191).
    let extremaRow = -1;
    let extremaCol = -1;
    let extremaValue = Number.NaN;

    for (let r = 0; r < this.heatmapValues.length; r++) {
      for (let c = 0; c < this.heatmapValues[r].length; c++) {
        const value = this.heatmapValues[r][c];
        if (!isMeasured(value)) {
          continue;
        }
        const better = extremaRow === -1
          || (type === 'max' ? value > extremaValue : value < extremaValue);
        if (better) {
          extremaValue = value;
          extremaRow = r;
          extremaCol = c;
        }
      }
    }

    if (extremaRow === -1) {
      return null;
    }

    return { row: extremaRow, col: extremaCol, value: extremaValue };
  }

  /**
   * Finds the maximum or minimum in a specific row
   * @param rowIndex - The row index to search
   * @param type - Whether to find 'max' or 'min'
   * @returns Object with col and value of the extrema
   */
  private findRowExtrema(rowIndex: number, type: 'max' | 'min'): { col: number; value: number } | null {
    if (rowIndex < 0 || rowIndex >= this.heatmapValues.length) {
      return null;
    }

    const row = this.heatmapValues[rowIndex];
    if (row.length === 0) {
      return null;
    }

    let extremaCol = -1;
    let extremaValue = Number.NaN;

    for (let c = 0; c < row.length; c++) {
      const value = row[c];
      if (!isMeasured(value)) {
        continue;
      }
      const better = extremaCol === -1
        || (type === 'max' ? value > extremaValue : value < extremaValue);
      if (better) {
        extremaValue = value;
        extremaCol = c;
      }
    }

    if (extremaCol === -1) {
      // A row of holes has no extreme, so it offers no target rather than one
      // that lands on a cell with nothing to announce.
      return null;
    }

    return { col: extremaCol, value: extremaValue };
  }

  /**
   * Finds the maximum or minimum in a specific column
   * @param colIndex - The column index to search
   * @param type - Whether to find 'max' or 'min'
   * @returns Object with row and value of the extrema
   */
  private findColExtrema(colIndex: number, type: 'max' | 'min'): { row: number; value: number } | null {
    if (this.heatmapValues.length === 0 || colIndex < 0 || colIndex >= this.heatmapValues[0].length) {
      return null;
    }

    let extremaRow = -1;
    let extremaValue = Number.NaN;

    for (let r = 0; r < this.heatmapValues.length; r++) {
      const value = this.heatmapValues[r][colIndex];
      if (!isMeasured(value)) {
        continue;
      }
      const better = extremaRow === -1
        || (type === 'max' ? value > extremaValue : value < extremaValue);
      if (better) {
        extremaValue = value;
        extremaRow = r;
      }
    }

    if (extremaRow === -1) {
      return null;
    }

    return { row: extremaRow, value: extremaValue };
  }

  /**
   * Navigates to a specific extrema target in the heatmap
   * @param target - The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    if (target.groupIndex !== undefined && target.categoryIndex !== undefined) {
      // Navigate to the specified row and column
      this.row = target.groupIndex;
      this.col = target.categoryIndex;

      // Use common finalization method
      this.finalizeNavigation();
    }
  }
}
