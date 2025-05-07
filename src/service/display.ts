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
    this.reactRoot = createRoot(reactContainer, { identifierPrefix: this.context.id });
    this.reactRoot.render(MaidrApp);

    this.onChangeEmitter = new Emitter<FocusChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    // Add click handler to remove tooltip when plot is activated
    this.plot.addEventListener('click', () => {
      const figureElement = this.plot.closest(Constant.FIGURE);
      const articleElement = this.plot.closest(Constant.ARTICLE);
      if (figureElement)
        figureElement.removeAttribute(Constant.TITLE);
      if (articleElement)
        articleElement.removeAttribute(Constant.TITLE);
    });

    this.addInstruction();
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();

    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  public addInstruction(): void {
    const maidrInstruction = this.context.getInstruction(true);
    this.plot.setAttribute(Constant.ARIA_LABEL, maidrInstruction);
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;

    // Set title on both figure and article elements
    const figureElement = this.plot.closest(Constant.FIGURE);
    const articleElement = this.plot.closest(Constant.ARTICLE);

    if (figureElement) {
      figureElement.setAttribute(Constant.TITLE, maidrInstruction);
      // Add mouse events to handle tooltip visibility
      figureElement.addEventListener('mouseenter', () => {
        figureElement.setAttribute(Constant.TITLE, maidrInstruction);
      });
      figureElement.addEventListener('mouseleave', () => {
        figureElement.removeAttribute(Constant.TITLE);
      });
    }
    if (articleElement) {
      articleElement.setAttribute(Constant.TITLE, maidrInstruction);
      // Add mouse events to handle tooltip visibility
      articleElement.addEventListener('mouseenter', () => {
        articleElement.setAttribute(Constant.TITLE, maidrInstruction);
      });
      articleElement.addEventListener('mouseleave', () => {
        articleElement.removeAttribute(Constant.TITLE);
      });
    }
  }

  private removeInstruction(): void {
    this.plot.removeAttribute(Constant.ARIA_LABEL);
    this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot.tabIndex = -1;

    // Remove title and event listeners from both figure and article elements
    const figureElement = this.plot.closest(Constant.FIGURE);
    const articleElement = this.plot.closest(Constant.ARTICLE);

    if (figureElement) {
      figureElement.removeAttribute(Constant.TITLE);
      // Remove event listeners
      figureElement.removeEventListener('mouseenter', () => {});
      figureElement.removeEventListener('mouseleave', () => {});
    }
    if (articleElement) {
      articleElement.removeAttribute(Constant.TITLE);
      // Remove event listeners
      articleElement.removeEventListener('mouseenter', () => {});
      articleElement.removeEventListener('mouseleave', () => {});
    }
  }

  public toggleFocus(focus: Focus): void {
    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }
    this.context.toggleScope(focus);
    this.addInstruction();
    this.updateFocus(this.focusStack.peek()!);
  }

  private updateFocus(newScope: Focus): void {
    this.addInstruction();
    if (newScope === 'TRACE' || newScope === 'SUBPLOT') {
      this.plot.focus();
    }
    this.onChangeEmitter.fire({ value: newScope });
  }
}
