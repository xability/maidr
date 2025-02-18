import type { Maidr } from '@model/grammar';
import type { Root } from 'react-dom/client';
import { MaidrApp } from '@ui/App';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import { createRoot } from 'react-dom/client';

enum FocusMode {
  BRAILLE,
  HELP,
  PLOT,
  REVIEW,
}

export class DisplayService {
  private readonly plotType: string;
  private readonly focusStack: Stack<FocusMode>;

  private readonly maidrRoot: HTMLElement;
  private readonly reactDiv?: HTMLElement;
  private reactRoot: Root | null;

  public readonly textDiv: HTMLElement;
  public readonly notificationDiv: HTMLElement;

  public readonly brailleDiv: HTMLElement;
  public readonly brailleTextArea: HTMLTextAreaElement;

  public readonly reviewDiv: HTMLElement;
  public readonly reviewInput: HTMLInputElement;

  public constructor(maidr: Maidr, maidrRoot: HTMLElement) {
    this.plotType = maidr.type;
    this.focusStack = new Stack<FocusMode>();
    this.focusStack.push(FocusMode.PLOT);

    const maidrId = maidr.id;
    this.maidrRoot = maidrRoot;

    const brailleId = Constant.BRAILLE_CONTAINER + maidrId;
    const brailleTextAreaId = Constant.BRAILLE_TEXT_AREA + maidrId;
    this.brailleDiv = document.getElementById(brailleId) ?? this.createBrailleContainer(brailleId);
    this.brailleTextArea
      = (document.getElementById(brailleTextAreaId) as HTMLTextAreaElement)
        ?? this.createBrailleTextArea(brailleTextAreaId);

    const textId = Constant.TEXT_CONTAINER + maidrId;
    this.textDiv = document.getElementById(textId) ?? this.createTextContainer(textId);

    const reviewId = Constant.REVIEW_CONTAINER + maidrId;
    const reviewInputId = Constant.REVIEW_INPUT + maidrId;
    this.reviewDiv
      = (document.getElementById(reviewId) as HTMLElement)
        ?? this.createReviewContainer(reviewId);
    this.reviewInput
      = (document.getElementById(reviewInputId) as HTMLInputElement)
        ?? this.createReviewInput(reviewInputId);

    const notificationId = Constant.NOTIFICATION_CONTAINER + maidrId;
    this.notificationDiv = document.getElementById(notificationId)
      ?? this.createNotificationContainer(notificationId);

    const reactId = Constant.MAIDR_CONTAINER + maidrId;
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

    this.textDiv.remove();
    this.notificationDiv.remove();

    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.reactDiv?.remove();
  }

  public shouldDestroy(event: FocusEvent): boolean {
    const target = event.relatedTarget as HTMLElement;
    if (target === null) {
      return false;
    }

    return !this.maidrRoot?.contains(target);
  }

  public getInstruction(includeClickPrompt: boolean): string {
    return `This is a maidr plot of type: ${this.plotType}.
        ${includeClickPrompt ? 'Click to activate.' : Constant.EMPTY}
        Use Arrows to navigate data points. Toggle B for Braille, T for Text,
        S for Sonification, and R for Review mode. Use H for Help.`;
  }

  private addInstruction(): void {
    const maidrInstruction = this.getInstruction(true);
    this.maidrRoot.setAttribute(Constant.ARIA_LABEL, maidrInstruction);
    this.maidrRoot.setAttribute(Constant.TITLE, maidrInstruction);
    this.maidrRoot.setAttribute(Constant.ROLE, Constant.IMAGE);
  }

  private removeInstruction(): void {
    this.maidrRoot.removeAttribute(Constant.ARIA_LABEL);
    this.maidrRoot.removeAttribute(Constant.TITLE);
    this.maidrRoot.removeAttribute(Constant.ROLE);
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
    brailleTextArea.classList.add(Constant.BRAILLE_AND_REVIEW_CLASS);

    this.brailleDiv.appendChild(brailleTextArea);
    return brailleTextArea;
  }

  private createTextContainer(textId: string): HTMLElement {
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = textId;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.maidrRoot.appendChild(textDiv);
    return textDiv;
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

  public toggleReviewFocus(): void {
    if (!this.focusStack.removeLast(FocusMode.REVIEW)) {
      this.focusStack.push(FocusMode.REVIEW);
    }
    this.updateFocus(this.focusStack.peek());
  }

  public toggleBrailleFocus(): void {
    if (!this.focusStack.removeLast(FocusMode.BRAILLE)) {
      this.focusStack.push(FocusMode.BRAILLE);
    }
    this.updateFocus(this.focusStack.peek());
  }

  public toggleHelpFocus(): void {
    if (!this.focusStack.removeLast(FocusMode.HELP)) {
      this.focusStack.push(FocusMode.HELP);
    }
    this.updateFocus(this.focusStack.peek());
  }

  private updateFocus(newFocus: FocusMode = FocusMode.PLOT): void {
    let activeElement: HTMLElement | HTMLInputElement | HTMLTextAreaElement | undefined;
    let activeDiv: HTMLElement | undefined;
    if ((document.activeElement as HTMLInputElement) === this.reviewInput) {
      activeElement = this.reviewInput;
      activeDiv = this.reviewDiv;
    } else if (
      (document.activeElement as HTMLTextAreaElement) === this.brailleTextArea
    ) {
      activeElement = this.brailleTextArea;
      activeDiv = this.brailleDiv;
    } else {
      activeElement = (document.activeElement) as HTMLElement;
      activeDiv = undefined;
    }

    switch (newFocus) {
      case FocusMode.BRAILLE:
        if (activeElement === this.reviewInput) {
          activeDiv?.classList.add(Constant.HIDDEN);
        }
        this.brailleDiv?.classList.remove(Constant.HIDDEN);
        this.brailleTextArea?.focus();
        break;

      case FocusMode.REVIEW:
        if (activeElement === this.brailleTextArea) {
          activeDiv?.classList.add(Constant.HIDDEN);
        }
        this.reviewDiv?.classList.remove(Constant.HIDDEN);
        this.reviewInput?.focus();
        break;

      case FocusMode.HELP:
        this.reactDiv?.focus();
        activeDiv?.classList.add(Constant.HIDDEN);
        break;

      case FocusMode.PLOT:
        this.maidrRoot.focus();
        activeDiv?.classList.add(Constant.HIDDEN);
        break;
    }
  }
}
