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
    
    // Use role="application" with label for clear VoiceOver focus
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot.setAttribute('aria-label', 'Interactive chart - use arrow keys to navigate');
    
    // Ensure VoiceOver can focus on this element
    this.plot.setAttribute('tabindex', '0');
  }

  public dispose(): void {
    // Don't set aria attributes on dispose - just clean up
    this.onChangeEmitter.dispose();
  }

  public getInstruction(includeClickPrompt: boolean = true): string {
    return this.context.getInstruction(includeClickPrompt);
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
      // Ensure plot is focusable for VoiceOver
      this.plot.tabIndex = 0;
      
      setTimeout((): void => {
        // Only show trace text if NOT returning from a mode toggle
        if (!this.isReturningFromModeToggle) {
          // Ensure the active trace is initialized exactly once
          const active = this.context.active;
          if (active && hasEnsureInitialized(active)) {
            active.ensureInitialized();
          }
          
          // Don't set aria-label - just track interactive state
          if (!this.hasEnteredInteractive) {
            console.log('[ARIA DEBUG] First interactive focus - no aria-label set');
            this.hasEnteredInteractive = true;
          }
        } else {
          // Reset the flag but don't set aria-label
          this.isReturningFromModeToggle = false;
          console.log('[ARIA DEBUG] Mode toggle return - no aria-label set');
        }

        // Ensure plot gets focus for VoiceOver
        this.plot.focus();
        console.log('[VOICEOVER DEBUG] Plot focused, tabIndex:', this.plot.tabIndex);
      }, 0);
    }

    this.onChangeEmitter.fire({ value: newScope });
  }
}
