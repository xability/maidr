import type { Maidr } from '@type/maidr';
import type { Plot } from '@type/plot';
import { PlotType } from '@type/plot';
import { BarPlot } from './bar';
import { BoxPlot } from './box';
import { Heatmap } from './heatmap';
import { Histogram } from './histogram';
import { LinePlot } from './line';
import { SegmentedPlot } from './segmented';

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

      case PlotType.DODGED:
      case PlotType.NORMALIZED:
      case PlotType.STACKED:
        return new SegmentedPlot(maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
