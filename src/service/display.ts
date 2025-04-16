import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event, Focus } from '@type/event';
import type { Root } from 'react-dom/client';
import { Emitter } from '@type/event';
import { MaidrApp } from '@ui/App';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import { createRoot } from 'react-dom/client';

interface FocusChangedEvent {
  value: Focus;
}

export class DisplayService implements Disposable {
  private readonly context: Context;
  private readonly focusStack: Stack<Focus>;

  public readonly plot: HTMLElement;
  private reactRoot: Root | null;

  private readonly onChangeEmitter: Emitter<FocusChangedEvent>;
  public readonly onChange: Event<FocusChangedEvent>;

  public constructor(context: Context, plot: HTMLElement, reactContainer: HTMLElement) {
    this.context = context;
    this.focusStack = new Stack<Focus>();
    this.focusStack.push(this.context.scope as Focus);

    this.plot = plot;
    this.reactRoot = createRoot(reactContainer);
    this.reactRoot.render(MaidrApp);

    this.onChangeEmitter = new Emitter<FocusChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.removeInstruction();
  }

  public dispose(): void {
    this.addInstruction();

    this.onChangeEmitter.dispose();

    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  public addInstruction(): void {
    const maidrInstruction = this.context.getInstruction(true);
    this.plot.setAttribute(Constant.ARIA_LABEL, maidrInstruction);
    this.plot.setAttribute(Constant.TITLE, maidrInstruction);
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;
  }

  private removeInstruction(): void {
    this.plot.removeAttribute(Constant.ARIA_LABEL);
    this.plot.removeAttribute(Constant.TITLE);
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot.tabIndex = -1;
  }

  public toggleFocus(focus: Focus): void {
    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }
    this.context.toggleScope(focus);
    this.updateFocus(this.focusStack.peek()!);
  }

  private updateFocus(newScope: Focus): void {
    if (newScope === 'TRACE' || newScope === 'SUBPLOT') {
      this.plot.focus();
    }
    this.onChangeEmitter.fire({ value: newScope });
  }
}
