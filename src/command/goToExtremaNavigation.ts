import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { Command } from './command';

export class GoToExtremaMoveUpCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  public execute(): void {
    this.goToExtremaViewModel.moveUp();
  }
}

export class GoToExtremaMoveDownCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  public execute(): void {
    this.goToExtremaViewModel.moveDown();
  }
}

export class GoToExtremaSelectCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  public execute(): void {
    this.goToExtremaViewModel.selectCurrent();
  }
}

export class GoToExtremaCloseCommand implements Command {
  private readonly goToExtremaViewModel: GoToExtremaViewModel;

  public constructor(goToExtremaViewModel: GoToExtremaViewModel) {
    this.goToExtremaViewModel = goToExtremaViewModel;
  }

  public execute(): void {
    this.goToExtremaViewModel.hide();
  }
}
