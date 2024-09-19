import Constant from '../util/constant';
import Notification from './notification';

enum DisplayMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

export default class Display {
  private mode: DisplayMode;
  private readonly notification!: Notification;

  private readonly chart?: HTMLElement;
  private readonly chartDiv?: HTMLElement;
  private readonly infoDiv?: HTMLElement;

  constructor(notification: Notification, maidrId: string) {
    const chart = document.getElementById(maidrId);
    if (!chart) {
      console.error('Chart container not found');
      this.mode = DisplayMode.OFF;
      return;
    }

    this.mode = DisplayMode.TERSE;
    this.notification = notification;

    this.chart = chart;
    this.chartDiv = this.createChartContainer();
    this.infoDiv = this.createInfoContainer();
  }

  public destroy(): void {
    if (this.chart) {
      this.chartDiv?.parentNode?.replaceChild(this.chart, this.chartDiv);
    }
    this.chartDiv?.remove();
    this.infoDiv?.remove();
  }

  private createChartContainer(): HTMLElement {
    // Create a container for the chart.
    const chartDiv = document.createElement(Constant.DIV);
    chartDiv.id = Constant.CHART_CONTAINER_ID;
    chartDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Replace the chart with the container and re-focus the chart.
    if (this.chart && this.chart.parentNode) {
      this.chart.parentNode.replaceChild(chartDiv, this.chart);
      chartDiv.appendChild(this.chart);
    }

    const br = document.createElement(Constant.BR);
    chartDiv.insertAdjacentElement(Constant.AFTER_END, br);

    return chartDiv;
  }

  private createInfoContainer(): HTMLElement {
    const infoDiv = document.createElement(Constant.DIV);
    infoDiv.id = Constant.INFO_CONTAINER_ID;
    infoDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    infoDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.chartDiv?.insertAdjacentElement(Constant.AFTER_END, infoDiv);
    infoDiv.insertAdjacentElement(
      Constant.AFTER_END,
      this.notification.notificationDiv
    );
    return infoDiv;
  }

  public showInfo(type: string, text: string): void {
    // Show text only if turned on.
    if (this.mode === DisplayMode.OFF) {
      return;
    }
    if (!type) {
      throw new Error(`Info type is required. Got ${type}`);
    }

    // Format the text based on the display mode.
    let info: string;
    if (!text) {
      info = `No ${type} to display`;
    } else if (this.mode === DisplayMode.VERBOSE) {
      info = `${type} is ${text}`;
    } else {
      info = text;
    }

    // Display the text.
    if (info && this.infoDiv) {
      const paragraph = document.createElement(Constant.P);
      paragraph.innerHTML = info;

      this.infoDiv.innerHTML = Constant.EMPTY;
      this.infoDiv.append(paragraph);
    }
  }

  public toggle(): void {
    switch (this.mode) {
      case DisplayMode.OFF:
        this.mode = DisplayMode.TERSE;
        break;

      case DisplayMode.TERSE:
        this.mode = DisplayMode.VERBOSE;
        break;

      case DisplayMode.VERBOSE:
        this.mode = DisplayMode.OFF;
        break;
    }

    const message = `Text mode is ${this.mode}`;
    this.notification.notify(message);
  }
}
