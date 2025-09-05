import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { Disposable } from '@type/disposable';
import type { Event, Focus } from '@type/event';
import { Emitter } from '@type/event';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';

// Type for traces that support ensureInitialized method
interface TraceWithEnsureInitialized {
  ensureInitialized: () => void;
}

// Type guard to check if trace supports ensureInitialized
function hasEnsureInitialized(trace: unknown): trace is TraceWithEnsureInitialized {
  return trace !== null
    && typeof trace === 'object'
    && 'ensureInitialized' in trace
    && typeof (trace as any).ensureInitialized === 'function';
}

interface FocusChangedEvent {
  value: Focus;
}

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

  public dispose(): void {
    this.addInstruction();

    this.textChangeDisposer?.dispose();
    this.textChangeDisposer = null;

    this.onChangeEmitter.dispose();
  }

  public getInstruction(includeClickPrompt: boolean = true): string {
    return this.context.getInstruction(includeClickPrompt);
  }

  private addInstruction(): void {
    this.plot.setAttribute(Constant.ARIA_LABEL, this.getInstruction());
    this.plot.setAttribute(Constant.TITLE, this.getInstruction());
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

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

  private getTraceAriaLabel(): string {
    const formatted = this.textService.format(this.context.state);
    if (formatted && formatted.trim().length > 0) {
      return formatted;
    }
    return this.getInstruction(false);
  }

  public toggleFocus(focus: Focus): void {
    // Treat modal scopes as mode toggles so we suppress instruction re-announce on return
    this.isReturningFromModeToggle
      = focus === 'BRAILLE'
      || focus === 'REVIEW'
      || focus === 'GO_TO_EXTREMA'
      || focus === 'COMMAND_PALETTE';

    // Clear any existing instruction label when entering a modal
    if (this.isReturningFromModeToggle) {
      this.plot.removeAttribute(Constant.ARIA_LABEL);
    }

    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }

    const newScope = this.focusStack.peek()!;
    this.context.toggleScope(newScope);
    this.updateFocus(newScope);
  }

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
