import {PlotState} from '../../model/state';
import {Constant} from '../../util/constant';
import {Observer} from '../interface';
import {NotificationManager} from './notification';

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
      const verbose = [];
      // Format main-axis values.
      verbose.push(state.text.mainLabel, Constant.IS);

      // Format for histogram.
      if (state.text.min !== undefined && state.text.max !== undefined) {
        verbose.push(state.text.min, Constant.THROUGH, state.text.max);
      } else {
        verbose.push(state.text.mainValue);
      }

      // Format cross-axis label.
      verbose.push(Constant.COMMA, state.text.crossLabel);

      // Format for boxplot.
      if (state.text.section !== undefined) {
        verbose.push(Constant.COMMA);

        if (Array.isArray(state.text.crossValue)) {
          verbose.push(state.text.crossValue.length, Constant.SPACE);
        }

        verbose.push(state.text.section);
      }

      // Format cross-axis values.
      if (!Array.isArray(state.text.crossValue)) {
        verbose.push(Constant.IS, state.text.crossValue);
      } else if (state.text.crossValue.length > 1) {
        verbose.push(Constant.ARE, state.text.crossValue.join(Constant.COMMA));
      } else if (state.text.crossValue.length > 0) {
        verbose.push(Constant.IS, state.text.crossValue.join(Constant.COMMA));
      }

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
      const terse = [];
      terse.push(state.text.mainValue, Constant.COMMA);

      // Format for boxplot.
      if (state.text.section !== undefined) {
        if (Array.isArray(state.text.crossValue)) {
          terse.push(state.text.crossValue.length, Constant.SPACE);
        }
        terse.push(state.text.section);
      }

      if (state.text.fillValue !== undefined) {
        terse.push(state.text.fillValue, Constant.COMMA);
      }

      if (!Array.isArray(state.text.crossValue)) {
        terse.push(Constant.IS, state.text.crossValue);
      } else if (state.text.crossValue.length > 1) {
        terse.push(Constant.ARE, state.text.crossValue.join(Constant.COMMA));
      } else if (state.text.crossValue.length > 0) {
        terse.push(Constant.IS, state.text.crossValue.join(Constant.COMMA));
      }

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
