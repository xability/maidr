import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
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
  private readonly context: Context;
  private readonly goToExtremaService: GoToExtremaService;
  private readonly notification: NotificationService;
  private readonly textService: TextService;

  /**
   * Creates an instance of AbstractGoToExtremeValueCommand.
   * @param {Context} context - The application context.
   * @param {GoToExtremaService} goToExtremaService - The go-to-extrema service.
   * @param {NotificationService} notification - The notification service.
   * @param {TextService} textService - The mode-aware text service.
   */
  protected constructor(
    context: Context,
    goToExtremaService: GoToExtremaService,
    notification: NotificationService,
    textService: TextService,
  ) {
    this.context = context;
    this.goToExtremaService = goToExtremaService;
    this.notification = notification;
    this.textService = textService;
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
   *
   * When the value is tied across several points, the landing is re-announced
   * with its position among them, so a reader walking the ties knows how many
   * there are and which one they are on. The live region holds one message at
   * a time, so the position is appended to the point text rather than sent on
   * its own — announcing the position alone would cost the reader the point.
   */
  public execute(): void {
    const landed = this.goToExtremaService.goToExtremeValue(this.type);
    if (!landed) {
      this.notification.notify(this.unavailableMessage);
      return;
    }

    // A value held by one point needs no disambiguation: the move already
    // announced itself through the observer chain, and "1 of 1" is noise.
    if (landed.total < 2) {
      return;
    }

    // Text mode off is a deliberate choice to navigate by tone and braille
    // alone. A notification announces regardless of that setting, so respect
    // it here rather than speaking over it.
    if (this.textService.isOff()) {
      return;
    }

    const point = this.textService.format(this.context.state);
    this.notification.notify(`${point}, ${landed.position} of ${landed.total}`);
  }
}

/**
 * Command to jump to the minimum value of the current layer.
 */
export class GoToMinValueCommand extends AbstractGoToExtremeValueCommand {
  /**
   * Creates an instance of GoToMinValueCommand.
   * @param {Context} context - The application context.
   * @param {GoToExtremaService} goToExtremaService - The go-to-extrema service.
   * @param {NotificationService} notification - The notification service.
   * @param {TextService} textService - The mode-aware text service.
   */
  public constructor(
    context: Context,
    goToExtremaService: GoToExtremaService,
    notification: NotificationService,
    textService: TextService,
  ) {
    super(context, goToExtremaService, notification, textService);
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
   * @param {Context} context - The application context.
   * @param {GoToExtremaService} goToExtremaService - The go-to-extrema service.
   * @param {NotificationService} notification - The notification service.
   * @param {TextService} textService - The mode-aware text service.
   */
  public constructor(
    context: Context,
    goToExtremaService: GoToExtremaService,
    notification: NotificationService,
    textService: TextService,
  ) {
    super(context, goToExtremaService, notification, textService);
  }

  protected get type(): 'min' | 'max' {
    return 'max';
  }

  protected get unavailableMessage(): string {
    return 'No maximum value to go to in this layer';
  }
}
