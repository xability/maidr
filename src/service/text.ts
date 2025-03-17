import type { Observer } from '@type/observable';
import type { PlotState, TextState } from '@type/state';
import type { NotificationService } from './notification';
import { Constant } from '@util/constant';

enum TextMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

export class TextService implements Observer<string | PlotState> {
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
      return `No ${state.type === 'trace' ? 'plot' : state.type} info to display`;
    } else if (state.type === 'figure') {
      return this.formatFigureText(state.index, state.size, state.traceTypes);
    } else if (state.type === 'subplot') {
      return this.formatSubplotText(state.index, state.size, state.traceType);
    } else if (this.mode === TextMode.VERBOSE) {
      return this.formatVerboseTraceText(state.text);
    } else {
      return this.formatTerseTraceText(state.text);
    }
  }

  private formatFigureText(index: number, size: number, traceTypes: string[]): string {
    const details = traceTypes.length === 1
      ? `This is a ${traceTypes[0]} plot`
      : `This is a multi-layered plot containing ${traceTypes.join(Constant.COMMA)} plots`;
    return `Subplot ${index} of ${size}: ${details}`;
  }

  private formatSubplotText(index: number, size: number, traceType: string): string {
    return `Layer ${index} of ${size}: ${traceType} plot`;
  }

  private formatVerboseTraceText(state: TextState): string {
    const verbose = new Array<string>();

    // Format main-axis values.
    verbose.push(state.main.label, Constant.IS);

    // Format for histogram and scatter plot.
    if (state.range !== undefined) {
      verbose.push(String(state.range.min), Constant.THROUGH, String(state.range.max));
    } else if (Array.isArray(state.main.value)) {
      verbose.push(state.main.value.join(Constant.COMMA));
    } else {
      verbose.push(String(state.main.value));
    }

    // Format cross-axis label.
    verbose.push(Constant.COMMA, state.cross.label);

    // Format for box plot.
    if (state.section !== undefined) {
      verbose.push(Constant.COMMA);

      if (Array.isArray(state.cross.value)) {
        verbose.push(String(state.cross.value.length), Constant.SPACE);
      }

      verbose.push(state.section);
    }

    // Format cross-axis values.
    if (!Array.isArray(state.cross.value)) {
      verbose.push(Constant.IS, String(state.cross.value));
    } else if (state.cross.value.length > 1) {
      verbose.push(Constant.ARE, state.cross.value.join(Constant.COMMA));
    } else if (state.cross.value.length > 0) {
      verbose.push(Constant.IS, state.cross.value.join(Constant.COMMA));
    }

    // Format for heatmap and scatter plot.
    if (state.fill !== undefined) {
      verbose.push(
        Constant.COMMA,
        state.fill.label,
        Constant.IS,
        state.fill.value,
      );
    }

    return verbose.join(Constant.EMPTY);
  }

  private formatTerseTraceText(state: TextState): string {
    const terse = new Array<string>();

    if (Array.isArray(state.main.value)) {
      terse.push(state.main.value.join(Constant.COMMA));
    } else {
      terse.push(String(state.main.value), Constant.COMMA);
    }

    // Format for box plot.
    if (state.section !== undefined) {
      if (Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value.length), Constant.SPACE);
      }

      terse.push(state.section);
    }

    // Format for heatmap and segmented plots.
    if (state.fill !== undefined) {
      terse.push(state.fill.value, Constant.COMMA);
    }

    // Format for cross axis values.
    if (!Array.isArray(state.cross.value)) {
      terse.push(Constant.IS, String(state.cross.value));
    } else if (state.cross.value.length > 1) {
      terse.push(Constant.ARE, state.cross.value.join(Constant.COMMA));
    } else if (state.cross.value.length > 0) {
      terse.push(Constant.IS, state.cross.value.join(Constant.COMMA));
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
