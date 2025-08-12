import type { Command, CommandContext } from './command';
import { RotorDirection, RotorNavigationUnit } from '@service/rotor-navigation';

/**
 * Enhanced move commands that check rotor navigation state before executing
 */
export class RotorAwareMoveUpCommand implements Command {
  private readonly commandContext: CommandContext;

  public constructor(commandContext: CommandContext) {
    this.commandContext = commandContext;
  }

  public execute(): void {
    const { context, rotorNavigationService } = this.commandContext;
    const currentUnit = rotorNavigationService.getCurrentUnit();

    if (currentUnit === RotorNavigationUnit.DATA_POINT) {
      // Default behavior
      context.moveOnce('UPWARD');
      return;
    }

    // Try rotor-based navigation
    const target = rotorNavigationService.findTargetForValueNavigation(
      context,
      RotorDirection.UPWARD,
      currentUnit,
    );

    if (target) {
      context.moveToIndex(target.row, target.col);
    } else {
      rotorNavigationService.emitTargetNotFound(currentUnit, RotorDirection.UPWARD);
    }
  }
}

export class RotorAwareMoveDownCommand implements Command {
  private readonly commandContext: CommandContext;

  public constructor(commandContext: CommandContext) {
    this.commandContext = commandContext;
  }

  public execute(): void {
    const { context, rotorNavigationService } = this.commandContext;
    const currentUnit = rotorNavigationService.getCurrentUnit();

    if (currentUnit === RotorNavigationUnit.DATA_POINT) {
      context.moveOnce('DOWNWARD');
      return;
    }

    const target = rotorNavigationService.findTargetForValueNavigation(
      context,
      RotorDirection.DOWNWARD,
      currentUnit,
    );

    if (target) {
      context.moveToIndex(target.row, target.col);
    } else {
      rotorNavigationService.emitTargetNotFound(currentUnit, RotorDirection.DOWNWARD);
    }
  }
}

export class RotorAwareMoveLeftCommand implements Command {
  private readonly commandContext: CommandContext;

  public constructor(commandContext: CommandContext) {
    this.commandContext = commandContext;
  }

  public execute(): void {
    const { context, rotorNavigationService } = this.commandContext;
    const currentUnit = rotorNavigationService.getCurrentUnit();

    if (currentUnit === RotorNavigationUnit.DATA_POINT) {
      context.moveOnce('BACKWARD');
      return;
    }

    const target = rotorNavigationService.findTargetForValueNavigation(
      context,
      RotorDirection.BACKWARD,
      currentUnit,
    );

    if (target) {
      context.moveToIndex(target.row, target.col);
    } else {
      rotorNavigationService.emitTargetNotFound(currentUnit, RotorDirection.BACKWARD);
    }
  }
}

export class RotorAwareMoveRightCommand implements Command {
  private readonly commandContext: CommandContext;

  public constructor(commandContext: CommandContext) {
    this.commandContext = commandContext;
  }

  public execute(): void {
    const { context, rotorNavigationService } = this.commandContext;
    const currentUnit = rotorNavigationService.getCurrentUnit();

    if (currentUnit === RotorNavigationUnit.DATA_POINT) {
      context.moveOnce('FORWARD');
      return;
    }

    const target = rotorNavigationService.findTargetForValueNavigation(
      context,
      RotorDirection.FORWARD,
      currentUnit,
    );

    if (target) {
      context.moveToIndex(target.row, target.col);
    } else {
      rotorNavigationService.emitTargetNotFound(currentUnit, RotorDirection.FORWARD);
    }
  }
}
