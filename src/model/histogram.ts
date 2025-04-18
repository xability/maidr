import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { AbstractBarPlot } from './bar';

export class Histogram extends AbstractBarPlot<HistogramPoint> {
  public constructor(layer: MaidrLayer) {
    super(layer, [layer.data as HistogramPoint[]]);
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const min = isVertical ? point.xMin : point.yMin;
    const max = isVertical ? point.xMax : point.yMax;

    return {
      ...super.text(),
      range: { min, max },
    };
  }
}
