import Constant from '../../util/constant';
import {EventType} from '../../index';
import {Maidr} from '../../model/grammar';

export default class DisplayManager {
  private readonly maidr: Maidr;
  private readonly plot?: HTMLElement;

  private readonly onFocus: () => void;
  private readonly onBlur: (event: FocusEvent) => void;
  private prevActiveElement: HTMLElement | HTMLInputElement | null;

  private readonly articleElement?: HTMLElement;
  private readonly figureElement?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleDiv?: HTMLElement;
  public readonly brailleInput?: HTMLInputElement;

  public readonly reviewDiv?: HTMLElement;
  public readonly reviewInput?: HTMLInputElement;

  constructor(
    maidr: Maidr,
    onFocus: () => void,
    onBlur: (event: FocusEvent) => void
  ) {
    this.maidr = maidr;
    const maidrId = this.maidr.id;

    this.onFocus = onFocus;
    this.onBlur = onBlur;
    this.prevActiveElement = null;

    const plot = document.getElementById(maidrId);
    if (!plot || !plot.parentNode) {
      console.error('Plot container not found');
      return;
    }

    this.plot = plot;
    this.addInstruction();

    const figureId = Constant.MAIDR_FIGURE + maidrId;
    const articleId = Constant.MAIDR_ARTICLE + maidrId;
    const breakId = Constant.MAIDR_BR + maidrId;
    this.figureElement =
      document.getElementById(figureId) ?? this.createFigureElement(figureId);
    this.articleElement =
      document.getElementById(articleId) ??
      this.createArticleElement(articleId);
    this.br =
      document.getElementById(breakId) ?? this.createBreakElement(breakId);

    const textId = Constant.TEXT_CONTAINER + maidrId;
    const notificationId = Constant.NOTIFICATION_CONTAINER + maidrId;
    const brailleId = Constant.BRAILLE_CONTAINER + maidrId;
    const brailleInputId = Constant.BRAILLE_INPUT + maidrId;
    const reviewId = Constant.REVIEW_CONTAINER + maidrId;
    const reviewInputId = Constant.REVIEW_INPUT + maidrId;
    this.textDiv =
      document.getElementById(textId) ?? this.createTextContainer(textId);
    this.notificationDiv =
      document.getElementById(notificationId) ??
      this.createNotificationContainer(notificationId);
    this.brailleDiv =
      document.getElementById(brailleId) ??
      this.createBrailleContainer(brailleId);
    this.brailleInput =
      (document.getElementById(brailleInputId) as HTMLInputElement) ??
      this.createBrailleInput(brailleInputId);
    this.reviewDiv =
      (document.getElementById(reviewId) as HTMLElement) ??
      this.createReviewContainer(reviewId);
    this.reviewInput =
      (document.getElementById(reviewInputId) as HTMLInputElement) ??
      this.createReviewInput(reviewInputId);

    this.brailleInput.addEventListener(EventType.BLUR, this.onBlur);
    this.reviewInput.addEventListener(EventType.BLUR, this.onBlur);
  }

  public destroy(): void {
    if (this.brailleInput) {
      this.brailleInput.value = Constant.EMPTY;
    }
    if (this.brailleDiv) {
      this.brailleDiv.classList.add(Constant.HIDDEN);
    }
    if (this.reviewInput) {
      this.reviewInput.value = Constant.EMPTY;
    }
    if (this.reviewDiv) {
      this.reviewDiv.classList.add(Constant.HIDDEN);
    }
    if (this.notificationDiv) {
      this.notificationDiv.innerHTML = Constant.EMPTY;
    }
    if (this.textDiv) {
      this.textDiv.innerHTML = Constant.EMPTY;
    }
    if (this.prevActiveElement) {
      this.prevActiveElement = null;
    }
  }

  public shouldDestroy(event: FocusEvent): boolean {
    const target = event.relatedTarget as HTMLElement;
    return !this.figureElement?.contains(target);
  }

  public addInstruction(): void {
    if (this.plot) {
      const maidrInstruction = `This is a maidr plot of type ${this.maidr.type}: Click to activate.
        Use Arrows to navigate data points. Toggle B for Braille, T for Text, 
        S for Sonification, and R for Review mode. Use H for Help.`;
      this.plot.setAttribute(Constant.ARIA_LABEL, maidrInstruction);
      this.plot.setAttribute(Constant.TITLE, maidrInstruction);
      this.plot.setAttribute(Constant.ROLE, Constant.IMAGE);
      this.plot.tabIndex = 0;
    }
  }

  public removeInstruction(): void {
    if (this.plot) {
      this.plot.removeAttribute(Constant.ARIA_LABEL);
      this.plot.removeAttribute(Constant.TITLE);
      this.plot.setAttribute(Constant.ROLE, Constant.APPLICATION);
      this.plot.tabIndex = -1;
    }
  }

  private createArticleElement(articleId: string): HTMLElement {
    const articleElement = document.createElement(Constant.ARTICLE);
    articleElement.id = articleId;

    this.figureElement!.parentNode!.replaceChild(
      articleElement,
      this.figureElement!
    );
    articleElement.appendChild(this.figureElement!);

    return articleElement;
  }

  private createFigureElement(figureId: string): HTMLElement {
    const figureElement = document.createElement(Constant.FIGURE);
    figureElement.id = figureId;

    this.plot!.parentNode!.replaceChild(figureElement, this.plot!);
    figureElement.appendChild(this.plot!);

    return figureElement;
  }

  private createBreakElement(breakId: string): HTMLElement {
    const br = document.createElement(Constant.BR);
    br.id = breakId;

    this.figureElement!.insertAdjacentElement(Constant.AFTER_END, br);
    return br;
  }

  private createTextContainer(textId: string): HTMLElement {
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = textId;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.figureElement!.insertAdjacentElement(Constant.AFTER_END, textDiv);
    return textDiv;
  }

  private createNotificationContainer(notificationId: string): HTMLElement {
    const notificationDiv = document.createElement(Constant.DIV);
    notificationDiv.id = notificationId;
    notificationDiv.classList.add(Constant.MB_3);
    notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.figureElement!.insertAdjacentElement(
      Constant.AFTER_END,
      notificationDiv
    );
    return notificationDiv;
  }

  private createBrailleContainer(brailleId: string): HTMLElement {
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = brailleId;
    brailleDiv.classList.add(Constant.HIDDEN);

    this.figureElement!.insertBefore(
      brailleDiv,
      this.figureElement!.firstChild
    );
    return brailleDiv;
  }

  private createBrailleInput(brailleInputId: string): HTMLInputElement {
    const brailleInput = document.createElement(Constant.INPUT);
    brailleInput.id = brailleInputId;
    brailleInput.size = Constant.BRAILLE_INPUT_LENGTH;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleDiv!.appendChild(brailleInput);
    return brailleInput;
  }

  private createReviewContainer(reviewId: string): HTMLElement {
    const reviewDiv = document.createElement(Constant.DIV);
    reviewDiv.id = reviewId;
    reviewDiv.classList.add(Constant.HIDDEN);

    this.figureElement!.appendChild(reviewDiv);
    return reviewDiv;
  }

  private createReviewInput(reviewInputId: string): HTMLInputElement {
    const reviewInput = document.createElement(Constant.INPUT);
    reviewInput.id = reviewInputId;
    reviewInput.type = Constant.TEXT;
    reviewInput.autocomplete = Constant.OFF;
    reviewInput.size = 50;

    this.reviewDiv!.appendChild(reviewInput);
    return reviewInput;
  }

  public toggleBrailleFocus(): void {
    if ((document.activeElement as HTMLElement) === this.plot) {
      this.brailleDiv?.classList.remove(Constant.HIDDEN);
      this.brailleInput?.focus();
      this.prevActiveElement = this.plot;
    } else if (
      (document.activeElement as HTMLInputElement) === this.reviewInput &&
      this.onBlur
    ) {
      this.reviewInput.removeEventListener(EventType.BLUR, this.onBlur);
      this.brailleDiv?.classList.remove(Constant.HIDDEN);
      this.brailleInput?.focus();
      this.prevActiveElement = this.reviewInput;
      this.reviewInput.addEventListener(EventType.BLUR, this.onBlur);
      this.reviewDiv?.classList.add(Constant.HIDDEN);
    } else if (
      (document.activeElement as HTMLInputElement) === this.brailleInput &&
      this.onBlur
    ) {
      this.brailleInput.removeEventListener(EventType.BLUR, this.onBlur);
      this.plot?.focus();
      this.prevActiveElement = null;
      this.brailleInput.addEventListener(EventType.BLUR, this.onBlur);
      this.brailleDiv?.classList.add(Constant.HIDDEN);
    }
  }

  public toggleReviewFocus(): void {
    if ((document.activeElement as HTMLElement) === this.plot) {
      this.reviewDiv?.classList.remove(Constant.HIDDEN);
      this.reviewInput?.focus();
      this.prevActiveElement = this.plot;
    } else if (
      (document.activeElement as HTMLInputElement) === this.brailleInput &&
      this.onBlur
    ) {
      this.brailleInput.removeEventListener(EventType.BLUR, this.onBlur);
      this.reviewDiv?.classList.remove(Constant.HIDDEN);
      this.reviewInput?.focus();
      this.prevActiveElement = this.brailleInput;
      this.brailleInput.addEventListener(EventType.BLUR, this.onBlur);
    } else if (
      this.prevActiveElement === this.brailleInput &&
      (document.activeElement as HTMLInputElement) === this.reviewInput &&
      this.onBlur
    ) {
      this.reviewInput.removeEventListener(EventType.BLUR, this.onBlur);
      this.brailleDiv?.classList.remove(Constant.HIDDEN);
      this.brailleInput?.focus();
      this.prevActiveElement = this.reviewInput;
      this.reviewInput.addEventListener(EventType.BLUR, this.onBlur);
      this.reviewDiv?.classList.add(Constant.HIDDEN);
    } else if (
      (document.activeElement as HTMLInputElement) === this.reviewInput &&
      this.onBlur
    ) {
      this.reviewInput.removeEventListener(EventType.BLUR, this.onBlur);
      this.plot?.focus();
      this.prevActiveElement = null;
      this.reviewInput.addEventListener(EventType.BLUR, this.onBlur);
      this.reviewDiv?.classList.add(Constant.HIDDEN);
    }
  }
}
