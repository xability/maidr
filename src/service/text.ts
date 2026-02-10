import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { PlotState, TextState, TraceState } from '@type/state';
import type { AxisType, FormatterService } from './formatter';
import type { NotificationService } from './notification';
import { BoxplotSection } from '@type/boxplotSection';
import { Emitter } from '@type/event';
import { isLayerSwitchTraceState } from '@type/state';
import { Constant } from '@util/constant';

/**
 * Enumeration of available text output modes.
 */
enum TextMode {
  OFF = 'off',
  TERSE = 'terse',
  VERBOSE = 'verbose',
}

/**
 * Event emitted when text content changes.
 */
interface TextChangedEvent {
  value: string;
}

/**
 * Event emitted during text navigation actions.
 */
interface TextNavigationEvent {
  type: 'first_navigation';
}

/**
 * Service for managing text output and formatting of plot state information.
 */
export class TextService implements Observer<PlotState>, Disposable {
  private readonly notification: NotificationService;
  private readonly formatter?: FormatterService;

  private mode: TextMode;
  private currentState: PlotState | null = null;
  private currentSubplotIndex: number | null = null;
  private currentLayerId: string | null = null;
  private hasHadFirstNavigation: boolean = false;

  private readonly onChangeEmitter: Emitter<TextChangedEvent>;
  public readonly onChange: Event<TextChangedEvent>;

  private readonly onNavigationEmitter: Emitter<TextNavigationEvent>;
  public readonly onNavigation: Event<TextNavigationEvent>;

  /**
   * Constructs a TextService instance with notification support.
   * @param notification - The notification service for user alerts
   * @param formatter - Optional formatter service for custom value formatting
   */
  public constructor(notification: NotificationService, formatter?: FormatterService) {
    this.notification = notification;
    this.formatter = formatter;

    this.mode = TextMode.VERBOSE;

    this.onChangeEmitter = new Emitter<TextChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.onNavigationEmitter = new Emitter<TextNavigationEvent>();
    this.onNavigation = this.onNavigationEmitter.event;
  }

  /**
   * Disposes of event emitters and releases resources.
   */
  public dispose(): void {
    this.onChangeEmitter.dispose();
    this.onNavigationEmitter.dispose();
  }

  /**
   * Formats a single value using the formatter service if available.
   * Falls back to String() conversion if no formatter is configured.
   *
   * @param value - The value to format
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns Formatted string representation of the value
   */
  private formatSingleValue(value: number | string, axis: AxisType): string {
    if (this.formatter && this.currentLayerId) {
      return this.formatter.formatSingleValue(value, this.currentLayerId, axis);
    }
    return String(value);
  }

  /**
   * Formats an array of values using the formatter service if available.
   * Falls back to String() conversion for each element if no formatter is configured.
   *
   * @param values - The array of values to format
   * @param axis - The axis type ('x', 'y', or 'fill')
   * @returns Array of formatted strings
   */
  private formatArrayValue(values: (number | string)[], axis: AxisType): string[] {
    if (this.formatter && this.currentLayerId) {
      return this.formatter.formatArrayValue(values, this.currentLayerId, axis);
    }
    return values.map(v => String(v));
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

  /**
   * Formats coordinate information from trace state into readable text.
   * @param traceState - The trace state containing coordinate data
   * @returns Formatted coordinate text or null if unavailable
   */
  private formatCoordinateText(traceState: TraceState): string | null {
    if (traceState.empty || !traceState.text) {
      return null;
    }

    // Set currentLayerId for formatting
    this.currentLayerId = traceState.layerId;

    const { text } = traceState;
    const parts: string[] = [];

    // Use axis identity from TextState, fallback to default mapping
    const mainAxisType = text.mainAxis ?? 'x';
    const crossAxisType = text.crossAxis ?? 'y';

    // Add main coordinate (x for vertical, y for horizontal)
    if (text.main && text.main.value !== undefined) {
      const mainValue = Array.isArray(text.main.value)
        ? this.formatArrayValue(text.main.value as (number | string)[], mainAxisType).join(', ')
        : this.formatSingleValue(text.main.value as number | string, mainAxisType);
      parts.push(`${text.main.label} is ${mainValue}`);
    }

    // Add cross coordinate (y for vertical, x for horizontal)
    if (text.cross && text.cross.value !== undefined) {
      const crossValue = Array.isArray(text.cross.value)
        ? this.formatArrayValue(text.cross.value as (number | string)[], crossAxisType).join(', ')
        : this.formatSingleValue(text.cross.value as number | string, crossAxisType);
      parts.push(`${text.cross.label} is ${crossValue}`);
    }

    // Add fill/type information (for line plots this includes group/type like "MAV=3")
    if (text.fill && text.fill.value !== undefined) {
      parts.push(`${text.fill.label} is ${text.fill.value}`);
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Formats a layer switch announcement from trace state.
   * @param state - The trace state representing the new layer
   * @returns Formatted announcement text for the layer switch
   */
  private formatLayerSwitchAnnouncement(state: TraceState): string {
    if (!isLayerSwitchTraceState(state))
      return '';

    // Set currentLayerId for formatting
    this.currentLayerId = state.layerId;

    let announcement = `Layer ${state.index} of ${state.size}: ${state.plotType || state.traceType} plot`;
    if (state.text) {
      const parts: string[] = [];

      // Use axis identity from TextState, fallback to default mapping
      const mainAxisType = state.text.mainAxis ?? 'x';
      const crossAxisType = state.text.crossAxis ?? 'y';

      if (state.text.main && state.text.main.value !== undefined) {
        const mainValue = Array.isArray(state.text.main.value)
          ? this.formatArrayValue(state.text.main.value as (number | string)[], mainAxisType).join(', ')
          : this.formatSingleValue(state.text.main.value as number | string, mainAxisType);
        parts.push(`${state.text.main.label} is ${mainValue}`);
      }
      // Exclude cross value for violin box plots during layer switch
      // Violin plots are uniquely identified by having exactly 2 layers: BOX + SMOOTH (KDE)
      // Detection heuristic: box plot (traceType === 'box') with exactly 2 layers (size === 2)
      //
      // Note: This is a structural detection heuristic. While it works well in practice because:
      // - Regular box plots typically have only 1 layer
      // - Regular smooth plots (regression lines) typically have only 1 layer
      // - Violin plots are the only plot type that combines BOX + SMOOTH in the same subplot
      // Edge case: If a subplot intentionally combines an independent box plot and regression line,
      // this would incorrectly exclude the cross value. This is rare in practice.
      const isViolinBoxPlot = state.traceType === 'box' && state.size === 2;
      if (!isViolinBoxPlot && state.text.cross && state.text.cross.value !== undefined) {
        const crossValue = Array.isArray(state.text.cross.value)
          ? this.formatArrayValue(state.text.cross.value as (number | string)[], crossAxisType).join(', ')
          : this.formatSingleValue(state.text.cross.value as number | string, crossAxisType);
        parts.push(`${state.text.cross.label} is ${crossValue}`);
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

  /**
   * Formats plot state into human-readable text based on current mode.
   * @param state - The state to format (string or PlotState object)
   * @returns Formatted text representation of the state
   */
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

  /**
   * Formats figure-level text with subplot information.
   * @param index - Current subplot index
   * @param size - Total number of subplots
   * @param traceTypes - Array of trace type names in the figure
   * @returns Formatted figure description text
   */
  private formatFigureText(index: number, size: number, traceTypes: string[]): string {
    const details = traceTypes.length === 1
      ? `This is a ${traceTypes[0]} plot`
      : `This is a multi-layered plot containing ${traceTypes.join(Constant.COMMA_SPACE)} plots`;
    return `Subplot ${index} of ${size}: ${details}. Press 'ENTER' to select this subplot.`;
  }

  /**
   * Formats subplot-level text with layer information.
   * @param index - Current layer index
   * @param size - Total number of layers
   * @param traceType - The type of trace being displayed
   * @param traceState - Optional trace state for additional context
   * @returns Formatted subplot description text
   */
  private formatSubplotText(index: number, size: number, traceType: string, traceState?: TraceState): string {
    // Use plotType if available, otherwise fall back to traceType
    const type = traceState && !traceState.empty ? traceState.plotType : traceType;
    return `Layer ${index} of ${size}: ${type} plot`;
  }

  /**
   * Determines if the current state represents a box plot.
   * @param state - The text state to check
   * @returns True if state has sections but no fill (indicating a box plot)
   */
  private isBoxPlotWithSection(state: TextState): boolean {
    return state.section !== undefined && state.fill === undefined;
  }

  /**
   * Formats trace text in verbose mode with full descriptions.
   * @param state - The text state to format
   * @returns Verbose formatted text with complete coordinate information
   */
  private formatVerboseTraceText(state: TextState): string {
    const verbose = new Array<string>();

    // Use axis identity from TextState, fallback to default mapping
    const mainAxisType = state.mainAxis ?? 'x';
    const crossAxisType = state.crossAxis ?? 'y';

    // Format main-axis values.
    verbose.push(state.main.label, Constant.IS);

    // Format for histogram and scatter plot.
    if (state.range !== undefined) {
      verbose.push(
        this.formatSingleValue(state.range.min, mainAxisType),
        Constant.THROUGH,
        this.formatSingleValue(state.range.max, mainAxisType),
      );
    } else if (Array.isArray(state.main.value)) {
      verbose.push(this.formatArrayValue(state.main.value as (number | string)[], mainAxisType).join(Constant.COMMA_SPACE));
    } else {
      verbose.push(this.formatSingleValue(state.main.value as number | string, mainAxisType));
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
      const outliers = state.cross.value as (number | string)[];
      const formattedOutliers = this.formatArrayValue(outliers, crossAxisType);
      const outlierStr = `[${formattedOutliers.join(', ')}]`;
      const formattedMainValue = this.formatSingleValue(state.main.value as number | string, mainAxisType);
      if (outliers.length === 0) {
        // No outliers
        return `${state.main.label} is ${formattedMainValue}, no ${state.section.toLowerCase()} for ${label}`;
      } else {
        // Outlier values present
        const verb = outliers.length === 1 ? 'is' : 'are';
        return `${state.main.label} is ${formattedMainValue}, ${state.section.toLowerCase()} for ${label} ${verb} ${outlierStr}`;
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
      verbose.push(Constant.IS, this.formatSingleValue(state.cross.value as number | string, crossAxisType));
    } else if (state.cross.value.length > 1) {
      verbose.push(Constant.ARE, this.formatArrayValue(state.cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE));
    } else if (state.cross.value.length > 0) {
      verbose.push(Constant.IS, this.formatArrayValue(state.cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE));
    }

    // Format for heatmap and scatter plot.
    if (state.fill !== undefined) {
      // Convert candlestick trend values to lowercase for text mode
      let fillValue: string;
      if (state.fill.value === 'Bull' || state.fill.value === 'Bear') {
        fillValue = state.fill.value.toLowerCase();
      } else {
        fillValue = this.formatSingleValue(state.fill.value as number | string, 'fill');
      }

      verbose.push(
        Constant.COMMA_SPACE,
        state.fill.label,
        Constant.IS,
        fillValue,
      );
    }

    return verbose.join(Constant.EMPTY);
  }

  /**
   * Formats trace text in terse mode with minimal output.
   * @param state - The text state to format
   * @returns Terse formatted text with compact coordinate representation
   */
  private formatTerseTraceText(state: TextState): string {
    const terse = new Array<string>();

    // Use axis identity from state (supports orientation-aware formatting)
    const mainAxisType = state.mainAxis ?? 'x';
    const crossAxisType = state.crossAxis ?? 'y';

    if (Array.isArray(state.main.value)) {
      terse.push(Constant.OPEN_BRACKET, this.formatArrayValue(state.main.value as (number | string)[], mainAxisType).join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
    } else {
      terse.push(this.formatSingleValue(state.main.value as number | string, mainAxisType), Constant.COMMA_SPACE);
    }

    // Special handling for boxplot outlier sections
    if (
      state.section
      && this.isBoxPlotWithSection(state)
      && (state.section === BoxplotSection.UPPER_OUTLIER || state.section === BoxplotSection.LOWER_OUTLIER)
      && Array.isArray(state.cross.value)
    ) {
      const outliers = state.cross.value as (number | string)[];
      const formattedOutliers = this.formatArrayValue(outliers, crossAxisType);
      const outlierStr = `[${formattedOutliers.join(', ')}]`;
      const formattedMainValue = this.formatSingleValue(state.main.value as number | string, mainAxisType);
      if (outliers.length === 0) {
        return `${formattedMainValue}, no ${state.section.toLowerCase()}`;
      } else {
        return `${formattedMainValue}, ${outliers.length} ${state.section.toLowerCase()} ${outlierStr}`;
      }
    }

    // Format for cross axis values.
    // For candlestick plots, we show section (type) first, then cross.value (price)
    // For box plots, we also show section (type) first, then cross.value
    if (state.section !== undefined && state.fill !== undefined) {
      // For candlestick: show section (type) first, then cross.value (price)
      terse.push(state.section!, Constant.SPACE);
      if (!Array.isArray(state.cross.value)) {
        terse.push(this.formatSingleValue(state.cross.value as number | string, crossAxisType));
      } else {
        terse.push(Constant.OPEN_BRACKET, this.formatArrayValue(state.cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    } else if (state.section !== undefined && state.fill === undefined) {
      // For box plots: show section (type) first, then cross.value
      terse.push(state.section!, Constant.SPACE);
      if (!Array.isArray(state.cross.value)) {
        terse.push(this.formatSingleValue(state.cross.value as number | string, crossAxisType));
      } else {
        terse.push(Constant.OPEN_BRACKET, this.formatArrayValue(state.cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    } else {
      // For other plots: show cross.value normally
      if (!Array.isArray(state.cross.value)) {
        terse.push(this.formatSingleValue(state.cross.value as number | string, crossAxisType));
      } else {
        terse.push(Constant.OPEN_BRACKET, this.formatArrayValue(state.cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    }

    // Format for heatmap and segmented plots.
    if (state.fill !== undefined) {
      // Convert candlestick trend values to lowercase for text mode
      let fillValue: string;
      if (state.fill.value === 'Bull' || state.fill.value === 'Bear') {
        fillValue = state.fill.value.toLowerCase();
      } else {
        fillValue = this.formatSingleValue(state.fill.value as number | string, 'fill');
      }

      // For candlestick plots, add comma before trend value to show "open 100, bear"
      if (state.section !== undefined) {
        terse.push(Constant.COMMA_SPACE, fillValue);
      } else {
        terse.push(Constant.COMMA_SPACE, fillValue);
      }
    }

    return terse.join(Constant.EMPTY);
  }

  /**
   * Updates the service with new plot state and emits appropriate events.
   * @param state - The new plot state to process
   */
  public update(state: PlotState): void {
    if (this.mode === TextMode.OFF) {
      return;
    }

    // Store the current state for access by ViewModels
    this.currentState = state;

    // Track current layer ID for formatting
    if (state.type === 'trace' && !state.empty) {
      this.currentLayerId = state.layerId;
    } else if (state.type === 'subplot' && !state.empty && !state.trace.empty) {
      this.currentLayerId = state.trace.layerId;
    }

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

  /**
   * Toggles between text modes (OFF, TERSE, VERBOSE) in sequence.
   * @returns True if text mode is now active (not OFF), false otherwise
   */
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

  /**
   * Checks if the text service is in verbose mode.
   * @returns True if text mode is set to verbose, false otherwise
   */
  public isVerbose(): boolean {
    return this.mode === TextMode.VERBOSE;
  }

  /**
   * Checks if the text service is in terse mode.
   * @returns True if text mode is set to terse, false otherwise
   */
  public isTerse(): boolean {
    return this.mode === TextMode.TERSE;
  }

  /**
   * Checks if the text service is turned off.
   * @returns True if text mode is set to off, false otherwise
   */
  public isOff(): boolean {
    return this.mode === TextMode.OFF;
  }
}
