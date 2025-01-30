import {Constant} from '../../util/constant';
import {NotificationManager} from './notification';
import {Observer} from '../interface';
import {PlotState} from '../../model/state';

enum TextMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

export class TextManager implements Observer {
  private mode: TextMode;
  private readonly notification: NotificationManager;
  private readonly textDiv!: HTMLElement;

  public constructor(notification: NotificationManager, textDiv?: HTMLElement) {
    this.notification = notification;
    if (!textDiv) {
      this.mode = TextMode.OFF;
      return;
    }

    this.mode = TextMode.VERBOSE;
    this.textDiv = textDiv;
  }

  public formatText(state: PlotState): string {
    if (!state || state.empty) {
      return 'No info to display';
    } else if (this.mode === TextMode.VERBOSE) {
      // TODO: Format for segmented and boxplot.
      const verbose = [];
      // Format main-axis values.
      verbose.push(state.text.mainLabel, Constant.IS);

      // Format for histogram.
      if (state.text.min !== undefined && state.text.max !== undefined) {
        verbose.push(state.text.min, Constant.THROUGH, state.text.max);
      } else {
        verbose.push(state.text.mainValue);
      }

      // Format cross-axis values.
      verbose.push(
        Constant.COMMA,
        state.text.crossLabel,
        Constant.IS,
        state.text.crossValue
      );

      // Format for heatmap.
      if (state.text.fillValue !== undefined) {
        verbose.push(
          Constant.COMMA,
          state.text.fillLabel,
          Constant.IS,
          state.text.fillValue
        );
      }

      return verbose.join(Constant.EMPTY);
    } else {
      // TODO: Format for segmented and boxplot.
      const terse = [
        state.text.mainValue,
        Constant.COMMA,
        state.text.crossValue,
      ];
      return terse.join(Constant.EMPTY);
    }
  }

  public update(state: string | PlotState): void {
    // Show text only if turned on.
    if (this.mode === TextMode.OFF) {
      return;
    }

    // Format the text based on the display mode.
    let text;
    if (typeof state === 'string') {
      text = state;
    } else {
      text = this.formatText(state);
    }

    // Display the text.
    if (text) {
      const paragraph = document.createElement(Constant.P);
      paragraph.innerHTML = text;
      this.textDiv.innerHTML = Constant.EMPTY;
      this.textDiv.append(paragraph);
    }
  }

  public toggle(): void {
    switch (this.mode) {
      case TextMode.OFF:
        this.mode = TextMode.VERBOSE;
        break;

      case TextMode.TERSE:
        this.mode = TextMode.OFF;
        break;

      case TextMode.VERBOSE:
        this.mode = TextMode.TERSE;
        break;
    }

    if (this.mode === TextMode.OFF) {
      this.textDiv?.classList.add(Constant.HIDDEN);
    } else {
      this.textDiv?.classList.remove(Constant.HIDDEN);
    }

    const message = `Text mode is ${this.mode}`;
    this.notification.notify(message);
  }

  public mute(): void {
    this.textDiv?.removeAttribute(Constant.ARIA_LIVE);
    this.textDiv?.removeAttribute(Constant.ARIA_ATOMIC);
  }

  public unmute(): void {
    this.textDiv?.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    this.textDiv?.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);
  }
}
