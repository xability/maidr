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

  public constructor(context: Context, plot: HTMLElement, textService: TextService) {
    this.context = context;
    this.focusStack = new Stack<Focus>();
    this.focusStack.push(this.context.scope as Focus);

    this.plot = plot;
    this.textService = textService;

    this.onChangeEmitter = new Emitter<FocusChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    // Don't set aria attributes during construction - wait for first focus
    this.plot.tabIndex = 0;
  }

  public dispose(): void {
    // Don't set aria attributes on dispose - just clean up
    this.onChangeEmitter.dispose();
  }

  public getInstruction(includeClickPrompt: boolean = true): string {
    return this.context.getInstruction(includeClickPrompt);
  }

  public setInitialAriaLabel(): void {
    // Only set aria-label when explicitly requested (e.g., on first focus)
    console.log('[ARIA DEBUG] setInitialAriaLabel called');
    this.plot.setAttribute(Constant.ARIA_LABEL, this.getInstruction(false));
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
  }

  private getTraceAriaLabel(): string {
    const formatted = this.textService.format(this.context.state);
    if (formatted && formatted.trim().length > 0) {
      return formatted;
    }
    return this.getInstruction(false);
  }

  public toggleFocus(focus: Focus): void {
    // Check if this is a mode toggle (braille/review) vs a modal return
    this.isReturningFromModeToggle = focus === 'BRAILLE' || focus === 'REVIEW';

    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }

    const newScope = this.focusStack.peek()!;
    this.context.toggleScope(newScope);
    this.updateFocus(newScope);
  }

  private updateFocus(newScope: Focus): void {
    console.log('[ARIA DEBUG] updateFocus:', {
      newScope,
      isReturningFromModeToggle: this.isReturningFromModeToggle,
      hasEnteredInteractive: this.hasEnteredInteractive
    });
    
    if (newScope === 'TRACE' || newScope === 'SUBPLOT') {
      this.plot.tabIndex = 0;
      setTimeout((): void => {
        // Only show trace text if NOT returning from a mode toggle
        if (!this.isReturningFromModeToggle) {
          // Ensure the active trace is initialized exactly once
          const active = this.context.active;
          if (active && hasEnsureInitialized(active)) {
            active.ensureInitialized();
          }
          
          // Only set aria-label if this is the first time entering interactive mode
          if (!this.hasEnteredInteractive) {
            console.log('[ARIA DEBUG] First interactive focus - setting initial aria-label');
            this.plot.setAttribute(Constant.ARIA_LABEL, this.getInstruction(false));
            this.hasEnteredInteractive = true;
          } else {
            // For subsequent navigation, only set aria-label if there's actual trace text
            const label = this.getTraceAriaLabel();
            if (label && label.trim()) {
              console.log('[ARIA DEBUG] Setting trace aria-label:', { label, scope: newScope });
              this.plot.setAttribute(Constant.ARIA_LABEL, label);
            }
          }
        } else {
          // Reset the flag and show empty label to avoid announcing initial instruction
          this.isReturningFromModeToggle = false;
          console.log('[ARIA DEBUG] Setting empty aria-label (returning from mode)');
          this.plot.setAttribute(Constant.ARIA_LABEL, '');
        }

        this.plot.focus();
      }, 0);
    }

    this.onChangeEmitter.fire({ value: newScope });
  }
}
