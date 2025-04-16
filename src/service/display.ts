import type { ContextService } from '@service/context';
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
  private readonly context: ContextService;
  private readonly focusStack: Stack<Focus>;

  private readonly maidrContainer: HTMLElement;
  public readonly plot: HTMLElement;

  private reactRoot: Root | null;

  public readonly brailleDiv: HTMLElement;
  public readonly brailleTextArea: HTMLTextAreaElement;

  private readonly onChangeEmitter: Emitter<FocusChangedEvent>;
  public readonly onChange: Event<FocusChangedEvent>;

  public constructor(context: ContextService, maidrContainer: HTMLElement, plot: HTMLElement, reactContainer: HTMLElement) {
    this.context = context;
    this.focusStack = new Stack<Focus>();
    this.focusStack.push(this.context.scope as Focus);

    const maidrId = this.context.id;
    this.maidrContainer = maidrContainer;
    this.plot = plot;

    const brailleId = `${Constant.BRAILLE_CONTAINER}-${maidrId}`;
    const brailleTextAreaId = `${Constant.BRAILLE_TEXT_AREA}-${maidrId}`;
    this.brailleDiv = document.getElementById(brailleId) ?? this.createBrailleContainer(brailleId);
    this.brailleTextArea
      = (document.getElementById(brailleTextAreaId) as HTMLTextAreaElement)
        ?? this.createBrailleTextArea(brailleTextAreaId);

    this.reactRoot = createRoot(reactContainer);
    this.reactRoot.render(MaidrApp);

    this.onChangeEmitter = new Emitter<FocusChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.removeInstruction();
  }

  public dispose(): void {
    this.addInstruction();

    this.brailleTextArea.remove();
    this.brailleDiv.remove();

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

  private createBrailleContainer(brailleId: string): HTMLElement {
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = brailleId;
    brailleDiv.classList.add(Constant.HIDDEN);

    this.maidrContainer.appendChild(brailleDiv);
    return brailleDiv;
  }

  private createBrailleTextArea(brailleAndReviewTextAreaId: string): HTMLTextAreaElement {
    const brailleTextArea = document.createElement(Constant.TEXT_AREA);
    brailleTextArea.id = brailleAndReviewTextAreaId;
    brailleTextArea.classList.add(Constant.BRAILLE_CLASS);

    this.brailleDiv.appendChild(brailleTextArea);
    return brailleTextArea;
  }

  public toggleFocus(focus: Focus): void {
    if (!this.focusStack.removeLast(focus)) {
      this.focusStack.push(focus);
    }
    this.context.toggleScope(focus);
    this.updateFocus(this.focusStack.peek()!);
  }

  private updateFocus(newScope: Focus): void {
    let activeDiv: HTMLElement | undefined;
    if (
      (document.activeElement as HTMLTextAreaElement) === this.brailleTextArea
    ) {
      activeDiv = this.brailleDiv;
    } else {
      activeDiv = undefined;
    }

    switch (newScope) {
      case 'BRAILLE':
        activeDiv?.classList.add(Constant.HIDDEN);
        this.brailleDiv?.classList.remove(Constant.HIDDEN);
        this.brailleTextArea?.focus();
        break;

      case 'CHAT':
      case 'HELP':
      case 'REVIEW':
      case 'SETTINGS':
        activeDiv?.classList.add(Constant.HIDDEN);
        break;

      default:
        this.plot.focus();
        activeDiv?.classList.add(Constant.HIDDEN);
        break;
    }

    this.onChangeEmitter.fire({ value: newScope });
  }
}
