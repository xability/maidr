import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { PlotState, TextState } from '@type/state';
import type { NotificationService } from './notification';
import { Emitter } from '@type/event';
import { Constant } from '@util/constant';

enum TextMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

interface TextChangedEvent {
  value: string;
}

export class TextService implements Observer<PlotState>, Disposable {
  private readonly notification: NotificationService;
  private mode: TextMode;

  private readonly onChangeEmitter: Emitter<TextChangedEvent>;
  public readonly onChange: Event<TextChangedEvent>;

  public constructor(notification: NotificationService) {
    this.notification = notification;
    this.mode = TextMode.VERBOSE;

    this.onChangeEmitter = new Emitter<TextChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public format(state: string | PlotState): string {
    if (typeof state === 'string') {
      return state;
    } else if (!state || state.empty) {
      return `No ${state.type === 'trace' ? 'plot' : state.type} info to display`;
    } else if (state.type === 'figure') {
      return this.formatFigureText(state.index, state.size, state.traceTypes);
    } else if (state.type === 'subplot') {
      return this.formatSubplotText(state.index, state.size, state.trace.traceType);
    } else if (this.mode === TextMode.VERBOSE) {
      return this.formatVerboseTraceText(state.text);
    } else {
      return this.formatTerseTraceText(state.text);
    }
  }

  private formatFigureText(index: number, size: number, traceTypes: string[]): string {
    const details = traceTypes.length === 1
      ? `This is a ${traceTypes[0]} plot`
      : `This is a multi-layered plot containing ${traceTypes.join(Constant.COMMA_SPACE)} plots`;
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
      verbose.push(state.main.value.join(Constant.COMMA_SPACE));
    } else {
      verbose.push(String(state.main.value));
    }

    // Format cross-axis label.
    verbose.push(Constant.COMMA_SPACE, state.cross.label);

    // Format for box plot.
    if (state.section !== undefined) {
      verbose.push(Constant.COMMA_SPACE);

      if (Array.isArray(state.cross.value)) {
        verbose.push(String(state.cross.value.length), Constant.SPACE);
      }

      verbose.push(state.section);
    }

    // Format cross-axis values.
    if (!Array.isArray(state.cross.value)) {
      verbose.push(Constant.IS, String(state.cross.value));
    } else if (state.cross.value.length > 1) {
      verbose.push(Constant.ARE, state.cross.value.join(Constant.COMMA_SPACE));
    } else if (state.cross.value.length > 0) {
      verbose.push(Constant.IS, state.cross.value.join(Constant.COMMA_SPACE));
    }

    // Format for heatmap and scatter plot.
    if (state.fill !== undefined) {
      verbose.push(
        Constant.COMMA_SPACE,
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
      terse.push(state.main.value.join(Constant.COMMA_SPACE));
    } else {
      terse.push(String(state.main.value), Constant.COMMA_SPACE);
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
      terse.push(state.fill.value, Constant.COMMA_SPACE);
    }

    // Format for cross axis values.
    if (!Array.isArray(state.cross.value)) {
      terse.push(Constant.IS, String(state.cross.value));
    } else if (state.cross.value.length > 1) {
      terse.push(Constant.ARE, state.cross.value.join(Constant.COMMA_SPACE));
    } else if (state.cross.value.length > 0) {
      terse.push(Constant.IS, state.cross.value.join(Constant.COMMA_SPACE));
    }

    return terse.join(Constant.EMPTY);
  }

  public update(state: PlotState): void {
    // Show text only if turned on.
    if (this.mode === TextMode.OFF) {
      return;
    }

    // Format the text based on the display mode.
    const text = this.format(state);
    if (text) {
      this.onChangeEmitter.fire({ value: text });
    }
  }

  public toggle(): boolean {
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

    const message = `Text mode is ${this.mode}`;
    this.notification.notify(message);

    return this.mode !== TextMode.OFF;
  }
}
