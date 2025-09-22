import type { ExtremaTarget } from '@type/extrema';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

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

  public dispose(): void {
    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  protected get values(): number[][] {
    return this.barValues;
  }

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

export class BarTrace extends AbstractBarPlot<BarPoint> {
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
   * Get a clean label for a specific point
   * @param pointIndex The index of the point
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
   * Update the visual position of the current point
   * This method should be called when navigation changes
   */
  protected updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }
}
