import type { BarPoint, Maidr } from './grammar';
import { AbstractBarPlot } from './plot';

export class BarPlot extends AbstractBarPlot<BarPoint> {
  public constructor(maidr: Maidr) {
    super(maidr, [maidr.data as BarPoint[]]);
  }
}
