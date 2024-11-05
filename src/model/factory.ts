import {BarPlot} from './bar';
import {Maidr} from './grammar';
import {LinePlot} from './line';
import {PlotType} from './plot';
import {Plottable} from "../core/interface";

export abstract class PlotFactory {
  public static create(maidr: Maidr): Plottable {
    switch (maidr.type) {
      case PlotType.BAR:
        return new BarPlot(maidr);

      case PlotType.LINE:
        return new LinePlot(maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
