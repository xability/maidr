import type { Observer } from '@type/observable';
import type { PlotState, TextState } from '@type/state';
import type { NotificationService } from './notification';
import { Constant } from '@util/constant';

enum TextMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

export class TextService implements Observer {
  private readonly notification: NotificationService;

  private mode: TextMode;
  private readonly textDiv!: HTMLElement;

  public constructor(notification: NotificationService, textDiv?: HTMLElement) {
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
      return this.formatVerboseText(state.text);
    } else {
      return this.formatTerseText(state.text);
    }
  }

  private formatVerboseText(state: TextState): string {
    const verbose = new Array<string>();

    // Format main-axis values.
    verbose.push(state.mainLabel, Constant.IS);

    // Format for histogram.
    if (state.min !== undefined && state.max !== undefined) {
      verbose.push(String(state.min), Constant.THROUGH, String(state.max));
    } else {
      verbose.push(String(state.mainValue));
    }

    // Format cross-axis label.
    verbose.push(Constant.COMMA, state.crossLabel);

    // Format for boxplot.
    if (state.section !== undefined) {
      verbose.push(Constant.COMMA);

      if (Array.isArray(state.crossValue)) {
        verbose.push(String(state.crossValue.length), Constant.SPACE);
      }

      verbose.push(state.section);
    }

    // Format cross-axis values.
    if (!Array.isArray(state.crossValue)) {
      verbose.push(Constant.IS, String(state.crossValue));
    } else if (state.crossValue.length > 1) {
      verbose.push(Constant.ARE, state.crossValue.join(Constant.COMMA));
    } else if (state.crossValue.length > 0) {
      verbose.push(Constant.IS, state.crossValue.join(Constant.COMMA));
    }

    // Format for heatmap.
    if (state.fillLabel !== undefined && state.fillValue !== undefined) {
      verbose.push(
        Constant.COMMA,
        state.fillLabel,
        Constant.IS,
        state.fillValue,
      );
    }

    return verbose.join(Constant.EMPTY);
  }

  private formatTerseText(state: TextState): string {
    const terse = new Array<string>();
    terse.push(String(state.mainValue), Constant.COMMA);

    // Format for boxplot.
    if (state.section !== undefined) {
      if (Array.isArray(state.crossValue)) {
        terse.push(String(state.crossValue.length), Constant.SPACE);
      }

      terse.push(state.section);
    }

    // Format for heatmap and segmented plots.
    if (state.fillValue !== undefined) {
      terse.push(state.fillValue, Constant.COMMA);
    }

    // Format for cross axis values.
    if (!Array.isArray(state.crossValue)) {
      terse.push(Constant.IS, String(state.crossValue));
    } else if (state.crossValue.length > 1) {
      terse.push(Constant.ARE, state.crossValue.join(Constant.COMMA));
    } else if (state.crossValue.length > 0) {
      terse.push(Constant.IS, state.crossValue.join(Constant.COMMA));
    }

    return terse.join(Constant.EMPTY);
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
