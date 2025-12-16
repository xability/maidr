import type { Context } from '@model/context';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { Command } from './command';

/**
 * Command to toggle the go-to-extrema navigation interface.
 */
export class GoToExtremaToggleCommand implements Command {
  private readonly context: Context;
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  /**
   * Creates an instance of GoToExtremaToggleCommand.
   * @param {Context} context - The application context.
   * @param {GoToExtremaViewModel} goToExtremaViewModel - The go-to-extrema view model.
   */
  public constructor(context: Context, goToExtremaViewModel: GoToExtremaViewModel) {
    this.context = context;
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  /**
   * Executes the command to show or hide the go-to-extrema interface.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      if (this.goToExtremaViewModel.state.visible) {
        this.goToExtremaViewModel.hide();
      } else {
        const activeTrace = this.context.active;
        if (activeTrace && this.goToExtremaViewModel.isExtremaNavigable(activeTrace)) {
          this.goToExtremaViewModel.toggle(state);
        }
      }
    }
  }
}
