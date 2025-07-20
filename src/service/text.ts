import type { Context } from '@model/context';
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

  public constructor(notification: NotificationService, context?: Context) {
    this.notification = notification;

    this.mode = TextMode.VERBOSE;

    this.onChangeEmitter = new Emitter<TextChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    // Subscribe to layer switch event from context
    context?.onLayerSwitch((prev: PlotState | null, curr: PlotState) => {
      if (curr.type === 'subplot' && !curr.empty) {
        const { index, size, trace } = curr;
        const traceType = trace.traceType;
        // Only announce values if previous state and size > 1
        if (this.shouldAnnounceWithCoordinates(prev, size)) {
          const layerText = this.formatSubplotText(index, size, traceType);
          let pointText = '';
          if (trace && !trace.empty && trace.text) {
            const text = trace.text;
            const parts: string[] = [];
            if (text.main && text.main.value !== undefined) {
              parts.push(`${text.main.label} is ${Array.isArray(text.main.value) ? text.main.value.join(', ') : text.main.value}`);
            }
            if (text.cross && text.cross.value !== undefined) {
              parts.push(`${text.cross.label} is ${Array.isArray(text.cross.value) ? text.cross.value.join(', ') : text.cross.value}`);
            }
            if (text.fill && text.fill.value !== undefined) {
              parts.push(`${text.fill.label} is ${text.fill.value}`);
            }
            if (parts.length > 0) {
              pointText = parts.join(', ');
            }
          }
          const announcement = pointText ? `${layerText} at ${pointText}` : layerText;
          this.notification.notify(announcement);
        } else {
          // First entry or single layer: just announce the layer
          const text = this.formatSubplotText(index, size, traceType);
          this.notification.notify(text);
        }
      }
    });
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
    return `Subplot ${index} of ${size}: ${details}. Press 'ENTER' to select this subplot.`;
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
      terse.push(Constant.OPEN_BRACKET, state.main.value.join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
    } else {
      terse.push(String(state.main.value), Constant.COMMA_SPACE);
    }

    // Format for cross axis values (y-axis).
    // For candlestick plots, we show both cross.value (price) and section (type)
    if (state.section !== undefined && state.fill !== undefined) {
      // For candlestick: show cross.value (price) first, then section (type)
      if (!Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value), Constant.COMMA_SPACE, state.section);
      } else {
        terse.push(Constant.OPEN_BRACKET, state.cross.value.join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET, Constant.COMMA_SPACE, state.section);
      }
    } else {
      // For other plots: show cross.value normally
      if (!Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value));
      } else {
        terse.push(Constant.OPEN_BRACKET, state.cross.value.join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    }

    // Format for box plot (type) - only if section exists but no fill (not candlestick)
    if (state.section !== undefined && state.fill === undefined) {
      terse.push(Constant.COMMA_SPACE);
      if (Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value.length), Constant.SPACE);
      }
      terse.push(state.section);
    }

    // Format for heatmap and segmented plots.
    if (state.fill !== undefined) {
      // For candlestick plots, don't add comma before fill value to show "open bear" instead of "open, bear"
      if (state.section !== undefined) {
        terse.push(Constant.SPACE, state.fill.value);
      } else {
        terse.push(Constant.COMMA_SPACE, state.fill.value);
      }
    }

    return terse.join(Constant.EMPTY);
  }

  public update(state: PlotState): void {
    if (this.mode === TextMode.OFF) {
      return;
    }
    if (state.type === 'subplot' && !state.empty) {
      const text = this.format(state);
      if (text) {
        this.notification.notify(text);
      }
      return;
    }
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

  private shouldAnnounceWithCoordinates(prev: PlotState | null, size: number): boolean {
    return !!(prev && prev.type === 'subplot' && !prev.empty && size > 1);
  }
}
