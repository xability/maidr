import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { NotificationService } from '@service/notification';
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

/**
 * Base for the bracket-key shortcuts that jump straight to a trace's lowest or
 * highest value, without opening the extrema dialog.
 */
abstract class AbstractGoToExtremeValueCommand implements Command {
  private readonly goToExtremaService: GoToExtremaService;
  private readonly notification: NotificationService;

  /**
   * Creates an instance of AbstractGoToExtremeValueCommand.
   * @param {GoToExtremaService} goToExtremaService - The go-to-extrema service.
   * @param {NotificationService} notification - The notification service.
   */
  protected constructor(
    goToExtremaService: GoToExtremaService,
    notification: NotificationService,
  ) {
    this.goToExtremaService = goToExtremaService;
    this.notification = notification;
  }

  /** Which extreme this command jumps to. */
  protected abstract get type(): 'min' | 'max';

  /** Message announced when the current layer has no such extreme to jump to. */
  protected abstract get unavailableMessage(): string;

  /**
   * Executes the jump, announcing a message when the current layer offers no
   * such extreme — the key is bound across the whole scope, so it fires on
   * trace types that do not support extrema navigation as well, and a silent
   * press would read as a broken shortcut.
   */
  public execute(): void {
    if (!this.goToExtremaService.goToExtremeValue(this.type)) {
      this.notification.notify(this.unavailableMessage);
    }
  }
}

/**
 * Command to jump to the minimum value of the current layer.
 */
export class GoToMinValueCommand extends AbstractGoToExtremeValueCommand {
  /**
   * Creates an instance of GoToMinValueCommand.
   * @param {GoToExtremaService} goToExtremaService - The go-to-extrema service.
   * @param {NotificationService} notification - The notification service.
   */
  public constructor(
    goToExtremaService: GoToExtremaService,
    notification: NotificationService,
  ) {
    super(goToExtremaService, notification);
  }

  protected get type(): 'min' | 'max' {
    return 'min';
  }

  protected get unavailableMessage(): string {
    return 'No minimum value to go to in this layer';
  }
}

/**
 * Command to jump to the maximum value of the current layer.
 */
export class GoToMaxValueCommand extends AbstractGoToExtremeValueCommand {
  /**
   * Creates an instance of GoToMaxValueCommand.
   * @param {GoToExtremaService} goToExtremaService - The go-to-extrema service.
   * @param {NotificationService} notification - The notification service.
   */
  public constructor(
    goToExtremaService: GoToExtremaService,
    notification: NotificationService,
  ) {
    super(goToExtremaService, notification);
  }

  protected get type(): 'min' | 'max' {
    return 'max';
  }

  protected get unavailableMessage(): string {
    return 'No maximum value to go to in this layer';
  }
}
