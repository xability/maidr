import BarPlot from './bar';
import LinePlot from './line';
import {Maidr} from './maidr';
import {Plot} from './plot';

enum PlotType {
  BAR = 'bar',
  LINE = 'line',
}

export default abstract class PlotFactory {
  public static create(maidr: Maidr): Plot {
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
