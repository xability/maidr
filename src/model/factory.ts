import type { Maidr } from './grammar';
import type { Plot } from './plot';
import { BarPlot } from './bar';
import { BoxPlot } from './box';
import { Heatmap } from './heatmap';
import { Histogram } from './histogram';
import { LinePlot } from './line';
import { ScatterPlot } from './scatter';
import { SegmentedPlot } from './segmented';

enum PlotType {
  BAR = 'bar',
  BOX = 'box',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  SCATTER = 'point',
  STACKED = 'stacked_bar',
}

export abstract class PlotFactory {
  public static create(maidr: Maidr): Plot {
    switch (maidr.type) {
      case PlotType.BAR:
        return new BarPlot(maidr);

      case PlotType.BOX:
        return new BoxPlot(maidr);

      case PlotType.HEATMAP:
        return new Heatmap(maidr);

      case PlotType.HISTOGRAM:
        return new Histogram(maidr);

      case PlotType.LINE:
        return new LinePlot(maidr);

      case PlotType.SCATTER:
        return new ScatterPlot(maidr);

      case PlotType.DODGED:
      case PlotType.NORMALIZED:
      case PlotType.STACKED:
        return new SegmentedPlot(maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
