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

  // Store current instruction for mouse handlers
  private currentInstruction: string = '';

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
    this.currentInstruction = maidrInstruction;
    this.plot.setAttribute(Constant.ARIA_LABEL, maidrInstruction);
    this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
    this.plot.tabIndex = 0;

    // Set title on both figure and article elements
    const figureElement = this.plot.closest(Constant.FIGURE);
    const articleElement = this.plot.closest(Constant.ARTICLE);

    if (figureElement) {
      figureElement.setAttribute(Constant.TITLE, maidrInstruction);
      // Add mouse events to handle tooltip visibility
      figureElement.addEventListener('mouseenter', this.handleMouseEnter);
      figureElement.addEventListener('mouseleave', this.handleMouseLeave);
    }
    if (articleElement) {
      articleElement.setAttribute(Constant.TITLE, maidrInstruction);
      // Add mouse events to handle tooltip visibility
      articleElement.addEventListener('mouseenter', this.handleMouseEnter);
      articleElement.addEventListener('mouseleave', this.handleMouseLeave);
    }
  }

  private handleMouseEnter = (event: MouseEvent): void => {
    const target = event.currentTarget as HTMLElement;
    target.setAttribute(Constant.TITLE, this.currentInstruction);
  };

  private handleMouseLeave = (event: MouseEvent): void => {
    const target = event.currentTarget as HTMLElement;
    target.removeAttribute(Constant.TITLE);
  };

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
      figureElement.removeEventListener('mouseenter', this.handleMouseEnter);
      figureElement.removeEventListener('mouseleave', this.handleMouseLeave);
    }
    if (articleElement) {
      articleElement.removeAttribute(Constant.TITLE);
      // Remove event listeners
      articleElement.removeEventListener('mouseenter', this.handleMouseEnter);
      articleElement.removeEventListener('mouseleave', this.handleMouseLeave);
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
