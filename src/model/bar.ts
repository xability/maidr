import type { Maidr } from '@type/maidr';
import type { BarPoint } from './grammar';
import { AbstractBarPlot } from './plot';

export class BarPlot extends AbstractBarPlot<BarPoint> {
  public constructor(maidr: Maidr) {
    super(maidr, [maidr.data as BarPoint[]]);
  }
}
