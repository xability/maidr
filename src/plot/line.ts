import {Maidr} from './grammar';
import {AbstractPlot} from './plot';
import {AudioState, BrailleState, TextState} from './state';

export class LinePlot extends AbstractPlot {
  constructor(_: Maidr) {
    super(_);
  }

  moveLeft(): void {}

  moveRight(): void {}

  audio(): AudioState {
    return {index: 0, max: 0, min: 0, size: 0, value: 0};
  }

  braille(): BrailleState {
    return {braille: [], index: 0};
  }

  text(): TextState {
    return {crossLabel: '', crossValue: 0, mainLabel: '', mainValue: 0};
  }
}
