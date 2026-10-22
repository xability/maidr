import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { Command } from './command';
import { Scope } from '@type/event';
import { canEnterGridCell } from '@type/navigation';
import { t } from '@util/i18n';
import { InvalidKeyCommand } from './invalidKey';

/**
 * Command to enter grid cell mode for navigating points within a cell.
 */
export class EnterGridCellCommand implements Command {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly invalidKey: InvalidKeyCommand;

  public constructor(context: Context, notification: NotificationService, audio: AudioService) {
    this.context = context;
    this.notification = notification;
    this.invalidKey = new InvalidKeyCommand(notification, audio);
  }

  public execute(event?: Event): void {
    // Enter is bound across the whole TRACE scope, so this fires on every trace
    // type. Traces that don't support grid navigation have no cells to enter;
    // stay silent rather than announcing a grid mode the chart does not have.
    // Nor does a trace with a grid the reader is not navigating by cells: they
    // stand on a point, and "No points in this cell" would be false.
    //
    // Braille mode binds Enter only for a grid's cells. Anywhere else it
    // answers there as it did unbound, as any key braille mode does not use:
    // with the unassigned-key warning, so a guess is never met with silence.
    if (!canEnterGridCell(this.context.active)) {
      if (this.context.scope === Scope.BRAILLE) {
        this.invalidKey.execute(event);
      }
      return;
    }

    // Grid-navigable trace: notify only when the target cell is genuinely empty.
    const success = this.context.enterGridCell();
    if (!success) {
      this.notification.notify(t('text.noPointsInCell'));
    }
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
