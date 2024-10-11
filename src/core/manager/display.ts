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
    /*
     * The construction of the wrapper elements and supporting DIVs is an onLoad operation instead of an onFocus operation.
     * Hence individual HTML elements need not be destroyed when maidr is deactivated.
     * Clear the messages shown in textDiv and notificationDiv to cleanse the display
     */
    this.notificationDiv!.innerHTML = Constant.EMPTY;
    this.textDiv!.innerHTML = Constant.EMPTY;
  }

  private createMainArticleWrapper(): HTMLElement {
    // Create an article element that wraps the figure-wrapped SVG
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
    // Create a break element to use as a marker for div insertion
    const br = document.createElement(Constant.BR);
    this.plotFigureWrapper!.insertAdjacentElement(Constant.AFTER_END, br);

    return br;
  }

  private createTextContainer(): HTMLElement {
    // Create a div to display plot information based on user traversal
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = Constant.TEXT_CONTAINER_ID;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotFigureWrapper!.insertAdjacentElement(Constant.AFTER_END, textDiv);

    return textDiv;
  }

  private createNotificationContainer(): HTMLElement {
    // Create a div to display configuration changes to the user
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
    // Create a div to house the braille input
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = Constant.BRAILLE_CONTAINER_ID;
    brailleDiv.classList.add(Constant.HIDDEN);

    /*
     * When the focus shifts to braille input, we need to maintain some reference of the figure element.
     * Hence, the braille container is now inserted as a child of the figure element.
     * This helps in switching the focus back to the braille container's parent - which is technically the figure element
     */

    this.plotFigureWrapper!.insertBefore(
      brailleDiv,
      this.plotFigureWrapper!.firstChild
    );

    return brailleDiv;
  }

  private createBrailleInput(): HTMLInputElement {
    // Creeate a braille input element for displaying plot information in braille format
    const brailleInput = document.createElement(Constant.INPUT);
    brailleInput.id = Constant.BRAILLE_INPUT_ID;
    brailleInput.size = Constant.BRAILLE_INPUT_LENGTH;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleDiv!.appendChild(brailleInput);

    return brailleInput;
  }
}
