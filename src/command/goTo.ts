import type { Context } from '@model/context';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { Command } from './command';

export class GoToExtremaCommand implements Command {
  private readonly context: Context;
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  public constructor(context: Context, goToExtremaViewModel: GoToExtremaViewModel) {
    this.context = context;
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.goToExtremaViewModel.toggle(state);
    }
  }
}
