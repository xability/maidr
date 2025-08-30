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

    this.removeInstruction();
  }

  public dispose(): void {
    this.addInstruction();

    this.onChangeEmitter.dispose();
  }

  public getInstruction(includeClickPrompt: boolean = true): string {
    return this.context.getInstruction(includeClickPrompt);
  }

  private addInstruction(): void {
    this.plot.setAttribute(Constant.ARIA_LABEL, '');
    this.plot.removeAttribute(Constant.TITLE);
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

  private removeInstruction(): void {
    this.plot.setAttribute(Constant.ARIA_LABEL, '');
    this.plot.removeAttribute(Constant.TITLE);
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot.tabIndex = 0;
  }

  private getTraceAriaLabel(): string {
    const formatted = this.textService.format(this.context.state);
    if (formatted && formatted.trim().length > 0) {
      return formatted;
    }
    return this.getInstruction(false);
  }

  // --- Initial instruction management (aria-describedby) ---
  private getInstructionElementId(): string {
    return `${Constant.MAIDR_INSTRUCTION}-${this.context.id}`;
  }

  public clearPlotAccessibleName(): void {
    this.plot.setAttribute(Constant.ARIA_LABEL, '');
    this.plot.removeAttribute(Constant.TITLE);
  }

  public attachDescribedByInstruction(text: string): void {
    const instructionId = this.getInstructionElementId();
    let instructionEl = document.getElementById(instructionId);
    if (!instructionEl) {
      instructionEl = document.createElement('div');
      instructionEl.id = instructionId;
      // Visually hidden but accessible
      (instructionEl as HTMLElement).style.position = 'absolute';
      (instructionEl as HTMLElement).style.width = '1px';
      (instructionEl as HTMLElement).style.height = '1px';
      (instructionEl as HTMLElement).style.margin = '-1px';
      (instructionEl as HTMLElement).style.border = '0';
      (instructionEl as HTMLElement).style.padding = '0';
      (instructionEl as HTMLElement).style.whiteSpace = 'nowrap';
      (instructionEl as HTMLElement).style.clip = 'rect(0 0 0 0)';
      (instructionEl as HTMLElement).style.clipPath = 'inset(50%)';
      (instructionEl as HTMLElement).style.overflow = 'hidden';

      const reactMount = document.getElementById(`${Constant.REACT_CONTAINER}-${this.context.id}`) || document.body;
      reactMount.appendChild(instructionEl);
    }
    instructionEl.textContent = text;

    const prev = this.plot.getAttribute('aria-describedby');
    const tokens = new Set((prev ? prev.split(/\s+/) : []).filter(Boolean));
    tokens.add(instructionId);
    this.plot.setAttribute('aria-describedby', Array.from(tokens).join(' '));
  }

  public detachDescribedByInstruction(): void {
    const instructionId = this.getInstructionElementId();
    const current = this.plot.getAttribute('aria-describedby') || '';
    const remain = current.split(/\s+/).filter(t => t && t !== instructionId).join(' ');
    if (remain) {
      this.plot.setAttribute('aria-describedby', remain);
    } else {
      this.plot.removeAttribute('aria-describedby');
    }

    const el = document.getElementById(instructionId);
    if (el) {
      el.textContent = '';
    }
  }

  public toggleFocus(focus: Focus): void {
    // Check if this is a mode toggle (braille/review) vs a modal return
    this.isReturningFromModeToggle = focus === 'BRAILLE' || focus === 'REVIEW';

    // Detach initial instruction when entering/exiting modal modes
    if (this.isReturningFromModeToggle) {
      this.detachDescribedByInstruction();
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
        // Only show trace text if NOT returning from a mode toggle
        if (!this.isReturningFromModeToggle) {
          // Ensure the active trace is initialized exactly once
          const active = this.context.active;
          if (active && hasEnsureInitialized(active)) {
            active.ensureInitialized();
          }
          const label = this.getTraceAriaLabel();
          this.plot.setAttribute(Constant.ARIA_LABEL, label);
        } else {
          // Reset the flag and show empty label to avoid announcing initial instruction
          this.isReturningFromModeToggle = false;
          this.plot.setAttribute(Constant.ARIA_LABEL, '');
          // Ensure any initial described-by is removed when returning
          this.detachDescribedByInstruction();
        }

        this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
        this.plot.focus();
        if (!this.hasEnteredInteractive) {
          this.hasEnteredInteractive = true;
        }
      }, 0);
    }

    this.onChangeEmitter.fire({ value: newScope });
  }
}
