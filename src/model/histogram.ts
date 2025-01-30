import {AbstractBarPlot, Orientation} from './plot';
import {HistogramPoint, Maidr} from './grammar';
import {TextState} from './state';

export class Histogram extends AbstractBarPlot<HistogramPoint> {
  public constructor(maidr: Maidr) {
    super(maidr, [maidr.data as HistogramPoint[]]);
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const min = isVertical ? point.xmin : point.ymin;
    const max = isVertical ? point.xmax : point.ymax;

    return {
      ...super.text(),
      min,
      max,
    };
  }
}
