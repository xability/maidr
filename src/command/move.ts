import type { Context } from '@model/context';
import type { BrailleService } from '@service/braille';
import type { DisplayService } from '@service/display';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { Command } from './command';
import { Scope } from '@type/event';

/**
 * Command to move the current position one step upward.
 */
export class MoveUpCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveUpCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move up operation by moving the position one step upward.
   */
  public execute(): void {
    this.context.moveOnce('UPWARD');
  }
}

/**
 * Command to move the current position one step downward.
 */
export class MoveDownCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveDownCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move down operation by moving the position one step downward.
   */
  public execute(): void {
    this.context.moveOnce('DOWNWARD');
  }
}

/**
 * Command to move the current position one step to the left.
 */
export class MoveLeftCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveLeftCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move left operation by moving the position one step backward.
   */
  public execute(): void {
    this.context.moveOnce('BACKWARD');
  }
}

/**
 * Command to move the current position one step to the right.
 */
export class MoveRightCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveRightCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move right operation by moving the position one step forward.
   */
  public execute(): void {
    this.context.moveOnce('FORWARD');
  }
}

/**
 * Command to move the current position to the topmost extreme.
 */
export class MoveToTopExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToTopExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the topmost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('UPWARD');
  }
}

/**
 * Command to move the current position to the bottommost extreme.
 */
export class MoveToBottomExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToBottomExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the bottommost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('DOWNWARD');
  }
}

/**
 * Command to move the current position to the leftmost extreme.
 */
export class MoveToLeftExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToLeftExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the leftmost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('BACKWARD');
  }
}

/**
 * Command to move the current position to the rightmost extreme.
 */
export class MoveToRightExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToRightExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the rightmost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('FORWARD');
  }
}

/**
 * Command to move into the trace context from the current subplot.
 *
 * Architectural note: this command holds references to BrailleService and
 * DisplayService (not just Context) as a deliberate exception to the usual
 * pattern where commands only interact with the model layer. This is needed
 * because the model's notifyStateUpdate() cannot be used here without
 * triggering unwanted side effects (e.g. audio on entry). Do not copy this
 * pattern without similar justification.
 */
export class MoveToTraceContextCommand implements Command {
  private readonly context: Context;
  private readonly brailleService: BrailleService;
  private readonly displayService: DisplayService;

  /**
   * Creates an instance of MoveToTraceContextCommand.
   * @param {Context} context - The context in which the move operation is performed.
   * @param {BrailleService} brailleService - The braille service to check enabled state.
   * @param {DisplayService} displayService - The display service for managing focus.
   */
  public constructor(context: Context, brailleService: BrailleService, displayService: DisplayService) {
    this.context = context;
    this.brailleService = brailleService;
    this.displayService = displayService;
  }

  /**
   * Executes the move operation to enter the subplot trace context.
   * If braille was previously enabled, directly updates the braille service
   * with the new trace's data, then restores braille display focus.
   *
   * Note: we update the braille service directly rather than calling
   * notifyStateUpdate() on the trace, because notifying all observers
   * would also trigger AudioService (playing a tone on entry) and other
   * services. Only the braille display needs to be refreshed here.
   */
  public execute(): void {
    this.context.enterSubplot();
    if (this.brailleService.isEnabled) {
      const state = this.context.state;
      // After enterSubplot(), context.state should always be a trace.
      // The guard is defensive; if it fails, braille simply shows stale data.
      if (state.type === 'trace') {
        this.brailleService.refreshDisplay(state);
      }
      this.displayService.toggleFocus(Scope.BRAILLE);
    } else {
      // Sync focusStack to TRACE so label commands (l x, l y, etc.)
      // restore to the correct scope after exiting label mode.
      this.displayService.syncFocusStack(Scope.TRACE);
    }
  }
}

/**
 * Command to move back to the subplot context from the trace context.
 */
export class MoveToSubplotContextCommand implements Command {
  private readonly context: Context;
  private readonly displayService: DisplayService;

  /**
   * Creates an instance of MoveToSubplotContextCommand.
   * @param {Context} context - The context in which the move operation is performed.
   * @param {DisplayService} displayService - The display service for focus management.
   */
  public constructor(context: Context, displayService: DisplayService) {
    this.context = context;
    this.displayService = displayService;
  }

  /**
   * Executes the move operation to exit the trace context and return to subplot.
   */
  public execute(): void {
    this.context.exitSubplot();
    // Mirror the enter path: keep the focus stack in sync with the scope, but
    // only when the exit actually happened. On a single-subplot chart
    // exitSubplot() is a no-op and the scope stays TRACE, so syncing to
    // SUBPLOT here would introduce the opposite desync.
    if (this.context.scope === Scope.SUBPLOT) {
      this.displayService.syncFocusStack(Scope.SUBPLOT);
    }
  }
}

/**
 * Command to dismiss braille focus when Escape is pressed while braille mode
 * is active. The exit path depends on whether the figure has multiple panels.
 *
 * Multi-panel figures reach braille from TRACE scope (plotContext depth 3), so
 * exitSubplot() succeeds and we return to the subplot level via a
 * screen-reader-safe sequence:
 * 1. dismissModalScope moves focus to the plot and clears the focus stack,
 * 2. exitSubplot transitions the navigation context to the subplot level,
 * 3. notifyFocusChange defers the UI update (textarea removal) so NVDA/JAWS
 *    process the focus change before the braille textarea unmounts.
 *
 * Single-panel figures have no subplot level to return to (exitSubplot() would
 * be a no-op that leaves the scope stuck in BRAILLE), so we instead replay the
 * 'b' key path: toggling braille off pops BRAILLE off the focus stack and
 * restores TRACE scope, focus stack, and UI consistently.
 */
export class ExitBrailleAndSubplotCommand implements Command {
  private readonly context: Context;
  private readonly displayService: DisplayService;
  private readonly brailleViewModel: BrailleViewModel;

  /**
   * Creates an instance of ExitBrailleAndSubplotCommand.
   * @param {Context} context - The navigation context.
   * @param {DisplayService} displayService - The display service for focus management.
   * @param {BrailleViewModel} brailleViewModel - The braille view model for the single-panel fallback.
   */
  public constructor(
    context: Context,
    displayService: DisplayService,
    brailleViewModel: BrailleViewModel,
  ) {
    this.context = context;
    this.displayService = displayService;
    this.brailleViewModel = brailleViewModel;
  }

  /**
   * Dismisses braille focus in a way that keeps scope, focus stack, and UI
   * consistent for both multi-panel and single-panel figures.
   */
  public execute(): void {
    if (this.context.isMultiPanel) {
      this.displayService.dismissModalScope(Scope.SUBPLOT);
      this.context.exitSubplot();
      this.displayService.notifyFocusChange(Scope.SUBPLOT);
      return;
    }

    const state = this.context.state;
    if (state.type === 'trace') {
      this.brailleViewModel.toggle(state);
    }
  }
}

/**
 * Command to move to the next trace in the sequence.
 */
export class MoveToNextTraceCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToNextTraceCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to step to the next trace upward.
   */
  public execute(): void {
    this.context.stepTrace('UPWARD');
  }
}

/**
 * Command to move to the previous trace in the sequence.
 */
export class MoveToPrevTraceCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToPrevTraceCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to step to the previous trace downward.
   */
  public execute(): void {
    this.context.stepTrace('DOWNWARD');
  }
}
