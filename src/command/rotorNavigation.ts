import type { Context } from '@model/context';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import type { Command } from './command';

/**
 * Command to navigate to the next navigation unit in rotor navigation.
 */
export class RotorNavigationNextNavUnitCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;
  private readonly context: Context;
  /**
   * Creates an instance of RotorNavigationNextNavUnitCommand.
   * @param {Context} context - The application context.
   * @param {RotorNavigationViewModel} rotorNavigationViewModel - The rotor navigation view model.
   */
  public constructor(context: Context, rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
    this.context = context;
  }

  /**
   * Executes the command to move to the next navigation unit and toggle if state type is trace.
   */
  public execute(): void {
    this.rotorNavigationViewModel.moveToNextNavUnit();
    const state = this.context.state;
    if (state.type === 'trace') {
      this.rotorNavigationViewModel.toggle(state);
    }
  }
}

/**
 * Command to navigate to the previous navigation unit in rotor navigation.
 */
export class RotorNavigationPrevNavUnitCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;
  private readonly context: Context;
  /**
   * Creates an instance of RotorNavigationPrevNavUnitCommand.
   * @param {Context} context - The application context.
   * @param {RotorNavigationViewModel} rotorNavigationViewModel - The rotor navigation view model.
   */
  public constructor(context: Context, rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
    this.context = context;
  }

  /**
   * Executes the command to move to the previous navigation unit and toggle if state type is trace.
   */
  public execute(): void {
    this.rotorNavigationViewModel.moveToPrevNavUnit();
    const state = this.context.state;
    if (state.type === 'trace') {
      this.rotorNavigationViewModel.toggle(state);
    }
  }
}

/**
 * Command to move up in rotor navigation.
 */
export class RotorNavigationMoveUpCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  /**
   * Creates an instance of RotorNavigationMoveUpCommand.
   * @param {RotorNavigationViewModel} rotorNavigationViewModel - The rotor navigation view model.
   */
  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  /**
   * Executes the command to move up in the navigation hierarchy.
   */
  public execute(): void {
    this.rotorNavigationViewModel.moveUp();
  }
}

/**
 * Command to move left in rotor navigation.
 */
export class RotorNavigationMoveLeftCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  /**
   * Creates an instance of RotorNavigationMoveLeftCommand.
   * @param {RotorNavigationViewModel} rotorNavigationViewModel - The rotor navigation view model.
   */
  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  /**
   * Executes the command to move left in the navigation hierarchy.
   */
  public execute(): void {
    this.rotorNavigationViewModel.moveLeft();
  }
}

/**
 * Command to move down in rotor navigation.
 */
export class RotorNavigationMoveDownCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  /**
   * Creates an instance of RotorNavigationMoveDownCommand.
   * @param {RotorNavigationViewModel} rotorNavigationViewModel - The rotor navigation view model.
   */
  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  /**
   * Executes the command to move down in the navigation hierarchy.
   */
  public execute(): void {
    this.rotorNavigationViewModel.moveDown();
  }
}

/**
 * Command to move right in rotor navigation.
 */
export class RotorNavigationMoveRightCommand implements Command {
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  /**
   * Creates an instance of RotorNavigationMoveRightCommand.
   * @param {RotorNavigationViewModel} rotorNavigationViewModel - The rotor navigation view model.
   */
  public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
    this.rotorNavigationViewModel = rotorNavigationViewModel;
  }

  /**
   * Executes the command to move right in the navigation hierarchy.
   */
  public execute(): void {
    this.rotorNavigationViewModel.moveRight();
  }
}
