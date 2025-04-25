import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

export abstract class AbstractBarPlot<T extends BarPoint> extends AbstractTrace<number> {
  protected readonly points: T[][];
  protected readonly barValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;

  protected readonly orientation: Orientation;
  protected readonly min: number[];
  protected readonly max: number[];

  protected constructor(layer: MaidrLayer, points: T[][]) {
    super(layer);

    this.points = points;
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.barValues = points.map(row =>
      row.map(point => this.orientation === Orientation.VERTICAL
        ? Number(point.y)
        : Number(point.x),
      ),
    );
    this.min = this.barValues.map(row => Math.min(...row));
    this.max = this.barValues.map(row => Math.max(...row));
    this.highlightValues = this.mapToSvgElements(layer.selectors as string);
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
    const size = isVertical ? this.barValues[this.row].length : this.barValues.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.barValues[this.row][this.col]
      : this.barValues[this.col][this.row];

    return {
      min: Math.min(...this.min),
      max: Math.max(...this.max),
      size,
      index,
      value,
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
}

export class BarTrace extends AbstractBarPlot<BarPoint> {
  public constructor(layer: MaidrLayer) {
    super(layer, [layer.data as BarPoint[]]);
  }
}
