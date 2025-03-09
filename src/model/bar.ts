import type { Layer } from '@type/maidr';
import type { AudioState, TextState } from '@type/state';
import type { BarPoint } from './grammar';
import { Orientation } from '@type/plot';
import { AbstractTrace } from './plot';

export abstract class AbstractBarPlot<T extends BarPoint> extends AbstractTrace<number> {
  protected readonly points: T[][];
  protected readonly barValues: number[][];
  protected readonly orientation: Orientation;

  protected readonly min: number[];
  protected readonly max: number[];

  protected constructor(layer: Layer, points: T[][]) {
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

    this.brailleValues = this.getBraille();
  }

  protected get values(): number[][] {
    return this.barValues;
  }

  protected audio(): AudioState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const size = isVertical ? this.values[this.row].length : this.values.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];

    return {
      min: Math.min(...this.min),
      max: Math.max(...this.max),
      size,
      index,
      value,
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

  protected getBraille(): string[][] {
    return this.barValues.map((row, index) =>
      this.createBraille(row, this.min[index], this.max[index]),
    );
  }

  protected createBraille(data: number[], min: number, max: number): string[] {
    const braille = new Array<string>();

    const range = (max - min) / 4;
    const low = min + range;
    const medium = low + range;
    const high = medium + range;

    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) {
        braille.push(' ');
      } else if (data[i] <= low) {
        braille.push('⣀');
      } else if (data[i] <= medium) {
        braille.push('⠤');
      } else if (data[i] <= high) {
        braille.push('⠒');
      } else {
        braille.push('⠉');
      }
    }

    return braille;
  }
}

export class BarPlot extends AbstractBarPlot<BarPoint> {
  public constructor(layer: Layer) {
    super(layer, [layer.data as BarPoint[]]);
  }
}
