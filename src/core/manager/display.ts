import Constant from '../../util/constant';

export default class DisplayManager {
  private readonly plot?: HTMLElement;

  private readonly mainArticleWrapper?: HTMLElement;
  private readonly plotFigureWrapper?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleDiv?: HTMLElement;
  public readonly brailleInput?: HTMLInputElement;

  constructor(maidrId: string) {
    const plot = document.getElementById(maidrId);
    if (!plot || !plot.parentNode) {
      console.error('Plot container not found');
      return;
    }
    this.plot = plot;

    this.plotFigureWrapper = this.createPlotFigureWrapper();
    this.mainArticleWrapper = this.createMainArticleWrapper();
    this.br = this.createBreakElement();

    this.textDiv = this.createTextContainer();
    this.notificationDiv = this.createNotificationContainer();

    this.brailleDiv = this.createBrailleContainer();
    this.brailleInput = this.createBrailleInput();
  }

  public destroy(): void {
    // if (this.plot && this.plotFigureWrapper) {
    //   this.mainArticleWrapper?.parentNode?.replaceChild(
    //     this.plotFigureWrapper,
    //     this.mainArticleWrapper
    //   );
    //   this.plotFigureWrapper?.parentNode?.replaceChild(
    //     this.plot,
    //     this.plotFigureWrapper
    //   );
    // }
    // this.mainArticleWrapper?.insertAdjacentElement('afterend', this.plot!);
    // this.mainArticleWrapper?.remove();
    // this.mainArticleWrapper?.remove();
    // this.br?.remove();
    // this.plotFigureWrapper?.remove();
    // this.textDiv?.remove();
    // this.notificationDiv?.remove();
    // this.brailleInput?.remove();
    // this.brailleDiv?.remove();

    // Clear the messages shown in textDiv and notificationDiv
    this.notificationDiv!.innerHTML = Constant.EMPTY;
    this.textDiv!.innerHTML = Constant.EMPTY;
  }

  private createMainArticleWrapper(): HTMLElement {
    // Create an article element that wraps the figure-wrapped SVG
    if (document.getElementById(Constant.MAIN_ARTICLE_ID)) {
      return document.getElementById(Constant.MAIN_ARTICLE_ID) as HTMLElement;
    }
    const mainArticleWrapper = document.createElement(Constant.ARTICLE);
    mainArticleWrapper.id = Constant.MAIN_ARTICLE_ID;

    // Wrap the figure-wrapped SVG within the article
    this.plotFigureWrapper!.parentNode!.replaceChild(
      mainArticleWrapper,
      this.plotFigureWrapper!
    );
    mainArticleWrapper.appendChild(this.plotFigureWrapper!);

    return mainArticleWrapper;
  }

  private createPlotFigureWrapper(): HTMLElement {
    // Create a figure element that wraps the SVG
    if (document.getElementById(Constant.PLOT_FIGURE_ID)) {
      return document.getElementById(Constant.PLOT_FIGURE_ID) as HTMLElement;
    }
    const plotFigureWrapper = document.createElement(Constant.FIGURE);
    plotFigureWrapper.id = Constant.PLOT_FIGURE_ID;
    plotFigureWrapper.role = Constant.APPLICATION;
    plotFigureWrapper.tabIndex = 0;

    // Wrap the SVG within the figure
    this.plot!.parentNode!.replaceChild(plotFigureWrapper, this.plot!);
    plotFigureWrapper.appendChild(this.plot!);
    return plotFigureWrapper;
  }

  private createBreakElement(): HTMLElement {
    // Use the object created onload instead of duplicating
    if (document.getElementById(Constant.BR)) {
      return document.getElementById(Constant.BR) as HTMLElement;
    }
    const br = document.createElement(Constant.BR);
    this.plotFigureWrapper!.insertAdjacentElement(Constant.AFTER_END, br);
    return br;
  }

  private createTextContainer(): HTMLElement {
    // Use the object created onload instead of duplicating
    if (document.getElementById(Constant.TEXT_CONTAINER_ID)) {
      return document.getElementById(Constant.TEXT_CONTAINER_ID) as HTMLElement;
    }
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = Constant.TEXT_CONTAINER_ID;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotFigureWrapper!.insertAdjacentElement(Constant.AFTER_END, textDiv);
    return textDiv;
  }

  private createNotificationContainer(): HTMLElement {
    // Use the object created onload instead of duplicating
    if (document.getElementById(Constant.NOTIFICATION_CONTAINER_ID)) {
      return document.getElementById(
        Constant.NOTIFICATION_CONTAINER_ID
      ) as HTMLElement;
    }
    const notificationDiv = document.createElement(Constant.DIV);
    notificationDiv.id = Constant.NOTIFICATION_CONTAINER_ID;
    notificationDiv.classList.add(Constant.MB_3);
    notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotFigureWrapper!.insertAdjacentElement(
      Constant.AFTER_END,
      notificationDiv
    );
    return notificationDiv;
  }

  private createBrailleContainer(): HTMLElement {
    // Use the object created onload instead of duplicating
    if (document.getElementById(Constant.BRAILLE_CONTAINER_ID)) {
      return document.getElementById(
        Constant.BRAILLE_CONTAINER_ID
      ) as HTMLElement;
    }
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = Constant.BRAILLE_CONTAINER_ID;
    brailleDiv.classList.add(Constant.HIDDEN);

    this.plotFigureWrapper!.insertBefore(
      brailleDiv,
      this.plotFigureWrapper!.firstChild
    );
    return brailleDiv;
  }

  private createBrailleInput(): HTMLInputElement {
    // Use the object created onload instead of duplicating
    if (document.getElementById(Constant.BRAILLE_INPUT_ID)) {
      return document.getElementById(
        Constant.BRAILLE_INPUT_ID
      ) as HTMLInputElement;
    }
    const brailleInput = document.createElement(Constant.INPUT);
    brailleInput.id = Constant.BRAILLE_INPUT_ID;
    brailleInput.size = Constant.BRAILLE_INPUT_LENGTH;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleDiv!.appendChild(brailleInput);
    return brailleInput;
  }
}
