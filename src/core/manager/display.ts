import Constant from '../../util/constant';

export default class DisplayManager {
  private readonly plot?: HTMLElement;

  private readonly mainDiv?: HTMLElement;
  private readonly plotDiv?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleDiv?: HTMLElement;
  public readonly brailleInput?: HTMLInputElement;

  public readonly reviewDiv?: HTMLElement;

  constructor(maidrId: string) {
    const plot = document.getElementById(maidrId);
    if (!plot || !plot.parentNode) {
      console.error('Plot container not found');
      return;
    }

    this.plot = plot;

    this.plotDiv = this.createPlotContainer();
    this.mainDiv = this.createMainContainer();
    this.br = this.createBreakElement();

    this.textDiv = this.createTextContainer();
    this.notificationDiv = this.createNotificationContainer();

    this.brailleDiv = this.createBrailleContainer();
    this.brailleInput = this.createBrailleInput();

    this.reviewDiv = this.createReviewContainer();
  }

  public destroy(): void {
    if (this.plot && this.plotDiv) {
      this.mainDiv?.parentNode?.replaceChild(this.plotDiv, this.mainDiv);
      this.plotDiv?.parentNode?.replaceChild(this.plot, this.plotDiv);
    }
    this.mainDiv?.remove();
    this.br?.remove();
    this.plotDiv?.remove();

    this.textDiv?.remove();
    this.notificationDiv?.remove();

    this.brailleInput?.remove();
    this.brailleDiv?.remove();

    this.reviewDiv?.remove();
  }

  private createMainContainer(): HTMLElement {
    // Create a main container for the plot.
    const mainDiv = document.createElement(Constant.DIV);
    mainDiv.id = Constant.MAIN_CONTAINER_ID;
    mainDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Replace the plot container with the main container.
    this.plotDiv!.parentNode!.replaceChild(mainDiv, this.plotDiv!);
    mainDiv.appendChild(this.plotDiv!);

    return mainDiv;
  }

  private createPlotContainer(): HTMLElement {
    // Create a plot container for the SVG.
    const plotDiv = document.createElement(Constant.DIV);
    plotDiv.id = Constant.PLOT_CONTAINER_ID;
    plotDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Replace the plot with the container.
    this.plot!.parentNode!.replaceChild(plotDiv, this.plot!);
    plotDiv.appendChild(this.plot!);
    return plotDiv;
  }

  private createBreakElement(): HTMLElement {
    const br = document.createElement(Constant.BR);
    this.plotDiv!.insertAdjacentElement(Constant.AFTER_END, br);
    return br;
  }

  private createTextContainer(): HTMLElement {
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = Constant.TEXT_CONTAINER_ID;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotDiv!.insertAdjacentElement(Constant.AFTER_END, textDiv);
    return textDiv;
  }

  private createNotificationContainer(): HTMLElement {
    const notificationDiv = document.createElement(Constant.DIV);
    notificationDiv.id = Constant.NOTIFICATION_CONTAINER_ID;
    notificationDiv.classList.add(Constant.MB_3);
    notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.plotDiv!.insertAdjacentElement(Constant.AFTER_END, notificationDiv);
    return notificationDiv;
  }

  private createBrailleContainer(): HTMLElement {
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = Constant.BRAILLE_CONTAINER_ID;
    brailleDiv.classList.add(Constant.HIDDEN);

    this.plotDiv!.insertAdjacentElement(Constant.BEFORE_BEGIN, brailleDiv);
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

  private createReviewContainer(): HTMLElement {
    const reviewDiv = document.createElement(Constant.DIV);
    reviewDiv.id = Constant.REVIEW_CONTAINER_ID;
    reviewDiv.classList.add(Constant.HIDDEN);

    this.plotDiv!.insertAdjacentElement(Constant.AFTER_END, reviewDiv);
    return reviewDiv;
  }
}
