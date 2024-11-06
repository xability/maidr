import {BarPlot} from './bar';
import {Maidr} from './grammar';
import {LinePlot} from './line';
import {Plot, PlotType} from './plot';
import {ScatterPlot} from './scatter';

export abstract class PlotFactory {
  public static create(maidr: Maidr): Plot {
    switch (maidr.type) {
      case PlotType.BAR:
        return new BarPlot(maidr);

      case PlotType.LINE:
        return new LinePlot(maidr);

      case PlotType.POINT:
        return new ScatterPlot(maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
