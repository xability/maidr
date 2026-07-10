import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { CandlestickDeltaService } from '@service/candlestickDelta';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
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
 * Command to move into the trace context (activate a subplot from the
 * multi-panel figure lobby).
 *
 * Besides Context it injects BrailleService, DisplayService, AudioService, and
 * NotificationService, because it drives braille refresh, focus, the enter cue,
 * and the entry announcement itself. It cannot lean on the model's
 * notifyStateUpdate() to fan these out, because that would also fire the data
 * audio tone (and other observers) on entry — so the command performs the
 * needed feedback explicitly.
 */
export class MoveToTraceContextCommand implements Command {
  private readonly context: Context;
  private readonly brailleService: BrailleService;
  private readonly displayService: DisplayService;
  private readonly audioService: AudioService;
  private readonly notificationService: NotificationService;

  /**
   * Creates an instance of MoveToTraceContextCommand.
   * @param {Context} context - The context in which the move operation is performed.
   * @param {BrailleService} brailleService - The braille service to check enabled state.
   * @param {DisplayService} displayService - The display service for managing focus.
   * @param {AudioService} audioService - Plays the "enter subplot" cue.
   * @param {NotificationService} notificationService - Announces the entry message.
   */
  public constructor(
    context: Context,
    brailleService: BrailleService,
    displayService: DisplayService,
    audioService: AudioService,
    notificationService: NotificationService,
  ) {
    this.context = context;
    this.brailleService = brailleService;
    this.displayService = displayService;
    this.audioService = audioService;
    this.notificationService = notificationService;
  }

  /**
   * Executes the move operation to enter the subplot trace context.
   * If braille was previously enabled, directly updates the braille service
   * with the new trace's data, then restores braille display focus.
   *
   * Note: we update the braille service directly rather than calling
   * notifyStateUpdate() on the trace, because notifying all observers
   * would also trigger AudioService (playing a data tone on entry) and other
   * services. Only the braille display needs to be refreshed here. The
   * entry cue below is a distinct navigational tone, not a data tone.
   *
   * On a successful entry (from the multi-panel lobby) it also plays the
   * "enter subplot" cue and announces which subplot was activated, so the
   * transition is not silent.
   */
  public execute(): void {
    // Capture the lobby position before entering; enterSubplot() only acts when
    // the active element is the figure, so a non-figure state means no entry.
    const before = this.context.state;
    const lobby = before.type === 'figure' && !before.empty ? before : null;

    this.context.enterSubplot();
    const brailleEnabled = this.brailleService.isEnabled;
    if (brailleEnabled) {
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

    if (lobby) {
      this.audioService.playSubplotEnterTone();
      // Skip the spoken entry alert when we just moved focus into the braille
      // textarea: the braille display and the focus change are the feedback in
      // that path, and a simultaneous role="alert" update can be clipped or
      // reordered by the focus move. The enter cue tone still plays either way.
      if (!brailleEnabled) {
        this.notificationService.notify(this.buildEntryMessage(lobby.index, lobby.size));
      }
    }
  }

  /**
   * Builds the entry announcement from the captured lobby position and the
   * now-active trace, e.g. "Entered subplot 2 of 4, bar plot.".
   * @param {number} index - 1-based visual position of the entered subplot.
   * @param {number} size - Total number of subplots in the figure.
   */
  private buildEntryMessage(index: number, size: number): string {
    const active = this.context.state;
    const plotType = active.type === 'trace' && !active.empty ? active.plotType : '';
    const suffix = plotType ? `, ${plotType} plot` : '';
    return `Entered subplot ${index} of ${size}${suffix}.`;
  }
}

/**
 * Command to move back to the subplot context from the trace context.
 */
export class MoveToSubplotContextCommand implements Command {
  private readonly context: Context;
  private readonly displayService: DisplayService;
  private readonly audioService: AudioService;
  private readonly notificationService: NotificationService;

  /**
   * Creates an instance of MoveToSubplotContextCommand.
   * @param {Context} context - The context in which the move operation is performed.
   * @param {DisplayService} displayService - The display service for focus management.
   * @param {AudioService} audioService - Plays the "exit subplot" cue.
   * @param {NotificationService} notificationService - Announces the exit message.
   */
  public constructor(
    context: Context,
    displayService: DisplayService,
    audioService: AudioService,
    notificationService: NotificationService,
  ) {
    this.context = context;
    this.displayService = displayService;
    this.audioService = audioService;
    this.notificationService = notificationService;
  }

  /**
   * Executes the move operation to exit the trace context and return to the
   * figure lobby.
   *
   * exitSubplot() already re-announces the figure position via the observer
   * chain (TextViewModel.update clears any pending message). Announcing the
   * exit cue *after* it therefore wins: notify() sets the message that overrides
   * the nav value in the alert region, and React batches both synchronous
   * dispatches into a single re-render, so the user hears one clear
   * "Returned to figure overview" message plus the falling exit tone.
   */
  public execute(): void {
    this.context.exitSubplot();
    // Mirror the enter path: keep the focus stack in sync with the scope, but
    // only when the exit actually happened. On a single-subplot chart
    // exitSubplot() is a no-op and the scope stays TRACE, so syncing to
    // SUBPLOT here would introduce the opposite desync.
    if (this.context.scope === Scope.SUBPLOT) {
      this.displayService.syncFocusStack(Scope.SUBPLOT);
      this.audioService.playSubplotExitTone();
      this.notificationService.notify(this.buildExitMessage());
    }
  }

  /**
   * Builds the exit announcement from the figure lobby position the user
   * returned to, e.g. "Returned to figure overview, subplot 2 of 4.".
   */
  private buildExitMessage(): string {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      return `Returned to figure overview, subplot ${state.index} of ${state.size}.`;
    }
    return 'Returned to figure overview.';
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
  private readonly candlestickDeltaService: CandlestickDeltaService;

  /**
   * Creates an instance of ExitBrailleAndSubplotCommand.
   * @param {Context} context - The navigation context.
   * @param {DisplayService} displayService - The display service for focus management.
   * @param {BrailleViewModel} brailleViewModel - The braille view model for the single-panel fallback.
   * @param {CandlestickDeltaService} candlestickDeltaService - Releases the virtual delta layer on the multi-panel exit path.
   */
  public constructor(
    context: Context,
    displayService: DisplayService,
    brailleViewModel: BrailleViewModel,
    candlestickDeltaService: CandlestickDeltaService,
  ) {
    this.context = context;
    this.displayService = displayService;
    this.brailleViewModel = brailleViewModel;
    this.candlestickDeltaService = candlestickDeltaService;
  }

  /**
   * Dismisses braille focus in a way that keeps scope, focus stack, and UI
   * consistent for both multi-panel and single-panel figures.
   */
  public execute(): void {
    if (this.context.isMultiPanel) {
      // The multi-panel exit pops the active trace off the stack via
      // exitSubplot(). If that trace is the virtual delta layer, tear down
      // the delta service's own state (and reset the rotor sign-filter)
      // first, so it does not survive on the real chart layer. This command
      // manages the stack and focus itself, so discardActiveLayer() must not.
      this.candlestickDeltaService.discardActiveLayer();
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
  private readonly candlestickDeltaService: CandlestickDeltaService;

  /**
   * Creates an instance of MoveToNextTraceCommand.
   * @param {Context} context - The context in which the move operation is performed.
   * @param {CandlestickDeltaService} candlestickDeltaService - Deactivates the virtual delta layer before switching.
   */
  public constructor(context: Context, candlestickDeltaService: CandlestickDeltaService) {
    this.context = context;
    this.candlestickDeltaService = candlestickDeltaService;
  }

  /**
   * Executes the move operation to step to the next trace upward.
   * The virtual delta layer is not a subplot layer, so it must be released
   * first (reachable from braille mode, where PageUp stays bound).
   */
  public execute(): void {
    this.candlestickDeltaService.deactivateIfActive();
    this.context.stepTrace('UPWARD');
  }
}

/**
 * Command to move to the previous trace in the sequence.
 */
export class MoveToPrevTraceCommand implements Command {
  private readonly context: Context;
  private readonly candlestickDeltaService: CandlestickDeltaService;

  /**
   * Creates an instance of MoveToPrevTraceCommand.
   * @param {Context} context - The context in which the move operation is performed.
   * @param {CandlestickDeltaService} candlestickDeltaService - Deactivates the virtual delta layer before switching.
   */
  public constructor(context: Context, candlestickDeltaService: CandlestickDeltaService) {
    this.context = context;
    this.candlestickDeltaService = candlestickDeltaService;
  }

  /**
   * Executes the move operation to step to the previous trace downward.
   * The virtual delta layer is not a subplot layer, so it must be released
   * first (reachable from braille mode, where PageDown stays bound).
   */
  public execute(): void {
    this.candlestickDeltaService.deactivateIfActive();
    this.context.stepTrace('DOWNWARD');
  }
}
