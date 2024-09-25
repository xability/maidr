import {Maidr} from './grammar';
import {AbstractPlot} from './plot';
import {PlotState} from './state';

export class LinePlot extends AbstractPlot {
  constructor(_: Maidr) {
    super(_);
  }

  moveLeft(): void {}

  moveRight(): void {}

  repeatPoint(): void {}

  state(): PlotState {
    return {
      min: 0,
      max: 0,
      size: 0,
      index: 0,
      mainLabel: '',
      crossLabel: '',
      mainValue: 0,
      crossValue: 0,
      value: 0,
    };
  }
}
