import {BarPlot} from './bar';
import {Heatmap} from './heatmap';
import {LinePlot} from './line';
import {HistogramPlot} from './histogram';
import {Maidr} from './grammar';
import {PlotType} from './plot';
import {Plot} from '../core/interface';
import {BoxPlot} from './boxplot';

export abstract class PlotFactory {
  public static create(maidr: Maidr): Plot {
    switch (maidr.type) {
      case PlotType.BAR:
        return new BarPlot(maidr);

      case PlotType.HEATMAP:
        return new Heatmap(maidr);

      case PlotType.LINE:
        return new LinePlot(maidr);

      case PlotType.HISTOGRAM:
        return new HistogramPlot(maidr);

      case PlotType.BOXPLOT:
        return new BoxPlot(maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
