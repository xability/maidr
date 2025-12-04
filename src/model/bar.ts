import type { ExtremaTarget } from '@type/extrema';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

/**
 * Abstract base class for bar plot traces supporting various bar chart types.
 * Handles bar-specific navigation, extrema detection, and visual element mapping.
 */
export abstract class AbstractBarPlot<
  T extends BarPoint,
> extends AbstractTrace<number> {
  protected readonly points: T[][];
  protected readonly barValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  protected readonly orientation: Orientation;
  protected readonly min: number[];
  protected readonly max: number[];
  protected readonly supportsExtrema = true;

  protected constructor(layer: MaidrLayer, points: T[][]) {
    super(layer);

    this.points = points;
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.barValues = points.map(row =>
      row.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x),
      ),
    );
    this.min = this.barValues.map(row => MathUtil.safeMin(row));
    this.max = this.barValues.map(row => MathUtil.safeMax(row));
    this.highlightValues = this.mapToSvgElements(layer.selectors as string);
    this.highlightCenters = this.mapSvgElementsToCenters();
  }

  /**
   * Cleans up bar plot resources including points and min/max arrays.
   */
  public dispose(): void {
    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  /**
   * Gets the bar values as a 2D array.
   * @returns The bar values array
   */
  protected get values(): number[][] {
    return this.barValues;
  }

  /**
   * Gets the audio state for the current bar position.
   * @returns The current AudioState
   */
  protected audio(): AudioState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const size = isVertical
      ? this.barValues[this.row].length
      : this.barValues.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.barValues[this.row][this.col]
      : this.barValues[this.col][this.row];

    return {
      min: MathUtil.safeMin(this.min),
      max: MathUtil.safeMax(this.max),
      size,
      index,
      value,
      // Only use groupIndex if there are multiple groups (rows > 1 for stacked/dodged bars)
      ...this.getAudioGroupIndex(),
    };
  }

  /**
   * Gets the braille state for the current bar position.
   * @returns The current BrailleState
   */
  protected braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.barValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  /**
   * Gets the text state for the current bar position.
   * @returns The current TextState
   */
  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const mainLabel = isVertical ? this.xAxis : this.yAxis;
    const mainValue = isVertical ? point.x : point.y;

    const crossLabel = isVertical ? this.yAxis : this.xAxis;
    const crossValue = isVertical ? point.y : point.x;

    return {
      main: { label: mainLabel, value: mainValue },
      cross: { label: crossLabel, value: crossValue },
    };
  }

  /**
   * Maps CSS selector to SVG elements representing bars in the plot.
   * @param selector - Optional CSS selector string
   * @returns 2D array of SVG elements or null if mapping fails
   */
  protected mapToSvgElements(selector?: string): SVGElement[][] | null {
    if (!selector) {
      return null;
    }

    const svgElements = [Svg.selectAllElements(selector)];
    if (svgElements.length !== this.points.length) {
      return null;
    }
    for (let row = 0; row < this.points.length; row++) {
      if (svgElements[row].length !== this.points[row].length) {
        return null;
      }
    }

    return svgElements;
  }

  /**
   * Maps SVG elements to their center coordinates for proximity detection.
   * @returns Array of center points with element references or null if no elements exist
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
        const bbox = targetElement.getBoundingClientRect();
        if (targetElement) {
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
   * Finds the nearest bar element at the specified coordinates.
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @returns Object containing the element and its position, or null if not found
   */
  public findNearestPoint(
    x: number,
    y: number,
  ): { element: SVGElement; row: number; col: number } | null {
    // we differ from the base implementation (which is to loop through centers and return one),
    // as sometimes the closest center is not the bar we clicked on
    // so instead, we just do the hard thing and loop through all highlightValues
    if (!this.highlightValues) {
      return null;
    }

    // loop through all highlightValues, and check bounding boxes against x, y
    for (let row = 0; row < this.highlightValues.length; row++) {
      for (let col = 0; col < this.highlightValues[row].length; col++) {
        const element = this.highlightValues[row][col];
        const targetElement = Array.isArray(element) ? element[0] : element;
        const bbox = targetElement.getBoundingClientRect();
        if (
          x >= bbox.x
          && x <= bbox.x + bbox.width
          && y >= bbox.y
          && y <= bbox.y + bbox.height
        ) {
          return { element: targetElement, row, col };
        }
      }
    }

    return null;
  }
}

/**
 * Concrete implementation of a bar trace for standard bar charts.
 * Supports extrema navigation and hover interactions.
 */
export class BarTrace extends AbstractBarPlot<BarPoint> {
  /**
   * Checks if coordinates are within the bounding box of the bar element.
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @param element - Object containing the SVG element and its position
   * @returns True if coordinates are within bounds, false otherwise
   */
  public isPointInBounds(
    x: number,
    y: number,
    { element, row: _row, col: _col }: { element: SVGElement; row: number; col: number },
  ): boolean {
    // check if x y is within the bounding box of the element
    const bbox = element.getBoundingClientRect();
    return (
      x >= bbox.x
      && x <= bbox.x + bbox.width
      && y >= bbox.y
      && y <= bbox.y + bbox.height
    );
  }

  /**
   * Constructs a new BarTrace instance.
   * @param layer - The MAIDR layer configuration
   */
  public constructor(layer: MaidrLayer) {
    super(layer, [layer.data as BarPoint[]]);
  }

  /**
   * Get extrema targets for the current bar plot trace
   * Returns min and max values within the current group
   * @returns Array of extrema targets for navigation
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const targets: ExtremaTarget[] = [];
    const currentGroup = this.row;

    if (currentGroup < 0 || currentGroup >= this.barValues.length) {
      return targets;
    }

    const groupValues = this.barValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return targets;
    }

    // Use pre-computed min/max values instead of recalculating
    const groupMin = this.min[currentGroup];
    const groupMax = this.max[currentGroup];

    // Find indices of min/max values
    const maxIndex = groupValues.indexOf(groupMax);
    const minIndex = groupValues.indexOf(groupMin);

    // Add max target
    targets.push({
      label: `Max Bar at ${this.getPointLabel(maxIndex)}`,
      value: groupMax,
      pointIndex: maxIndex,
      segment: 'bar',
      type: 'max',
      navigationType: 'point',
    });

    // Add min target
    targets.push({
      label: `Min Bar at ${this.getPointLabel(minIndex)}`,
      value: groupMin,
      pointIndex: minIndex,
      segment: 'bar',
      type: 'min',
      navigationType: 'point',
    });

    return targets;
  }

  /**
   * Navigate to a specific extrema target
   * @param target The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    // Update the current point index (column)
    this.col = target.pointIndex;

    // Use common finalization method
    this.finalizeExtremaNavigation();
  }

  /**
   * Gets a clean label for a specific bar point.
   * @param pointIndex - The index of the point
   * @returns A clean label for the point
   */
  private getPointLabel(pointIndex: number): string {
    if (this.points[this.row] && this.points[this.row][pointIndex]) {
      const point = this.points[this.row][pointIndex];

      if (this.orientation === Orientation.VERTICAL) {
        return `${point.x}`;
      } else {
        return `${point.y}`;
      }
    }

    return `Point ${pointIndex}`;
  }

  /**
   * Updates the visual position of the current point ensuring it's within bounds.
   */
  protected updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }

  /**
   * Moves to the next bar that matches the comparison criteria in rotor mode.
   * @param direction - The direction to move (left or right)
   * @param type - The comparison type (lower or higher)
   * @returns True if a target was found, false otherwise
   */
  public override moveToNextCompareValue(direction: 'left' | 'right', type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.barValues.length) {
      return false;
    }

    const groupValues = this.barValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    const step = direction === 'right' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compare(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }

    return false;
  }
}
