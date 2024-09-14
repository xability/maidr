import Audio from '../audio';
import BarPlot from './bar';
import LinePlot from './line';
import Maidr from '../maidr';
import Plot from './plot';

enum PlotType {
  BAR = 'bar',
  LINE = 'line',
}

export default abstract class PlotFactory {
  private static readonly audio: Audio = new Audio();

  public static create(maidr: Maidr): Plot {
    switch (maidr.type) {
      case PlotType.BAR:
        return new BarPlot(this.audio, maidr);

      case PlotType.LINE:
        return new LinePlot(this.audio, maidr);

      default:
        throw new Error(`Invalid plot type: ${maidr.type}`);
    }
  }
}
