import {Constant} from '../../util/constant';
import {EventType} from '../../index';
import {Maidr} from '../../model/grammar';

enum FocusMode {
  BRAILLE,
  NONE,
  REVIEW,
}

export class DisplayManager {
  private readonly maidr: Maidr;
  private readonly plot?: HTMLElement;

  private readonly onFocus: () => void;
  private readonly onBlur: (event: FocusEvent) => void;
  private prevFocusMode: FocusMode;

  private readonly articleElement?: HTMLElement;
  private readonly figureElement?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleAndReviewDiv?: HTMLElement;
  public readonly brailleAndReviewTextArea?: HTMLTextAreaElement;

  public constructor(
    maidr: Maidr,
    onFocus: () => void,
    onBlur: (event: FocusEvent) => void
  ) {
    this.maidr = maidr;
    const maidrId = this.maidr.id;

    this.onFocus = onFocus;
    this.onBlur = onBlur;
    this.prevFocusMode = FocusMode.NONE;

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
    const brailleAndReviewId = Constant.BRAILLE_AND_REVIEW_CONTAINER + maidrId;
    const brailleAndReviewTextAreaId =
      Constant.BRAILLE_AND_REVIEW_TEXT_AREA + maidrId;
    this.textDiv =
      document.getElementById(textId) ?? this.createTextContainer(textId);
    this.notificationDiv =
      document.getElementById(notificationId) ??
      this.createNotificationContainer(notificationId);
    this.brailleAndReviewDiv =
      document.getElementById(brailleAndReviewId) ??
      this.createBrailleAndReviewContainer(brailleAndReviewId);
    this.brailleAndReviewTextArea =
      (document.getElementById(
        brailleAndReviewTextAreaId
      ) as HTMLTextAreaElement) ??
      this.createBrailleAndReviewTextArea(brailleAndReviewTextAreaId);

    this.brailleAndReviewTextArea.addEventListener(EventType.BLUR, this.onBlur);
  }

  public destroy(): void {
    if (this.brailleAndReviewTextArea) {
      this.brailleAndReviewTextArea.value = Constant.EMPTY;
    }
    if (this.brailleAndReviewDiv) {
      this.brailleAndReviewDiv.classList.add(Constant.HIDDEN);
    }
    if (this.notificationDiv) {
      this.notificationDiv.innerHTML = Constant.EMPTY;
    }
    if (this.textDiv) {
      this.textDiv.innerHTML = Constant.EMPTY;
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

  private createBrailleAndReviewContainer(brailleId: string): HTMLElement {
    const brailleAndReviewDiv = document.createElement(Constant.DIV);
    brailleAndReviewDiv.id = brailleId;
    brailleAndReviewDiv.classList.add(Constant.HIDDEN);

    this.figureElement!.insertBefore(
      brailleAndReviewDiv,
      this.figureElement!.firstChild
    );
    return brailleAndReviewDiv;
  }

  private createBrailleAndReviewTextArea(
    brailleAndReviewTextAreaId: string
  ): HTMLTextAreaElement {
    const brailleAndReviewTextArea = document.createElement(Constant.TEXT_AREA);
    brailleAndReviewTextArea.id = brailleAndReviewTextAreaId;
    brailleAndReviewTextArea.classList.add(Constant.BRAILLE_AND_REVIEW_CLASS);

    this.brailleAndReviewDiv!.appendChild(brailleAndReviewTextArea);
    return brailleAndReviewTextArea;
  }

  public toggleReviewFocus(): void {
    if (!this.brailleAndReviewTextArea) {
      return;
    }

    switch (this.prevFocusMode) {
      case FocusMode.NONE:
        this.brailleAndReviewDiv?.classList.remove(Constant.HIDDEN);
        this.brailleAndReviewTextArea?.focus();
        this.prevFocusMode = FocusMode.REVIEW;
        break;

      case FocusMode.REVIEW:
        this.brailleAndReviewTextArea.removeEventListener(
          EventType.BLUR,
          this.onBlur
        );
        this.plot?.focus();
        this.brailleAndReviewTextArea.addEventListener(
          EventType.BLUR,
          this.onBlur
        );
        this.brailleAndReviewDiv?.classList.add(Constant.HIDDEN);
        this.prevFocusMode = FocusMode.NONE;
        break;
    }
  }

  public toggleBrailleFocus(): void {
    if (!this.brailleAndReviewTextArea) {
      return;
    }

    switch (this.prevFocusMode) {
      case FocusMode.BRAILLE:
        this.brailleAndReviewTextArea.removeEventListener(
          EventType.BLUR,
          this.onBlur
        );
        this.plot?.focus();
        this.brailleAndReviewTextArea.addEventListener(
          EventType.BLUR,
          this.onBlur
        );
        this.brailleAndReviewDiv?.classList.add(Constant.HIDDEN);
        this.prevFocusMode = FocusMode.NONE;
        break;

      case FocusMode.NONE:
        this.brailleAndReviewDiv?.classList.remove(Constant.HIDDEN);
        this.brailleAndReviewTextArea?.focus();
        this.prevFocusMode = FocusMode.BRAILLE;
        break;
    }
  }
}
