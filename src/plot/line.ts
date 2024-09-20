import {Maidr} from './grammar';
import {AbstractPlot} from './plot';
import {PlotState} from './state';

export default class LinePlot extends AbstractPlot {
  constructor(_: Maidr) {
    super(_);
  }

  moveLeft(): void {}

  moveRight(): void {}

  state(): PlotState {
    return;
  }
}
