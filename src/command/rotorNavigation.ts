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
    // Note: No explicit toggle call needed here. The rotor service's moveToNextRotorUnit()
    // method internally calls setMode() which handles enabling/disabling rotor mode
    // via context.setRotorEnabled() based on the current mode (DATA_MODE disables,
    // LOWER/HIGHER_VALUE_MODE enables). The view model also updates the store with
    // the new mode value.
    this.rotorNavigationViewModel.moveToNextNavUnit();
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
    // Note: No explicit toggle call needed here. The rotor service's moveToPrevRotorUnit()
    // method internally calls setMode() which handles enabling/disabling rotor mode
    // via context.setRotorEnabled() based on the current mode (DATA_MODE disables,
    // LOWER/HIGHER_VALUE_MODE enables). The view model also updates the store with
    // the new mode value.
    this.rotorNavigationViewModel.moveToPrevNavUnit();
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
