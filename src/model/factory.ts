import {BarPlot} from './bar';
import {Maidr} from './grammar';
import {HeatmapPlot} from './heatmap';
import {LinePlot} from './line';
import {Plot, PlotType} from './plot';

export abstract class PlotFactory {
  public static create(maidr: Maidr): Plot {
    switch (maidr.type) {
      case PlotType.BAR:
        return new BarPlot(maidr);

      case PlotType.LINE:
        return new LinePlot(maidr);

      case PlotType.HEAT:
        return new HeatmapPlot(maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
