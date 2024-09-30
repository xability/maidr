import {Maidr} from './grammar';
import {AbstractPlot} from './plot';
import {AudioState, BrailleState, TextState} from './state';

// TODO: Just placeholder code. Need to be implemented.
export class LinePlot extends AbstractPlot {
  // TODO: Modify according to the grammar of lineplot
  private index = -1;
  private readonly values: number[] = [];
  constructor(_: Maidr) {
    super(_);
    // TODO: Assign index and values according to grammar of lineplot
  }

  moveLeft(): void {}

  moveRight(): void {}

  audio(): AudioState {
    return {index: 0, max: 0, min: 0, size: 0, value: 0};
  }

  public empty(): boolean {
    // TODO: Modify boundary conditions according to grammar of lineplot
    return this.index < 0 || this.index >= this.values.length;
  }

  braille(): BrailleState {
    return {values: [], index: 0};
  }

  text(): TextState {
    return {crossLabel: '', crossValue: 0, mainLabel: '', mainValue: 0};
  }
}
