import Constant from '../../util/constant';
import {EventType} from '../../index';
import {Maidr} from '../../model/grammar';

export default class DisplayManager {
  private readonly maidr: Maidr;
  private readonly plot?: HTMLElement;

  private readonly onFocus?: () => void;
  private readonly onBlur?: (event: FocusEvent) => void;

  private readonly articleElement?: HTMLElement;
  private readonly figureElement?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleReviewDiv?: HTMLElement;
  public readonly brailleReviewTextArea?: HTMLTextAreaElement;

  public readonly brailleLinesStart = 0;
  public readonly reviewLineStart = 1;

  constructor(
    maidr: Maidr,
    onFocus: () => void,
    onBlur: (event: FocusEvent) => void
  ) {
    this.maidr = maidr;
    const maidrId = this.maidr.id;

    const plot = document.getElementById(maidrId);
    if (!plot || !plot.parentNode) {
      console.error('Plot container not found');
      return;
    }

    this.plot = plot;
    this.addInstruction();

    this.onFocus = onFocus;
    this.onBlur = onBlur;

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
    this.textDiv =
      document.getElementById(textId) ?? this.createTextContainer(textId);
    this.notificationDiv =
      document.getElementById(notificationId) ??
      this.createNotificationContainer(notificationId);
    this.brailleReviewDiv =
      document.getElementById(brailleId) ??
      this.createBrailleContainer(brailleId);
    this.brailleReviewTextArea =
      (document.getElementById(brailleInputId) as HTMLTextAreaElement) ??
      this.createBrailleReviewInput(brailleInputId);

    this.brailleReviewTextArea.addEventListener(EventType.BLUR, this.onBlur);
  }

  public destroy(): void {
    if (this.brailleReviewTextArea) {
      this.brailleReviewTextArea.value = Constant.EMPTY;
    }
    if (this.brailleReviewDiv) {
      this.brailleReviewDiv.classList.add(Constant.HIDDEN);
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

  private createBrailleReviewInput(
    brailleReviewInputId: string
  ): HTMLTextAreaElement {
    const brailleInput = document.createElement(Constant.TEXTAREA);
    brailleInput.id = brailleReviewInputId;
    // brailleInput.size = Constant.BRAILLE_INPUT_LENGTH;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleReviewDiv!.appendChild(brailleInput);
    return brailleInput;
  }

  public toggleBrailleReviewFocus(): void {
    if (
      (document.activeElement as HTMLTextAreaElement) ===
        this.brailleReviewTextArea &&
      this.onBlur
    ) {
      if (this.brailleReviewTextArea.value) {
        return;
      }
      this.brailleReviewTextArea.removeEventListener(
        EventType.BLUR,
        this.onBlur
      );
      this.plot?.focus();
      this.brailleReviewTextArea.addEventListener(EventType.BLUR, this.onBlur);
      this.brailleReviewDiv?.classList.add(Constant.HIDDEN);
    } else if ((document.activeElement as HTMLElement) === this.plot) {
      this.brailleReviewDiv?.classList.remove(Constant.HIDDEN);
      this.brailleReviewTextArea?.focus();
    }
  }
}
