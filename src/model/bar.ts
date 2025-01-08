import {AbstractBarPlot} from './plot';
import {BarPoint, Maidr} from './grammar';

export class BarPlot extends AbstractBarPlot<BarPoint> {
  constructor(maidr: Maidr) {
    super(maidr, [maidr.data as BarPoint[]]);
  }
}
