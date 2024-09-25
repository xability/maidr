import Constant from '../../util/constant';

export default class DisplayManager {
  private readonly chart?: HTMLElement;

  private readonly mainDiv?: HTMLElement;
  private readonly chartDiv?: HTMLElement;
  private readonly br?: HTMLElement;

  public readonly textDiv?: HTMLElement;
  public readonly notificationDiv?: HTMLElement;

  public readonly brailleDiv?: HTMLElement;
  public readonly brailleInput?: HTMLElement;

  constructor(maidrId: string) {
    const chart = document.getElementById(maidrId);
    if (!chart || !chart.parentNode) {
      console.error('Chart container not found');
      return;
    }

    this.chart = chart;

    this.chartDiv = this.createChartContainer();
    this.mainDiv = this.createMainContainer();
    this.br = this.createBreakElement();

    this.textDiv = this.createTextContainer();
    this.notificationDiv = this.createNotificationContainer();

    this.brailleDiv = this.createBrailleContainer();
    this.brailleInput = this.createBrailleInput();
  }

  public destroy(): void {
    if (this.chart && this.chartDiv) {
      this.mainDiv?.parentNode?.replaceChild(this.chartDiv, this.mainDiv);
      this.chartDiv?.parentNode?.replaceChild(this.chart, this.chartDiv);
    }
    this.mainDiv?.remove();
    this.br?.remove();
    this.chartDiv?.remove();

    this.textDiv?.remove();
    this.notificationDiv?.remove();

    this.brailleInput?.remove();
    this.brailleDiv?.remove();
  }

  private createMainContainer(): HTMLElement {
    // Create a main container for the chart.
    const mainDiv = document.createElement(Constant.DIV);
    mainDiv.id = Constant.MAIN_CONTAINER_ID;
    mainDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Replace the chart container with the main container.
    this.chartDiv!.parentNode!.replaceChild(mainDiv, this.chartDiv!);
    mainDiv.appendChild(this.chartDiv!);

    return mainDiv;
  }

  private createChartContainer(): HTMLElement {
    // Create a chart container for the SVG.
    const chartDiv = document.createElement(Constant.DIV);
    chartDiv.id = Constant.CHART_CONTAINER_ID;
    chartDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Replace the chart with the container.
    this.chart!.parentNode!.replaceChild(chartDiv, this.chart!);
    chartDiv.appendChild(this.chart!);
    return chartDiv;
  }

  private createBreakElement(): HTMLElement {
    const br = document.createElement(Constant.BR);
    this.chartDiv!.insertAdjacentElement(Constant.AFTER_END, br);
    return br;
  }

  private createTextContainer(): HTMLElement {
    const textDiv = document.createElement(Constant.DIV);
    textDiv.id = Constant.TEXT_CONTAINER_ID;
    textDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    textDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.chartDiv!.insertAdjacentElement(Constant.AFTER_END, textDiv);
    return textDiv;
  }

  private createNotificationContainer(): HTMLElement {
    const notificationDiv = document.createElement(Constant.DIV);
    notificationDiv.id = Constant.NOTIFICATION_CONTAINER_ID;
    notificationDiv.classList.add(Constant.MB_3);
    notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.chartDiv!.insertAdjacentElement(Constant.AFTER_END, notificationDiv);
    return notificationDiv;
  }

  private createBrailleContainer(): HTMLElement {
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = Constant.BRAILLE_CONTAINER_ID;
    brailleDiv.classList.add(Constant.HIDDEN);

    this.chartDiv!.insertAdjacentElement(Constant.BEFORE_BEGIN, brailleDiv);
    return brailleDiv;
  }

  private createBrailleInput(): HTMLElement {
    const brailleInput = document.createElement(Constant.DIV);
    brailleInput.id = Constant.BRAILLE_INPUT_ID;
    brailleInput.ariaBrailleRoleDescription = Constant.EMPTY;
    brailleInput.classList.add(Constant.BRAILLE_INPUT_CLASS);

    this.brailleDiv!.appendChild(brailleInput);
    return brailleInput;
  }
}
