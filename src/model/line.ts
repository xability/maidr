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

  audio(): AudioState {
    return {index: 0, max: 0, min: 0, size: 0, value: 0};
  }

  braille(): BrailleState {
    return {values: [], index: 0};
  }

  text(): TextState {
    return {crossLabel: '', crossValue: 0, mainLabel: '', mainValue: 0};
  }

  protected down(): void {}

  protected left(): void {}

  protected right(): void {}

  protected up(): void {}

  protected toIndex(index: number): void {}

  public isWithinRange(index?: number): boolean {
    // TODO: Modify boundary conditions according to grammar of lineplot
    return this.index < 0 || this.index >= this.values.length;
  }

  public isAtEnd(): boolean {
    return false;
  }
}
