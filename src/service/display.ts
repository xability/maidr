import type { ContextService } from '@service/context';
import type { Disposable } from '@type/disposable';
import type { Scope } from '@type/event';
import type { Root } from 'react-dom/client';
import { MaidrApp } from '@ui/App';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import { createRoot } from 'react-dom/client';

export class DisplayService implements Disposable {
  private readonly context: ContextService;
  private readonly focusStack: Stack<Scope>;

  private readonly maidrRoot: HTMLElement;
  public readonly plot: HTMLElement;

  private readonly reactDiv?: HTMLElement;
  private reactRoot: Root | null;

  public readonly brailleDiv: HTMLElement;
  public readonly brailleTextArea: HTMLTextAreaElement;

  public constructor(context: ContextService, maidrRoot: HTMLElement, plot: HTMLElement) {
    this.context = context;
    this.focusStack = new Stack<Scope>();
    this.focusStack.push(this.context.scope);

    const maidrId = this.context.id;
    this.maidrRoot = maidrRoot;
    this.plot = plot;

    const brailleId = `${Constant.BRAILLE_CONTAINER}-${maidrId}`;
    const brailleTextAreaId = `${Constant.BRAILLE_TEXT_AREA}-${maidrId}`;
    this.brailleDiv = document.getElementById(brailleId) ?? this.createBrailleContainer(brailleId);
    this.brailleTextArea
      = (document.getElementById(brailleTextAreaId) as HTMLTextAreaElement)
        ?? this.createBrailleTextArea(brailleTextAreaId);

    const reactId = `${Constant.REACT_CONTAINER}-${maidrId}`;
    this.reactDiv = document.getElementById(reactId) ?? this.createReactContainer(reactId);
    this.reactRoot = createRoot(this.reactDiv);
    this.reactRoot.render(MaidrApp);

    this.removeInstruction();
  }

  public dispose(): void {
    this.addInstruction();

    this.brailleTextArea.remove();
    this.brailleDiv.remove();

    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.reactDiv?.remove();
  }

  public shouldDestroy(event: FocusEvent): boolean {
    const target = event.relatedTarget as HTMLElement;
    return !this.maidrRoot?.contains(target);
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

    this.maidrRoot.appendChild(brailleDiv);
    return brailleDiv;
  }

  private createBrailleTextArea(brailleAndReviewTextAreaId: string): HTMLTextAreaElement {
    const brailleTextArea = document.createElement(Constant.TEXT_AREA);
    brailleTextArea.id = brailleAndReviewTextAreaId;
    brailleTextArea.classList.add(Constant.BRAILLE_CLASS);

    this.brailleDiv.appendChild(brailleTextArea);
    return brailleTextArea;
  }

  private createReactContainer(reactId: string): HTMLElement {
    const reactDiv = document.createElement(Constant.DIV);
    reactDiv.id = reactId;

    this.maidrRoot.appendChild(reactDiv);
    return reactDiv;
  }

  public toggleFocus(scope: Scope): void {
    if (!this.focusStack.removeLast(scope)) {
      this.focusStack.push(scope);
    }
    this.updateFocus(this.focusStack.peek()!);
    this.context.toggleScope(scope);
  }

  private updateFocus(newScope: Scope): void {
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
        this.reactDiv?.focus();
        activeDiv?.classList.add(Constant.HIDDEN);
        break;

      default:
        this.plot.focus();
        activeDiv?.classList.add(Constant.HIDDEN);
        break;
    }
  }
}
