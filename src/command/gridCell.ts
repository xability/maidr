import type { Context } from '@model/context';
import type { Command } from './command';

/**
 * Command to enter grid cell mode for navigating points within a cell.
 */
export class EnterGridCellCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.enterGridCell();
  }
}

/**
 * Command to exit grid cell mode and return to grid navigation.
 */
export class ExitGridCellCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.exitGridCell();
  }
}

/**
 * Command to move to the previous point within the current grid cell.
 */
export class GridCellMoveLeftCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveCellPointLeft();
  }
}

/**
 * Command to move to the next point within the current grid cell.
 */
export class GridCellMoveRightCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveCellPointRight();
  }
}
