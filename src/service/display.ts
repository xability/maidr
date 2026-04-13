import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { Disposable } from '@type/disposable';
import type { Event, Focus } from '@type/event';
import { Emitter, Scope } from '@type/event';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import { disconnectPlotlyObservers, isPlotlyPlot } from '../adapters/plotly';

/**
 * Type for traces that support ensureInitialized method.
 */
interface TraceWithEnsureInitialized {
  ensureInitialized: () => void;
}

/**
 * Type guard to check if trace supports ensureInitialized.
 * @param {unknown} trace - The trace object to check
 * @returns {boolean} True if trace has ensureInitialized method
 */
function hasEnsureInitialized(trace: unknown): trace is TraceWithEnsureInitialized {
  return trace !== null
    && typeof trace === 'object'
    && 'ensureInitialized' in trace
    && typeof (trace as any).ensureInitialized === 'function';
}

/**
 * Event emitted when focus changes.
 */
interface FocusChangedEvent {
  value: Focus;
}

/**
 * Service for managing display focus, ARIA labels, and UI state transitions.
 */
export class DisplayService implements Disposable {
  private readonly context: Context;
  private readonly focusStack: Stack<Focus>;

  public readonly plot: HTMLElement;

  private readonly onChangeEmitter: Emitter<FocusChangedEvent>;
  public readonly onChange: Event<FocusChangedEvent>;

  private hasEnteredInteractive: boolean = false;
  private readonly textService: TextService;
  private isReturningFromModeToggle: boolean = false;
  private textChangeDisposer: Disposable | null = null;
  private hasClearedOnFirstNav: boolean = false;
  private pendingFocusChangeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates a new DisplayService instance.
   * @param {Context} context - The application context
   * @param {HTMLElement} plot - The plot element to manage
   * @param {TextService} textService - The text service for generating ARIA labels
   */
  public constructor(context: Context, plot: HTMLElement, textService: TextService) {
    this.context = context;
    this.focusStack = new Stack<Focus>();
    this.focusStack.push(this.context.scope as Focus);

    this.plot = plot;
    this.textService = textService;

    this.onChangeEmitter = new Emitter<FocusChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.removeInstruction();

    // One-shot: clear aria-label on the first TextService-driven navigation update
    this.textChangeDisposer = this.textService.onChange(() => {
      if (!this.hasClearedOnFirstNav) {
        this.plot.removeAttribute(Constant.ARIA_LABEL);
        this.hasClearedOnFirstNav = true;
      }
    });
  }

  /**
   * Cleans up resources and restores initial ARIA labels.
   */
  public dispose(): void {
    this.addInstruction();

    if (this.pendingFocusChangeTimer !== null) {
      clearTimeout(this.pendingFocusChangeTimer);
      this.pendingFocusChangeTimer = null;
    }

    this.textChangeDisposer?.dispose();
    this.textChangeDisposer = null;

    this.onChangeEmitter.dispose();

    // Disconnect Plotly-specific MutationObservers to prevent memory leaks.
    // Only affects Plotly charts; no-op for matplotlib or other chart types.
    if (isPlotlyPlot(this.plot)) {
      disconnectPlotlyObservers(this.plot);
    }
  }

  /**
   * Gets the instruction text for the plot.
   * @param {boolean} [includeClickPrompt] - Whether to include the click prompt
   * @returns {string} The instruction text
   */
  public getInstruction(includeClickPrompt: boolean = true): string {
    return this.context.getInstruction(includeClickPrompt);
  }

  /**
   * Adds instruction ARIA labels to the plot element.
   */
  private addInstruction(): void {
    this.plot.setAttribute(Constant.ARIA_LABEL, this.getInstruction());
    this.plot.setAttribute(Constant.TITLE, this.getInstruction());
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

  /**
   * Removes or updates instruction ARIA labels when entering interactive mode.
   */
  private removeInstruction(): void {
    const instruction = this.hasEnteredInteractive ? '' : this.getInstruction(false);
    if (instruction) {
      this.plot.setAttribute(Constant.ARIA_LABEL, instruction);
      this.plot.removeAttribute(Constant.TITLE);
      this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
      this.plot.tabIndex = 0;
    } else {
      this.plot.removeAttribute(Constant.ARIA_LABEL);
      this.plot.removeAttribute(Constant.TITLE);
      this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
      this.plot.tabIndex = 0;
    }
  }

  /**
   * Gets the ARIA label text for the current trace position.
   * @returns {string} The formatted trace position text or instruction
   */
  private getTraceAriaLabel(): string {
    const formatted = this.textService.format(this.context.state);
    if (formatted && formatted.trim().length > 0) {
      return formatted;
    }
    return this.getInstruction(false);
  }

  /**
   * Toggles focus between different scopes and manages the focus stack.
   * @param {Focus} focus - The focus scope to toggle to
   */
  public toggleFocus(focus: Focus): void {
    // Treat modal scopes as mode toggles so we suppress instruction re-announce on return
    this.isReturningFromModeToggle
      = focus === 'BRAILLE'
        || focus === 'REVIEW'
        || focus === 'GO_TO_EXTREMA'
        || focus === 'COMMAND_PALETTE'
        || focus === 'SETTINGS'
        || focus === 'CHAT'
        || focus === 'HELP';

    // Clear any existing instruction label when entering a modal
    if (this.isReturningFromModeToggle) {
      this.plot.removeAttribute(Constant.ARIA_LABEL);
    }

    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }

    let newScope = this.focusStack.peek()!;

    // When returning from a modal, the focusStack base may be stale.
    // For example, the user may have entered a subplot (SUBPLOT → TRACE)
    // before opening the modal, but the focusStack base was never updated.
    // Derive the correct navigation scope from the context's active plot element.
    if (this.isReturningFromModeToggle && (newScope === 'SUBPLOT' || newScope === 'TRACE')) {
      const activeType = this.context.state.type;
      const correctScope = (activeType === 'trace' ? Scope.TRACE : Scope.SUBPLOT) as Focus;
      if (newScope !== correctScope) {
        this.focusStack.clear();
        this.focusStack.push(correctScope);
        newScope = correctScope;
      }
    }

    this.context.toggleScope(newScope);
    this.updateFocus(newScope);
  }

  /**
   * Resets the focus stack to the given scope and moves focus to the plot
   * element. Does not fire a display change event — the caller must call
   * {@link notifyFocusChange} after completing any follow-up scope
   * transitions (e.g. exitSubplot) to avoid emitting a stale intermediate
   * scope.
   * @param {Focus} targetScope - The scope the focus stack should reflect
   *   after the modal is dismissed. The stack is reset to this value so it
   *   stays in sync with the hotkeys scope set by the caller.
   *
   * **Important:** The caller must ensure the hotkeys scope is set to
   * `targetScope` (e.g. via `context.exitSubplot()`) before or immediately
   * after this call. This method only updates the focus stack and DOM focus;
   * it does not change the hotkeys scope.
   */
  public dismissModalScope(targetScope: Focus): void {
    this.plot.focus();
    this.focusStack.clear();
    this.focusStack.push(targetScope);
  }

  /**
   * Fires a deferred display change event with the given scope. The
   * deferral (setTimeout 0) gives screen readers one event-loop cycle to
   * process the preceding focus change before React unmounts the modal
   * element (e.g. the braille textarea). Without this, NVDA/JAWS exit
   * focus mode when the focused element disappears from the DOM.
   *
   * Cancels any previously pending notification to avoid stale events
   * from rapid repeated calls.
   * @param {Focus} scope - The scope to emit as the new display focus
   */
  public notifyFocusChange(scope: Focus): void {
    if (this.pendingFocusChangeTimer !== null) {
      clearTimeout(this.pendingFocusChangeTimer);
    }
    this.pendingFocusChangeTimer = setTimeout(() => {
      this.pendingFocusChangeTimer = null;
      this.onChangeEmitter.fire({ value: scope });
    }, 0);
  }

  /**
   * Updates the focus state and initializes the active trace if needed.
   * @param {Focus} newScope - The new focus scope
   */
  private updateFocus(newScope: Focus): void {
    if (newScope === 'TRACE' || newScope === 'SUBPLOT') {
      this.plot.tabIndex = 0;
      setTimeout((): void => {
        // Only run first-entry init when NOT returning from a modal
        if (!this.isReturningFromModeToggle) {
          // Ensure the active trace is initialized exactly once
          const active = this.context.active;
          if (active && hasEnsureInitialized(active)) {
            active.ensureInitialized();
          }
          // Clear initial instruction label on first entry into interactive
          if (!this.hasEnteredInteractive) {
            this.plot.removeAttribute(Constant.ARIA_LABEL);
          }
        } else {
          // On return from modal, skip setting any aria-label and ensure it's cleared
          this.isReturningFromModeToggle = false;
          this.plot.removeAttribute(Constant.ARIA_LABEL);
        }

        this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
        this.plot.focus();
        if (!this.hasEnteredInteractive) {
          this.hasEnteredInteractive = true;
        }
        // Emit change after focus updates
        this.onChangeEmitter.fire({ value: newScope });
      }, 0);
    } else {
      this.onChangeEmitter.fire({ value: newScope });
    }
  }
}
