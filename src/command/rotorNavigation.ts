import type { Context } from '@model/context';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import type { Command } from './command';

export class RotorNavigationNextNavUnitCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;
  private readonly context: Context;
  public constructor(context: Context, rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
    this.context = context;
  }

  public execute(): void {
    this.rotorNavigationViewModel.moveToNextNavUnit();
    const state = this.context.state;
    if (state.type === 'trace') {
      this.rotorNavigationViewModel.toggle(state);
    }
  }
}

export class RotorNavigationPrevNavUnitCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;
  private readonly context: Context;
  public constructor(context: Context, rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
    this.context = context;
  }

  public execute(): void {
    this.rotorNavigationViewModel.moveToPrevNavUnit();
    const state = this.context.state;
    if (state.type === 'trace') {
      this.rotorNavigationViewModel.toggle(state);
    }
  }
}

export class RotorNavigationMoveUpCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  public execute(): void {
    this.rotorNavigationViewModel.moveUp();
  }
}

export class RotorNavigationMoveLeftCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  public execute(): void {
    this.rotorNavigationViewModel.moveLeft();
  }
}

export class RotorNavigationMoveDownCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  public execute(): void {
    this.rotorNavigationViewModel.moveDown();
  }
}

export class RotorNavigationMoveRightCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  public execute(): void {
    this.rotorNavigationViewModel.moveRight();
  }
}

