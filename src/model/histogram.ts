import type { HistogramPoint, Maidr } from './grammar';
import type { TextState } from './state';
import { AbstractBarPlot, Orientation } from './plot';

export class Histogram extends AbstractBarPlot<HistogramPoint> {
  public constructor(maidr: Maidr) {
    super(maidr, [maidr.data as HistogramPoint[]]);
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const min = isVertical ? point.xMin : point.yMin;
    const max = isVertical ? point.xMax : point.yMax;

    return {
      ...super.text(),
      min,
      max,
    };
  }
}
