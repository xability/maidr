import Constant from '../../util/constant';
import {EventType} from '../../index';
import menuHtml from '../../static/help_menu.html';

export default class DisplayManager {
  private readonly plot?: HTMLElement;
  private readonly onFocus?: () => void;
  private readonly onBlur?: (event: FocusEvent) => void;

  private readonly articleElement?: HTMLElement;
  private readonly figureElement?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleDiv?: HTMLElement;
  public readonly brailleInput?: HTMLInputElement;

  public readonly helpMenu?: HTMLElement;

  constructor(
    maidrId: string,
    onFocus: () => void,
    onBlur: (event: FocusEvent) => void
  ) {
    const plot = document.getElementById(maidrId);
    if (!plot || !plot.parentNode) {
      console.error('Plot container not found');
      return;
    }

    this.plot = plot;
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
    const helpMenuId = Constant.HELP_MENU + maidrId;
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
    this.helpMenu =
      (document.getElementById(helpMenuId) as HTMLInputElement) ??
      this.createHelpMenu(helpMenuId);
    this.brailleInput.addEventListener(EventType.BLUR, this.onBlur);
  }

  public destroy(): void {
    if (this.brailleInput && this.onBlur) {
      this.brailleInput.removeEventListener(EventType.BLUR, this.onBlur);
    }
    if (this.notificationDiv) {
      this.notificationDiv.innerHTML = Constant.EMPTY;
    }
    if (this.textDiv) {
      this.textDiv.innerHTML = Constant.EMPTY;
    }
  }

  private createArticleElement(articleId: string): HTMLElement {
    // Create an article element that wraps the figure-wrapped SVG.
    const mainArticleWrapper = document.createElement(Constant.ARTICLE);
    mainArticleWrapper.id = articleId;

    // Wrap the figure-wrapped SVG within the article.
    this.figureElement!.parentNode!.replaceChild(
      mainArticleWrapper,
      this.figureElement!
    );
    mainArticleWrapper.appendChild(this.figureElement!);

    return mainArticleWrapper;
  }

  private createFigureElement(figureId: string): HTMLElement {
    // Create a figure element that wraps the SVG.
    const plotFigureWrapper = document.createElement(Constant.FIGURE);
    plotFigureWrapper.id = figureId;
    plotFigureWrapper.role = Constant.APPLICATION;
    plotFigureWrapper.tabIndex = 0;

    // Wrap the SVG within the figure.
    this.plot!.parentNode!.replaceChild(plotFigureWrapper, this.plot!);
    plotFigureWrapper.appendChild(this.plot!);

    return plotFigureWrapper;
  }

  private createBreakElement(breakId: string): HTMLElement {
    // Create a break element to use as a marker for div insertion.
    const br = document.createElement(Constant.BR);
    br.id = breakId;
    this.figureElement!.insertAdjacentElement(Constant.AFTER_END, br);

    return br;
  }

  private createTextContainer(textId: string): HTMLElement {
    // Create a div to display model information based on user traversal.
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = textId;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.figureElement!.insertAdjacentElement(Constant.AFTER_END, textDiv);

    return textDiv;
  }

  private createNotificationContainer(notificationId: string): HTMLElement {
    // Create a div to display configuration changes to the user.
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
    // Create a div to house the braille input.
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = brailleId;
    brailleDiv.classList.add(Constant.HIDDEN);

    // Maintain the figure context by placing the braille as a child.
    this.figureElement!.insertBefore(
      brailleDiv,
      this.figureElement!.firstChild
    );

    return brailleDiv;
  }

  private createBrailleInput(brailleInputId: string): HTMLInputElement {
    // Create a braille input element for displaying model information in braille format.
    const brailleInput = document.createElement(Constant.INPUT);
    brailleInput.id = brailleInputId;
    brailleInput.size = Constant.BRAILLE_INPUT_LENGTH;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleDiv!.appendChild(brailleInput);

    return brailleInput;
  }

  public toggleBrailleFocus(): void {
    if (
      (document.activeElement as HTMLInputElement) === this.brailleInput &&
      this.onBlur
    ) {
      this.brailleInput.removeEventListener(EventType.BLUR, this.onBlur);
      this.figureElement?.focus();
      this.brailleInput.addEventListener(EventType.BLUR, this.onBlur);
    }
    if ((document.activeElement as HTMLElement) === this.figureElement) {
      this.brailleInput?.focus();
    }
  }

  private addCloseEventListener(element: HTMLElement, elementId: string): void {
    const button = element.querySelector(elementId) as HTMLElement;
    if (button) {
      button.addEventListener('click', () => {
        element.classList.add(Constant.HIDDEN);
      });
    }
  }

  private createHelpMenu(helpMenuId: string): HTMLElement | null {
    if (!menuHtml) {
      return null;
    }
    const tempContainer = document.createElement(Constant.DIV);
    tempContainer.innerHTML = menuHtml.trim();
    const helpMenuElement = tempContainer.firstElementChild as HTMLElement;
    helpMenuElement.id = helpMenuId;

    if (this.figureElement && helpMenuElement) {
      this.figureElement.insertAdjacentElement(
        Constant.AFTER_END,
        helpMenuElement
      );
    }

    this.addCloseEventListener(helpMenuElement, '#close_help_menu_header');
    this.addCloseEventListener(helpMenuElement, '#close_help_menu_footer');

    return helpMenuElement;
  }
}
