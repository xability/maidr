import Constant from '../../util/constant';

export default class DisplayManager {
  private readonly plot?: HTMLElement;

  private readonly mainArticle?: HTMLElement;
  private readonly plotFigure?: HTMLElement;
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

    this.plotFigure = this.createPlotFigureWrapper();
    this.mainArticle = this.createMainArticleWrapper();
    this.br = this.createBreakElement();

    this.textDiv = this.createTextContainer();
    this.notificationDiv = this.createNotificationContainer();

    this.brailleDiv = this.createBrailleContainer();
    this.brailleInput = this.createBrailleInput();
  }

  public destroy(): void {
    if (this.plot && this.plotFigure) {
      this.mainArticle?.parentNode?.replaceChild(
        this.plotFigure,
        this.mainArticle
      );
      this.plotFigure?.parentNode?.replaceChild(this.plot, this.plotFigure);
    }
    this.mainArticle?.remove();
    this.br?.remove();
    this.plotFigure?.remove();

    this.textDiv?.remove();
    this.notificationDiv?.remove();

    this.brailleInput?.remove();
    this.brailleDiv?.remove();
  }

  private createMainArticleWrapper(): HTMLElement {
    // Create an article element that wraps the figure-wrapped SVG
    const mainArticle = document.createElement(Constant.ARTICLE);
    mainArticle.id = Constant.MAIN_ARTICLE_ID;
    // mainDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Wrap the figure-wrapped SVG within the article
    this.plotFigure!.parentNode!.replaceChild(mainArticle, this.plotFigure!);
    mainArticle.appendChild(this.plotFigure!);

    return mainArticle;
  }

  private createPlotFigureWrapper(): HTMLElement {
    // Create a figure element that wraps the SVG
    const plotFigure = document.createElement(Constant.FIGURE);
    plotFigure.id = Constant.PLOT_FIGURE_ID;
    plotFigure.tabIndex = 0;
    // plotFigure.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Wrap the SVG within the figure
    this.plot?.setAttribute(Constant.ROLE, Constant.APPLICATION);
    this.plot!.parentNode!.replaceChild(plotFigure, this.plot!);
    plotFigure.appendChild(this.plot!);
    return plotFigure;
  }

  private createBreakElement(): HTMLElement {
    const br = document.createElement(Constant.BR);
    this.plotFigure!.insertAdjacentElement(Constant.AFTER_END, br);
    return br;
  }

  private createTextContainer(): HTMLElement {
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = Constant.TEXT_CONTAINER_ID;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotFigure!.insertAdjacentElement(Constant.AFTER_END, textDiv);
    return textDiv;
  }

  private createNotificationContainer(): HTMLElement {
    const notificationDiv = document.createElement(Constant.DIV);
    notificationDiv.id = Constant.NOTIFICATION_CONTAINER_ID;
    notificationDiv.classList.add(Constant.MB_3);
    notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotFigure!.insertAdjacentElement(Constant.AFTER_END, notificationDiv);
    return notificationDiv;
  }

  private createBrailleContainer(): HTMLElement {
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = Constant.BRAILLE_CONTAINER_ID;
    brailleDiv.classList.add(Constant.HIDDEN);

    this.plotFigure!.insertAdjacentElement(Constant.BEFORE_BEGIN, brailleDiv);
    return brailleDiv;
  }

  private createBrailleInput(): HTMLInputElement {
    const brailleInput = document.createElement(Constant.INPUT);
    brailleInput.id = Constant.BRAILLE_INPUT_ID;
    brailleInput.size = Constant.BRAILLE_INPUT_LENGTH;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleDiv!.appendChild(brailleInput);
    return brailleInput;
  }
}
