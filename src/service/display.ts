import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { Disposable } from '@type/disposable';
import type { Event, Focus } from '@type/event';
import { Emitter } from '@type/event';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';

interface FocusChangedEvent {
  value: Focus;
}

export class DisplayService implements Disposable {
  private readonly context: Context;
  private readonly textService: TextService;
  private readonly focusStack: Stack<Focus>;

  public readonly plot: HTMLElement;

  private readonly onChangeEmitter: Emitter<FocusChangedEvent>;
  public readonly onChange: Event<FocusChangedEvent>;

  private originalPlotFocus: (() => void) | null = null;

  public constructor(context: Context, plot: HTMLElement, textService: TextService) {
    this.context = context;
    this.textService = textService;
    this.focusStack = new Stack<Focus>();
    this.focusStack.push(this.context.scope as Focus);

    this.plot = plot;

    this.onChangeEmitter = new Emitter<FocusChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    // Set initial instruction
    this.addInstruction();

    // Add focus event listener to prevent external focus on plot when modal is open
    this.plot.addEventListener('focus', (event) => {
      if (this.focusStack.size() > 1) {
        // Modal is open, prevent plot focus
        event.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== this.plot) {
          (activeElement as HTMLElement).focus();
        }
      }
    });
  }

  public dispose(): void {
    // Restore original focus method if it was overridden
    if (this.originalPlotFocus) {
      this.plot.focus = this.originalPlotFocus;
    }

    this.onChangeEmitter.dispose();
  }

  /**
   * Restores plot focus and accessibility when returning from modal scope
   * This ensures the plot is properly focusable and has correct ARIA labels
   */
  public restorePlotFocus(): void {
    if (this.focusStack.size() === 1) {
      this.plot.tabIndex = 0;
      this.plot.focus();
      this.setAriaLabel();
    }
  }

  public getInstruction(includeClickPrompt: boolean = true): string {
    return this.context.getInstruction(includeClickPrompt);
  }

  public addInstruction(): void {
    this.plot.setAttribute(Constant.ARIA_LABEL, this.getInstruction());
    this.plot.setAttribute(Constant.TITLE, this.getInstruction());
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

  private setAriaLabel(): void {
    // Check if we're in a modal scope - if so, don't update plot ARIA label
    if (this.focusStack.size() > 1) {
      return;
    }

    if (this.focusStack.size() === 1) {
      this.setNavigationContextLabel();
    }
  }

  private setNavigationContextLabel(): void {
    const activePlot = this.context.active;
    if (!activePlot) {
      this.plot.setAttribute(Constant.ARIA_LABEL, '');
      this.plot.setAttribute(Constant.TITLE, '');
      return;
    }

    try {
      const traceText = this.textService.getCoordinateText();

      if (traceText && typeof traceText === 'string') {
        this.plot.setAttribute(Constant.ARIA_LABEL, traceText);
        this.plot.setAttribute(Constant.TITLE, traceText);
      } else {
        // Fallback to activeTrace.text() if available
        const fallbackText = (activePlot as any).text && typeof (activePlot as any).text === 'function' ? (activePlot as any).text() : '';
        if (fallbackText && typeof fallbackText === 'string') {
          this.plot.setAttribute(Constant.ARIA_LABEL, fallbackText);
          this.plot.setAttribute(Constant.TITLE, fallbackText);
        } else {
          // Don't change the ARIA label if no coordinate text is available
          // This preserves the instruction text until first navigation
        }
      }
    } catch (error) {
      // Don't change the ARIA label on error
    }
  }

  public removeInstruction(): void {
    // Check if we're returning to plot scope
    if (this.focusStack.size() === 1) {
      this.setNavigationContextLabel();
    }
  }

  private updateAriaLabelAfterModal(): void {
    // Only update ARIA label if we have coordinate text available
    const activePlot = this.context.active;
    if (activePlot) {
      try {
        const traceText = this.textService.getCoordinateText();
        if (traceText && typeof traceText === 'string') {
          this.plot.setAttribute(Constant.ARIA_LABEL, traceText);
          this.plot.setAttribute(Constant.TITLE, traceText);
        }
        // Keep the current ARIA label (instruction text) if no coordinate text is available
      } catch (error) {
        // Keep current ARIA label on error
      }
    }
  }

  public toggleFocus(focus: Focus): void {
    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }

    this.context.toggleScope(focus);

    this.updateFocus(this.focusStack.peek()!);
  }

  public setFocus(focus: Focus): void {
    // Clear the stack and set the new focus directly
    this.focusStack.clear();
    this.focusStack.push(focus);

    this.context.toggleScope(focus);
    this.updateFocus(focus);
  }

  private updateFocus(newScope: Focus): void {
    if (newScope === 'TRACE' || newScope === 'SUBPLOT') {
      // Plot scope - restore plot focus and update ARIA
      this.plot.tabIndex = 0;
      if (this.originalPlotFocus) {
        this.plot.focus = this.originalPlotFocus;
        this.originalPlotFocus = null;
      }
      setTimeout(() => {
        this.plot.focus();
        // Update ARIA label when focus changes to plot scope
        this.setAriaLabel();
      }, 0);
    } else {
      // Modal scope - prevent plot focus
      this.plot.tabIndex = -1;
      if (!this.originalPlotFocus) {
        this.originalPlotFocus = this.plot.focus;
        this.plot.focus = () => {
          // Prevent plot focus when modal is open
          const activeElement = document.activeElement;
          if (activeElement && activeElement !== this.plot) {
            (activeElement as HTMLElement).focus();
          }
        };
      }
    }

    this.onChangeEmitter.fire({ value: newScope });
  }

  public push(focus: Focus): void {
    this.focusStack.push(focus);
    this.setAriaLabel();
    this.updateFocus(focus);

    this.onChangeEmitter.fire({ value: focus });
  }

  public pop(): Focus | undefined {
    const focus = this.focusStack.pop();

    this.setAriaLabel();

    // When returning from modal to trace scope, update ARIA label only if coordinate text is available
    if (this.focusStack.size() === 1) {
      this.updateAriaLabelAfterModal();
    }

    if (focus) {
      this.onChangeEmitter.fire({ value: focus });
    }
    return focus;
  }
}
