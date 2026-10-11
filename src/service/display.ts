import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { Disposable } from '@type/disposable';
import type { Event, Focus } from '@type/event';
import { Emitter, MODAL_SCOPES, Scope } from '@type/event';
import { Constant } from '@util/constant';
import { currentInstructionId, describeWithInstruction, initialInstructionId, withKeyboardHelp } from '@util/instruction';
import { Stack } from '@util/stack';

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
 * Service for managing display focus, the plot's role and description, and UI
 * state transitions.
 *
 * The plot's accessible name is the chart's title and type, which
 * `maidr-component.tsx` gives it and nothing here changes (#1384). What this
 * service manages is the description: the instructions for using the chart,
 * given while the reader is entering it and taken away once they are using
 * it, so a screen reader does not read them again each time focus returns to
 * the plot.
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

  /** Every id the plot's instructions may be under: the initial one, then this service's. */
  private readonly instructionIds: readonly [string, string];

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

    this.instructionIds = [initialInstructionId(context.id), currentInstructionId(context.id)];

    this.removeInstruction();

    // One-shot: stop describing the plot with its instructions on the first
    // TextService-driven navigation update. The reader is using the chart.
    this.textChangeDisposer = this.textService.onChange(() => {
      if (!this.hasClearedOnFirstNav) {
        this.hideInstruction();
        this.hasClearedOnFirstNav = true;
      }
    });
  }

  /**
   * Cleans up resources and describes the plot with its instructions again.
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

    // NOTE: Plotly MutationObservers (stroke mirror + layout) are chart-lifetime
    // resources installed once by normalizePlotlySvg, not per focus session.
    // They must NOT be disconnected here: DisplayService.dispose() runs on every
    // focusout, and tearing them down would permanently break subplot highlight
    // mirroring on refocus. True teardown belongs to chart unmount / page unload.
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
   * Describes the plot with its instructions as it goes back to being an
   * image: the reader has left it.
   */
  private addInstruction(): void {
    this.plot.setAttribute(Constant.TITLE, this.getInstruction());
    this.describe(this.getInstruction());
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

  /**
   * Describes the plot with its instructions, without the click prompt, as it
   * becomes an application: the reader is entering it.
   */
  private removeInstruction(): void {
    if (this.hasEnteredInteractive) {
      this.hideInstruction();
    } else {
      this.describe(this.getInstruction(false));
    }
    this.plot.removeAttribute(Constant.TITLE);
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot.tabIndex = 0;
  }

  /**
   * Describes the plot by the given instructions, written into the element
   * this service keeps beside it, never the one React renders.
   * @param {string} instruction - The instructions for where the reader is
   */
  private describe(instruction: string): void {
    const element = this.currentInstructionElement();
    if (element === null) {
      return;
    }
    element.textContent = withKeyboardHelp(instruction);
    describeWithInstruction(this.plot, this.instructionIds, element.id);
  }

  /**
   * Stops describing the plot by its instructions. Any other description a
   * page gave it stays.
   */
  private hideInstruction(): void {
    describeWithInstruction(this.plot, this.instructionIds, null);
  }

  /**
   * This service's instruction element, created beside the plot the first
   * time the chart is focused and kept for the next. Looked up among the
   * plot's siblings rather than by document id, so a chart that shares its id
   * with another on the page writes into its own figure.
   * @returns {HTMLElement | null} The element, or null when the plot has no parent
   */
  private currentInstructionElement(): HTMLElement | null {
    const parent = this.plot.parentElement;
    if (parent === null) {
      return null;
    }
    const [initialId, currentId] = this.instructionIds;
    const siblings = Array.from(parent.children);
    const existing = siblings.find(child => child.id === currentId);
    if (existing instanceof HTMLElement) {
      return existing;
    }
    const element = this.plot.ownerDocument.createElement('div');
    element.id = currentId;
    element.hidden = true;
    (siblings.find(child => child.id === initialId) ?? this.plot).after(element);
    return element;
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
   * Enters label scope (TRACE_LABEL or FIGURE_LABEL) while preserving
   * the current scope on the stack. This allows proper restoration
   * when exiting label scope.
   *
   * Note: Label scopes are not pushed to focusStack (which only holds Focus types).
   * The previous scope is preserved in focusStack and used when exiting.
   * @param {Scope} labelScope - The label scope to enter (TRACE_LABEL or FIGURE_LABEL)
   */
  public enterLabelScope(labelScope: Scope): void {
    // Don't modify focusStack - label scopes aren't Focus types
    // Just switch the hotkeys scope; focusStack retains the previous scope
    this.context.toggleScope(labelScope);
  }

  /**
   * Exits label scope and returns to the previous scope that was
   * active before entering label mode.
   *
   * Uses the focusStack to determine the correct scope to return to,
   * which preserves the scope that was active before entering label mode
   * (e.g., TRACE, BRAILLE, etc.).
   */
  public exitLabelScope(): void {
    // Get the previous scope from focusStack (or default to TRACE if empty)
    const previousScope = this.focusStack.peek() ?? Scope.TRACE;
    this.context.toggleScope(previousScope);
  }

  /**
   * Syncs the focusStack to match the current scope without triggering
   * a full focus change event. Use this when the scope has changed via
   * Context (e.g., entering a subplot) but focusStack needs to stay in sync.
   * @param {Focus} scope - The scope to set as the current focus
   */
  public syncFocusStack(scope: Focus): void {
    this.focusStack.clear();
    this.focusStack.push(scope);
  }

  /**
   * Toggles focus between different scopes and manages the focus stack.
   * @param {Focus} focus - The focus scope to toggle to
   */
  public toggleFocus(focus: Focus): void {
    // Treat modal scopes as mode toggles so we suppress instruction re-announce on return
    this.isReturningFromModeToggle = MODAL_SCOPES.has(focus);

    // Stop describing the plot by its instructions when entering a modal:
    // focus comes back to the plot after it, and they would be read again.
    if (this.isReturningFromModeToggle) {
      this.hideInstruction();
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
      const activeType = this.context.activeLevel;
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
    // CANDLESTICK_DELTA is plot navigation (like TRACE), so the plot element
    // must (re)take DOM focus when the virtual delta layer becomes active.
    if (newScope === 'TRACE' || newScope === 'SUBPLOT' || newScope === 'CANDLESTICK_DELTA') {
      this.plot.tabIndex = 0;
      setTimeout((): void => {
        // Only run first-entry init when NOT returning from a modal
        if (!this.isReturningFromModeToggle) {
          // Ensure the active trace is initialized exactly once
          const active = this.context.active;
          if (active && hasEnsureInitialized(active)) {
            active.ensureInitialized();
          }
          // Stop describing the plot by its instructions on first entry
          // into interactive
          if (!this.hasEnteredInteractive) {
            this.hideInstruction();
          }
        } else {
          // On return from modal, ensure the instructions stay off
          this.isReturningFromModeToggle = false;
          this.hideInstruction();
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
