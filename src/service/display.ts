import type { Context } from '@model/context';
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
  private readonly focusStack: Stack<Focus>;

  public readonly plot: HTMLElement;

  private readonly onChangeEmitter: Emitter<FocusChangedEvent>;
  public readonly onChange: Event<FocusChangedEvent>;

  private hasEnteredInteractive: boolean = false;

  public constructor(context: Context, plot: HTMLElement) {
    this.context = context;
    this.focusStack = new Stack<Focus>();
    this.focusStack.push(this.context.scope as Focus);

    this.plot = plot;

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
    this.plot.setAttribute(Constant.ARIA_LABEL, this.getInstruction());
    this.plot.setAttribute(Constant.TITLE, this.getInstruction());
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

  private removeInstruction(): void {
    // Keep instruction label while active to avoid "empty application" and ensure entry announcement
    const instruction = this.hasEnteredInteractive ? '' : this.getInstruction(false);
    this.plot.setAttribute(Constant.ARIA_LABEL, instruction);
    this.plot.removeAttribute(Constant.TITLE);
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot.tabIndex = 0;
  }

  private setAriaLabel(): void {
    // Always respect the hasEnteredInteractive state
    const instruction = this.hasEnteredInteractive ? '' : this.getInstruction(false);
    this.plot.setAttribute(Constant.ARIA_LABEL, instruction);
  }

  public toggleFocus(focus: Focus): void {
    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }

    const newScope = this.focusStack.peek()!;

    // FIXED: Pass the new scope from focus stack, not the input focus
    this.context.toggleScope(newScope);

    this.updateFocus(newScope);
  }

  private updateFocus(newScope: Focus): void {
    if (newScope === 'TRACE' || newScope === 'SUBPLOT') {
      this.plot.tabIndex = 0;
      setTimeout(() => {
        this.plot.focus();
        if (this.hasEnteredInteractive) {
          this.setAriaLabel(); // This will set it to empty
        } else {
          this.hasEnteredInteractive = true;
          this.setAriaLabel(); // This will set it to full instruction
        }
      }, 0);
    }

    this.onChangeEmitter.fire({ value: newScope });
  }
}
