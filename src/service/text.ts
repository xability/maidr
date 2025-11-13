import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { PlotState, TextState, TraceState } from '@type/state';
import type { NotificationService } from './notification';
import { BoxplotSection } from '@type/boxplotSection';
import { Emitter } from '@type/event';
import { isLayerSwitchTraceState } from '@type/state';
import { Constant } from '@util/constant';

enum TextMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

interface TextChangedEvent {
  value: string;
}

interface TextNavigationEvent {
  type: 'first_navigation';
}

export class TextService implements Observer<PlotState>, Disposable {
  private readonly notification: NotificationService;

  private mode: TextMode;
  private currentState: PlotState | null = null;
  private currentSubplotIndex: number | null = null;
  private hasHadFirstNavigation: boolean = false;

  private readonly onChangeEmitter: Emitter<TextChangedEvent>;
  public readonly onChange: Event<TextChangedEvent>;

  private readonly onNavigationEmitter: Emitter<TextNavigationEvent>;
  public readonly onNavigation: Event<TextNavigationEvent>;

  public constructor(notification: NotificationService) {
    this.notification = notification;

    this.mode = TextMode.VERBOSE;

    this.onChangeEmitter = new Emitter<TextChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.onNavigationEmitter = new Emitter<TextNavigationEvent>();
    this.onNavigation = this.onNavigationEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
    this.onNavigationEmitter.dispose();
  }

  /**
   * Get the current state that was last processed by the TextService
   * This provides access to state information without violating dependency flow
   */
  public getCurrentState(): PlotState | null {
    return this.currentState;
  }

  /**
   * Get coordinate information from the current state
   * Returns null if no valid state is available
   */
  public getCoordinateText(): string | null {
    if (!this.currentState || this.currentState.empty) {
      return null;
    }

    // Handle different state types
    if (this.currentState.type === 'subplot' && !this.currentState.trace.empty) {
      return this.formatCoordinateText(this.currentState.trace);
    } else if (this.currentState.type === 'trace' && !this.currentState.empty) {
      return this.formatCoordinateText(this.currentState);
    }

    return null;
  }

  /**
   * Check if the current state represents a layer switch
   * Returns true if the subplot index has changed
   */
  public isLayerSwitch(): boolean {
    if (!this.currentState || this.currentState.empty || this.currentState.type !== 'subplot') {
      return false;
    }

    const newSubplotIndex = this.currentState.index;

    if (this.currentSubplotIndex !== null && this.currentSubplotIndex !== newSubplotIndex) {
      // Layer switch detected - subplot index changed
      this.currentSubplotIndex = newSubplotIndex;
      return true;
    } else if (this.currentSubplotIndex === null) {
      // First time setting the subplot index
      this.currentSubplotIndex = newSubplotIndex;
      // If this is not the first layer (index 0), treat it as a layer switch
      return newSubplotIndex !== 0;
    }

    return false;
  }

  /**
   * Check if the first navigation has occurred
   * Returns true if the user has navigated at least once
   */
  public getHasHadFirstNavigation(): boolean {
    return this.hasHadFirstNavigation;
  }

  /**
   * Enable announcements after first navigation
   * This method can be called externally to enable announcements
   */
  public enableAnnouncements(): void {
    this.onNavigationEmitter.fire({ type: 'first_navigation' });
  }

  private formatCoordinateText(traceState: TraceState): string | null {
    if (traceState.empty || !traceState.text) {
      return null;
    }

    const { text } = traceState;
    const parts: string[] = [];

    // Add X coordinate
    if (text.main && text.main.value !== undefined) {
      const xValue = Array.isArray(text.main.value)
        ? text.main.value.join(', ')
        : String(text.main.value);
      parts.push(`${text.main.label} is ${xValue}`);
    }

    // Add Y coordinate
    if (text.cross && text.cross.value !== undefined) {
      const yValue = Array.isArray(text.cross.value)
        ? text.cross.value.join(', ')
        : String(text.cross.value);
      parts.push(`${text.cross.label} is ${yValue}`);
    }

    // Add fill/type information (for line plots this includes group/type like "MAV=3")
    if (text.fill && text.fill.value !== undefined) {
      parts.push(`${text.fill.label} is ${text.fill.value}`);
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  private formatLayerSwitchAnnouncement(state: TraceState): string {
    if (!isLayerSwitchTraceState(state))
      return '';
    let announcement = `Layer ${state.index} of ${state.size}: ${state.plotType || state.traceType} plot`;
    if (state.text) {
      const parts: string[] = [];
      if (state.text.main && state.text.main.value !== undefined) {
        parts.push(`${state.text.main.label} is ${state.text.main.value}`);
      }
      if (state.text.cross && state.text.cross.value !== undefined) {
        parts.push(`${state.text.cross.label} is ${state.text.cross.value}`);
      }
      if (state.text.fill && state.text.fill.value !== undefined) {
        parts.push(`${state.text.fill.label} is ${state.text.fill.value}`);
      }
      if (parts.length > 0) {
        announcement += ` at ${parts.join(', ')}`;
      }
    }
    return announcement;
  }

  public format(state: string | PlotState): string {
    if (typeof state === 'string') {
      return state;
    } else if (!state || state.empty) {
      if (state.type === 'subplot') {
        return 'No additional layer';
      }
      return `No ${state.type === 'trace' ? 'plot' : state.type} info to display`;
    } else if (state.type === 'figure') {
      return this.formatFigureText(state.index, state.size, state.traceTypes);
    } else if (state.type === 'subplot') {
      return this.formatSubplotText(state.index, state.size, state.trace.traceType, state.trace);
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

  private formatSubplotText(index: number, size: number, traceType: string, traceState?: TraceState): string {
    // Use plotType if available, otherwise fall back to traceType
    const type = traceState && !traceState.empty ? traceState.plotType : traceType;
    return `Layer ${index} of ${size}: ${type} plot`;
  }

  /**
   * Helper method to determine if the current state represents a box plot
   * Box plots have sections but no fill information
   */
  private isBoxPlotWithSection(state: TextState): boolean {
    return state.section !== undefined && state.fill === undefined;
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

    // Special handling for boxplot outlier sections
    if (
      state.section
      && this.isBoxPlotWithSection(state)
      && (state.section === BoxplotSection.UPPER_OUTLIER || state.section === BoxplotSection.LOWER_OUTLIER)
      && Array.isArray(state.cross.value)
    ) {
      // e.g. 'upper outlier(s)' or 'lower outlier(s)' section
      const label = state.cross.label;
      const outliers = state.cross.value;
      const outlierStr = `[${outliers.join(', ')}]`;
      if (outliers.length === 0) {
        // No outliers
        return `${state.main.label} is ${state.main.value}, no ${state.section.toLowerCase()} for ${label}`;
      } else {
        // Outlier values present
        const verb = outliers.length === 1 ? 'is' : 'are';
        return `${state.main.label} is ${state.main.value}, ${state.section.toLowerCase()} for ${label} ${verb} ${outlierStr}`;
      }
    }

    // Format cross-axis label.
    if (state.section !== undefined) {
      if (this.isBoxPlotWithSection(state)) {
        const label = state.cross.label;
        verbose.push(Constant.COMMA_SPACE, state.section!.toLowerCase(), Constant.SPACE, label);
      } else {
        // For candlestick plots: "section cross.label" (e.g., "high Price")
        verbose.push(Constant.COMMA_SPACE, state.section!, Constant.SPACE, state.cross.label);
      }
    } else {
      verbose.push(Constant.COMMA_SPACE, state.cross.label);
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
      // Convert candlestick trend values to lowercase for text mode
      const fillValue = (state.fill.value === 'Bull' || state.fill.value === 'Bear')
        ? state.fill.value.toLowerCase()
        : state.fill.value;

      verbose.push(
        Constant.COMMA_SPACE,
        state.fill.label,
        Constant.IS,
        fillValue,
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

    // Special handling for boxplot outlier sections
    if (
      state.section
      && this.isBoxPlotWithSection(state)
      && (state.section === BoxplotSection.UPPER_OUTLIER || state.section === BoxplotSection.LOWER_OUTLIER)
      && Array.isArray(state.cross.value)
    ) {
      const outliers = state.cross.value;
      const outlierStr = `[${outliers.join(', ')}]`;
      if (outliers.length === 0) {
        return `${state.main.value}, no ${state.section.toLowerCase()}`;
      } else {
        return `${state.main.value}, ${outliers.length} ${state.section.toLowerCase()} ${outlierStr}`;
      }
    }

    // Format for cross axis values (y-axis).
    // For candlestick plots, we show section (type) first, then cross.value (price)
    // For box plots, we also show section (type) first, then cross.value
    if (state.section !== undefined && state.fill !== undefined) {
      // For candlestick: show section (type) first, then cross.value (price)
      terse.push(state.section!, Constant.SPACE);
      if (!Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value));
      } else {
        terse.push(Constant.OPEN_BRACKET, state.cross.value.join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    } else if (state.section !== undefined && state.fill === undefined) {
      // For box plots: show section (type) first, then cross.value
      terse.push(state.section!, Constant.SPACE);
      if (!Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value));
      } else {
        terse.push(Constant.OPEN_BRACKET, state.cross.value.join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    } else {
      // For other plots: show cross.value normally
      if (!Array.isArray(state.cross.value)) {
        terse.push(String(state.cross.value));
      } else {
        terse.push(Constant.OPEN_BRACKET, state.cross.value.join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    }

    // Format for heatmap and segmented plots.
    if (state.fill !== undefined) {
      // Convert candlestick trend values to lowercase for text mode
      const fillValue = (state.fill.value === 'Bull' || state.fill.value === 'Bear')
        ? state.fill.value.toLowerCase()
        : state.fill.value;

      // For candlestick plots, add comma before trend value to show "open 100, bear"
      if (state.section !== undefined) {
        terse.push(Constant.COMMA_SPACE, fillValue);
      } else {
        terse.push(Constant.COMMA_SPACE, fillValue);
      }
    }

    return terse.join(Constant.EMPTY);
  }

  public update(state: PlotState): void {
    if (this.mode === TextMode.OFF) {
      return;
    }

    // Store the current state for access by ViewModels
    this.currentState = state;

    // Use the type guard and formatter for layer switches
    if (state.type === 'trace' && isLayerSwitchTraceState(state)) {
      const announcement = this.formatLayerSwitchAnnouncement(state);
      this.notification.notify(announcement);
      return;
    }

    if (state.type === 'subplot') {
      const text = this.format(state);
      if (text) {
        this.notification.notify(text);
      }
      return;
    }

    // Handle figure-level navigation - this is the first navigation in multi-panel plots
    if (state.type === 'figure' && !state.empty && !this.hasHadFirstNavigation) {
      this.hasHadFirstNavigation = true;
      this.onNavigationEmitter.fire({ type: 'first_navigation' });
    }

    const text = this.format(state);
    if (text) {
      this.onChangeEmitter.fire({ value: text });
    }
  }

  public isVerbose(): boolean {
    return this.mode === TextMode.VERBOSE;
  }

  public isTerse(): boolean {
    return this.mode === TextMode.TERSE;
  }

  public isOff(): boolean {
    return this.mode === TextMode.OFF;
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
