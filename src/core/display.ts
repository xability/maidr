import BrailleManager from './braille';
import Constant from '../util/constant';
import {DisplayState} from '../plot/state';
import NotificationManager from './notification';

enum DisplayMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

export default class DisplayManager {
  private mode: DisplayMode;
  private readonly notification!: NotificationManager;

  private readonly chart?: HTMLElement;
  private readonly mainDiv?: HTMLElement;
  private readonly infoDiv?: HTMLElement;
  private readonly brailleDiv?: HTMLElement;

  constructor(
    maidrId: string,
    notification: NotificationManager,
    braille: BrailleManager
  ) {
    const chart = document.getElementById(maidrId);
    if (!chart || !chart.parentNode) {
      console.error('Chart container not found');
      this.mode = DisplayMode.OFF;
      return;
    }
    this.mode = DisplayMode.TERSE;
    this.notification = notification;

    this.chart = chart;
    this.brailleDiv = braille?.brailleDiv;
    this.mainDiv = this.createChartContainer();
    this.infoDiv = this.createInfoContainer();
  }

  public destroy(): void {
    if (this.chart) {
      this.mainDiv?.parentNode?.replaceChild(this.chart, this.mainDiv);
    }
    this.mainDiv?.remove();
    this.infoDiv?.remove();
  }

  private createChartContainer(): HTMLElement {
    // Create a main container for the chart.
    const mainDiv = document.createElement(Constant.DIV);
    mainDiv.id = Constant.MAIN_CONTAINER_ID;
    mainDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Create a chart container for the SVG.
    const chartDiv = document.createElement(Constant.DIV);
    chartDiv.id = Constant.CHART_CONTAINER_ID;
    chartDiv.setAttribute(Constant.ROLE, Constant.APPLICATION);

    // Replace the chart with the container and re-focus the chart.
    if (this.chart && this.chart.parentNode) {
      this.chart.parentNode.replaceChild(mainDiv, this.chart);
      mainDiv.appendChild(chartDiv);
      chartDiv.appendChild(this.chart);
    }

    const br = document.createElement(Constant.BR);
    mainDiv.insertAdjacentElement(Constant.AFTER_END, br);

    if (this.brailleDiv) {
      mainDiv?.insertAdjacentElement(Constant.BEFORE_BEGIN, this.brailleDiv);
    }

    return mainDiv;
  }

  private createInfoContainer(): HTMLElement {
    const infoDiv = document.createElement(Constant.DIV);
    infoDiv.id = Constant.INFO_CONTAINER_ID;
    infoDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    infoDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);

    this.mainDiv?.insertAdjacentElement(Constant.AFTER_END, infoDiv);
    infoDiv.insertAdjacentElement(
      Constant.AFTER_END,
      this.notification.notificationDiv
    );
    return infoDiv;
  }

  public show(state: string | DisplayState): void {
    // Show text only if turned on.
    if (this.mode === DisplayMode.OFF) {
      const infoDiv = document.getElementById(Constant.INFO_CONTAINER_ID);
      if (infoDiv) {
        infoDiv.innerHTML = Constant.EMPTY;
      }
      return;
    }

    // Format the text based on the display mode.
    let text;
    if (!state) {
      text = 'No info to display';
    } else if (typeof state === 'string') {
      text = state;
    } else if (this.mode === DisplayMode.VERBOSE) {
      // TODO: Format for segmented and boxplot.
      const verbose = [];
      // Format main-axis values.
      verbose.push(state.mainLabel, Constant.IS);

      // Format for histogram.
      if (state.min && state.max && this.chart?.id === 'histogram') {
        verbose.push(state.min, Constant.THROUGH, state.max);
      } else {
        verbose.push(state.mainValue);
      }

      // Format cross-axis values.
      verbose.push(Constant.COMMA, Constant.SPACE);
      verbose.push(state.crossLabel, Constant.IS, state.crossValue);

      // Format for heatmap.
      if (state.fillValue) {
        verbose.push(
          Constant.SPACE,
          state.fillLabel,
          Constant.IS,
          state.fillValue
        );
      }
      text = verbose.join(Constant.SPACE);
    } else if (this.mode === DisplayMode.TERSE) {
      // TODO: Format for segmented and boxplot.
      const terse = [
        state.mainValue,
        Constant.COMMA,
        Constant.SPACE,
        state.crossValue,
      ];
      text = terse.join(Constant.EMPTY);
    }

    // Display the text.
    if (text && this.infoDiv) {
      const paragraph = document.createElement(Constant.P);
      paragraph.innerHTML = text;

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
