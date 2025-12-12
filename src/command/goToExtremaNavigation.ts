import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { Command } from './command';

/**
 * Command to move selection up in the go-to-extrema list.
 */
export class GoToExtremaMoveUpCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  /**
   * Creates an instance of GoToExtremaMoveUpCommand.
   * @param {GoToExtremaViewModel} goToExtremaViewModel - The go-to-extrema view model.
   */
  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  /**
   * Executes the command to move selection upward.
   */
  public execute(): void {
    this.goToExtremaViewModel.moveUp();
  }
}

/**
 * Command to move selection down in the go-to-extrema list.
 */
export class GoToExtremaMoveDownCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  /**
   * Creates an instance of GoToExtremaMoveDownCommand.
   * @param {GoToExtremaViewModel} goToExtremaViewModel - The go-to-extrema view model.
   */
  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  /**
   * Executes the command to move selection downward.
   */
  public execute(): void {
    this.goToExtremaViewModel.moveDown();
  }
}

/**
 * Command to select the current extrema in the list.
 */
export class GoToExtremaSelectCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  /**
   * Creates an instance of GoToExtremaSelectCommand.
   * @param {GoToExtremaViewModel} goToExtremaViewModel - The go-to-extrema view model.
   */
  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  /**
   * Executes the command to select the current extrema.
   */
  public execute(): void {
    this.goToExtremaViewModel.selectCurrent();
  }
}

/**
 * Command to close the go-to-extrema interface.
 */
export class GoToExtremaCloseCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  /**
   * Creates an instance of GoToExtremaCloseCommand.
   * @param {GoToExtremaViewModel} goToExtremaViewModel - The go-to-extrema view model.
   */
  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  /**
   * Executes the command to close the interface.
   */
  public execute(): void {
    this.goToExtremaViewModel.hide();
  }
}
