import type { Scope } from '@type/event';
import type { Root } from 'react-dom/client';
import type { ContextService } from './context';
import { MaidrApp } from '@ui/App';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import { createRoot } from 'react-dom/client';

export class DisplayService {
  private readonly context: ContextService;
  private readonly focusStack: Stack<Scope>;

  private readonly maidrRoot: HTMLElement;
  public readonly plot: HTMLElement;

  private readonly reactDiv?: HTMLElement;
  private reactRoot: Root | null;

  public readonly notificationDiv: HTMLElement;
  public readonly brailleDiv: HTMLElement;
  public readonly brailleTextArea: HTMLTextAreaElement;

  public readonly reviewDiv: HTMLElement;
  public readonly reviewInput: HTMLInputElement;

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

    const reviewId = `${Constant.REVIEW_CONTAINER}-${maidrId}`;
    const reviewInputId = `${Constant.REVIEW_INPUT}-${maidrId}`;
    this.reviewDiv
      = (document.getElementById(reviewId) as HTMLElement)
        ?? this.createReviewContainer(reviewId);
    this.reviewInput
      = (document.getElementById(reviewInputId) as HTMLInputElement)
        ?? this.createReviewInput(reviewInputId);

    const notificationId = `${Constant.NOTIFICATION_CONTAINER}-${maidrId}`;
    this.notificationDiv = document.getElementById(notificationId)
      ?? this.createNotificationContainer(notificationId);

    const reactId = `${Constant.REACT_CONTAINER}-${maidrId}`;
    this.reactDiv = document.getElementById(reactId) ?? this.createReactContainer(reactId);
    this.reactRoot = createRoot(this.reactDiv);
    this.reactRoot.render(MaidrApp);

    this.removeInstruction();
  }

  public destroy(): void {
    this.addInstruction();

    this.brailleTextArea.remove();
    this.brailleDiv.remove();

    this.reviewInput.remove();
    this.reviewDiv.remove();

    this.notificationDiv.innerHTML = Constant.EMPTY;

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

  private createReviewContainer(reviewId: string): HTMLElement {
    const reviewDiv = document.createElement(Constant.DIV);
    reviewDiv.id = reviewId;
    reviewDiv.classList.add(Constant.HIDDEN);

    this.maidrRoot.appendChild(reviewDiv);
    return reviewDiv;
  }

  private createReviewInput(reviewInputId: string): HTMLInputElement {
    const reviewInput = document.createElement(Constant.INPUT);
    reviewInput.id = reviewInputId;
    reviewInput.type = Constant.TEXT;
    reviewInput.autocomplete = Constant.OFF;
    reviewInput.size = 50;

    this.reviewDiv.appendChild(reviewInput);
    return reviewInput;
  }

  private createNotificationContainer(notificationId: string): HTMLElement {
    const notificationDiv = document.createElement(Constant.DIV);
    notificationDiv.id = notificationId;
    notificationDiv.classList.add(Constant.MB_3);
    notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.maidrRoot.appendChild(notificationDiv);
    return notificationDiv;
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
    if ((document.activeElement as HTMLInputElement) === this.reviewInput) {
      activeDiv = this.reviewDiv;
    } else if (
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

      case 'REVIEW':
        activeDiv?.classList.add(Constant.HIDDEN);
        this.reviewDiv?.classList.remove(Constant.HIDDEN);
        this.reviewInput?.focus();
        break;

      case 'CHAT':
      case 'HELP':
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
