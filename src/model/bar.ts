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
  protected readonly highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  protected readonly orientation: Orientation;
  protected readonly min: number[];
  protected readonly max: number[];

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
    this.highlightCenters = this.mapSvgElementsToCenters(this.highlightValues);
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

  protected mapSvgElementsToCenters(
    svgElements: SVGElement[][] | null,
  ):
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
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
        const bbox = svgElements[row][col].getBoundingClientRect();
        centers.push({
          x: bbox.x + bbox.width / 2,
          y: bbox.y + bbox.height / 2,
          row,
          col,
          element: svgElements[row][col],
        });
      }
    }

    return centers;
  }

  // parent calls findNearestPoint
  // then calls isPointInBounds to confirm it can be hovered,
  // if all is good, sends row col to moveToIndex

  // hover classes
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

    if (nearestIndex == -1) {
      return null;
    }

    return {
      element: this.highlightCenters[nearestIndex].element,
      row: this.highlightCenters[nearestIndex].row,
      col: this.highlightCenters[nearestIndex].col,
    };
  }
}

export abstract class BarTrace extends AbstractBarPlot<BarPoint> {
  public isPointInBounds(
    x: number,
    y: number,
    { element, row, col }: { element: SVGElement; row: number; col: number },
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
}
