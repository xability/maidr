import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { NonEmptyTraceState, PlotState, TextState, TraceState } from '@type/state';
import type { AxisType, FormatterService } from './formatter';
import type { NotificationService } from './notification';
import { focusedSubplotTitle } from '@model/plot';
import { Emitter } from '@type/event';
import { isLayerSwitchTraceState } from '@type/state';
import { Constant } from '@util/constant';
import { t } from '@util/i18n';

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
   * A gap arrives here as whatever sentinel the wire carried: the `null` a
   * producer emits for a slot it has no measurement for, or the `NaN` the bar
   * and pie models normalize that to. Neither is a value to read out, so both
   * are named the way `AbstractBarPlot.rangeStats` and `PieTrace` already name
   * an absent value. Doing it here rather than per trace means every trace with
   * gap support says the same word, and says it whether or not a formatter is
   * wired up — `FormatUtil.wrapFormat` catches a `null` or a `NaN` only for a
   * layer the formatter service actually has an entry for, and never catches an
   * infinity.
   *
   * Only an absent NUMBER is caught. A measured `0` is a real reading and an
   * empty category label is a label, so both go on to be formatted as usual.
   *
   * @param value - The value to format, absent when the point is a gap
   * @param axis - The axis type ('x', 'y', or 'z')
   * @returns Formatted string representation of the value
   */
  private formatSingleValue(value: number | string | null | undefined, axis: AxisType): string {
    if (value === null || value === undefined) {
      return t('common.missing');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return t('common.missing');
    }
    if (this.formatter && this.currentLayerId) {
      return this.formatter.formatSingleValue(value, this.currentLayerId, axis);
    }
    return String(value);
  }

  /**
   * Formats an array of values, one element at a time.
   *
   * Each element goes through {@link formatSingleValue} rather than through
   * the formatter's own array method. The two are the same operation —
   * `FormatterService.formatArrayValue` is a per-element map over the very
   * formatter `formatSingleValue` looks up — so delegating costs nothing and
   * means the two cannot drift: an absent element reads as "missing" here
   * for the same reason it does anywhere else, rather than because this
   * method remembered to say so.
   *
   * @param values - The array of values to format, elements absent on a gap
   * @param axis - The axis type ('x', 'y', or 'z')
   * @returns Array of formatted strings
   */
  private formatArrayValue(
    values: (number | string | null | undefined)[],
    axis: AxisType,
  ): string[] {
    return values.map(value => this.formatSingleValue(value, axis));
  }

  /**
   * Formats the third value a trace carries: the heatmap's cell value, the
   * segmented bar's level, the candlestick's trend, the pie's percentage.
   *
   * A candlestick's trend is a word rather than a measurement. The model
   * carries it capitalised because the audio palette keys off it, and text
   * mode reads it lower case -- which was done by lower-casing the string
   * itself, an operation that only produces the right word in English. It is
   * looked up instead. Any other z value is a reading and is formatted.
   *
   * @param value - The z reading from the text state
   * @returns The formatted value
   */
  private formatZValue(value: number | number[] | string): string {
    if (value === 'Bull') {
      return t('text.trendBull');
    }
    if (value === 'Bear') {
      return t('text.trendBear');
    }
    if (value === 'Neutral') {
      return t('text.trendNeutral');
    }
    if (Array.isArray(value)) {
      return this.formatArrayValue(value, 'z').join(Constant.COMMA_SPACE);
    }
    return this.formatSingleValue(value, 'z');
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
      parts.push(t('text.labelIsValue', { label: text.main.label, value: mainValue }));
    }

    // Add cross coordinate (y for vertical, x for horizontal)
    if (text.cross && text.cross.value !== undefined) {
      const crossValue = Array.isArray(text.cross.value)
        ? this.formatArrayValue(text.cross.value as (number | string)[], crossAxisType).join(', ')
        : this.formatSingleValue(text.cross.value as number | string, crossAxisType);
      parts.push(t('text.labelIsValue', { label: text.cross.label, value: crossValue }));
    }

    // Add z/type information (for line plots this includes group/type like "MAV=3")
    if (text.z && text.z.value !== undefined) {
      const zValue = Array.isArray(text.z.value)
        ? this.formatArrayValue(text.z.value as (number | string)[], 'z').join(Constant.COMMA_SPACE)
        : this.formatSingleValue(text.z.value as number | string, 'z');
      parts.push(t('text.labelIsValue', { label: text.z.label, value: zValue }));
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

    let announcement = t('text.layerOfSize', {
      index: state.index,
      size: state.size,
      identity: TextService.layerIdentity(state),
    });
    if (state.text) {
      const parts: string[] = [];

      // Use axis identity from TextState, fallback to default mapping
      const mainAxisType = state.text.mainAxis ?? 'x';
      const crossAxisType = state.text.crossAxis ?? 'y';

      if (state.text.main && state.text.main.value !== undefined) {
        const mainValue = Array.isArray(state.text.main.value)
          ? this.formatArrayValue(state.text.main.value as (number | string)[], mainAxisType).join(', ')
          : this.formatSingleValue(state.text.main.value as number | string, mainAxisType);
        parts.push(t('text.labelIsValue', { label: state.text.main.label, value: mainValue }));
      }
      // Exclude cross value for violin box plots during layer switch.
      // With explicit violin_box trace type, no heuristic is needed.
      const isViolinBoxPlot = state.traceType === 'violin_box';
      if (!isViolinBoxPlot && state.text.cross && state.text.cross.value !== undefined) {
        const crossValue = Array.isArray(state.text.cross.value)
          ? this.formatArrayValue(state.text.cross.value as (number | string)[], crossAxisType).join(', ')
          : this.formatSingleValue(state.text.cross.value as number | string, crossAxisType);
        parts.push(t('text.labelIsValue', { label: state.text.cross.label, value: crossValue }));
      }
      if (state.text.z && state.text.z.value !== undefined) {
        const zValue = Array.isArray(state.text.z.value)
          ? this.formatArrayValue(state.text.z.value as (number | string)[], 'z').join(Constant.COMMA_SPACE)
          : this.formatSingleValue(state.text.z.value as number | string, 'z');
        parts.push(t('text.labelIsValue', { label: state.text.z.label, value: zValue }));
      }
      if (parts.length > 0) {
        announcement = t('text.layerSwitchAt', {
          layer: announcement,
          details: parts.join(Constant.COMMA_SPACE),
        });
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
        return t('text.noAdditionalLayer');
      }
      return state.type === 'trace' ? t('text.noPlotInfo') : t('text.noFigureInfo');
    } else if (state.type === 'figure') {
      return this.formatFigureText(
        state.index,
        state.size,
        state.traceTypes,
        focusedSubplotTitle(state),
      );
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
   * @param subplotTitle - Authored title of the focused subplot ('' when none)
   * @returns Formatted figure description text
   */
  private formatFigureText(index: number, size: number, traceTypes: string[], subplotTitle: string): string {
    // A subplot authored with an empty `layers` array contributes no trace
    // types. Say the panel is empty instead of building "a multi-layered plot
    // containing  plots" and inviting an ENTER that cannot do anything.
    if (traceTypes.length === 0) {
      return this.emptySubplotText(index, size, subplotTitle) ?? Constant.EMPTY;
    }
    // Terse: keep lobby navigation quick to scan by reading back just the
    // focused subplot's own title (e.g. a facet label) — no "Subplot N"
    // framing. Only when the subplot has no authored title does it fall back
    // to the bare position identifier.
    if (this.mode === TextMode.TERSE) {
      return this.terseSubplotLabel(index, subplotTitle);
    }
    const details = traceTypes.length === 1
      ? t('text.figureSingleType', { type: traceTypes[0] })
      : t('text.figureMultiType', { types: traceTypes.join(Constant.COMMA_SPACE) });
    // Verbose: the full framing, now naming the panel by its authored title
    // (when present) alongside the position.
    return t('text.figureLobbyDetails', {
      position: TextService.subplotPosition(index, size, subplotTitle),
      details,
      prompt: t('text.pressEnterToSelect'),
    });
  }

  /**
   * The terse identifier for a lobby subplot: its authored title, or the bare
   * "Subplot N" position when the subplot has no title. The single terse rule
   * shared by the arrow-navigation description ({@link formatFigureText}) and
   * the entry cue ({@link subplotEntryText}).
   * @param index - 1-based visual position of the subplot.
   * @param title - The subplot's authored title ('' when none).
   * @returns The terse panel identifier.
   */
  private terseSubplotLabel(index: number, title: string): string {
    return title || t('text.subplotIndex', { index });
  }

  /**
   * Names a subplot by its position, adding the authored title when there is
   * one. The one place the "Subplot N of M, Title" phrase is built, so the
   * lobby description and the empty-panel cue cannot word it differently.
   * @param index - 1-based visual position of the subplot.
   * @param size - Total number of subplots in the figure.
   * @param title - The subplot's authored title ('' when none).
   * @returns The panel identifier.
   */
  private static subplotPosition(index: number, size: number, title: string): string {
    return title
      ? t('text.subplotOfSizeTitled', { index, size, title })
      : t('text.subplotOfSize', { index, size });
  }

  /**
   * Builds the spoken cue for ENTERING a subplot from the multi-panel figure
   * lobby, respecting the current text mode:
   *  - OFF: `null` (only the enter tone signals the transition);
   *  - TERSE: the panel's title alone (or bare "Subplot N" when untitled);
   *  - VERBOSE: the full transition, e.g.
   *    "Entered subplot 2 of 4, Sales in North, bar plot.".
   *
   * Lives here (not in the command layer) so all lobby wording and its
   * terse/verbose rules share one home with {@link formatFigureText}.
   * @param index - 1-based visual position of the entered subplot.
   * @param size - Total number of subplots in the figure.
   * @param plotType - The entered trace's plot type ('' to omit).
   * @param title - The entered subplot's authored title ('' when none).
   * @returns The message to announce, or `null` when text mode is OFF.
   */
  public subplotEntryText(index: number, size: number, plotType: string, title: string): string | null {
    if (this.mode === TextMode.OFF) {
      return null;
    }
    if (this.mode === TextMode.TERSE) {
      return this.terseSubplotLabel(index, title);
    }
    if (title && plotType) {
      return t('text.enteredSubplotTitledTyped', { index, size, title, type: plotType });
    }
    if (title) {
      return t('text.enteredSubplotTitled', { index, size, title });
    }
    if (plotType) {
      return t('text.enteredSubplotTyped', { index, size, type: plotType });
    }
    return t('text.enteredSubplot', { index, size });
  }

  /**
   * Builds the wording for a subplot that has nothing to describe — one the
   * producer authored with an empty `layers` array, which is legitimate for an
   * unoccupied cell in a non-rectangular grid or a panel whose geom MAIDR does
   * not support yet. Respects the current text mode:
   *  - OFF: `null`;
   *  - TERSE: "<title or Subplot N>, empty";
   *  - VERBOSE: "Subplot 2 of 4 is empty, nothing to describe.".
   *
   * Shared by the lobby navigation text ({@link formatFigureText}) and the
   * refused-entry cue, so both name the panel the same way.
   * @param index - 1-based visual position of the subplot.
   * @param size - Total number of subplots in the figure.
   * @param title - The subplot's authored title ('' when none).
   * @returns The message to announce, or `null` when text mode is OFF.
   */
  public emptySubplotText(index: number, size: number, title: string): string | null {
    if (this.mode === TextMode.OFF) {
      return null;
    }
    if (this.mode === TextMode.TERSE) {
      return t('text.terseEmptySubplot', { label: this.terseSubplotLabel(index, title) });
    }
    return title
      ? t('text.subplotEmptyTitled', { index, size, title })
      : t('text.subplotEmpty', { index, size });
  }

  /**
   * Builds the spoken cue for EXITING a subplot back to the multi-panel figure
   * lobby, respecting the current text mode:
   *  - OFF: `null` (only the exit tone signals the transition);
   *  - TERSE: "Figure, <title>" — the "Figure," marker signals the return, then
   *    the panel's title alone (or bare "Figure, subplot N" when untitled);
   *  - VERBOSE: the full return, e.g.
   *    "Returned to figure overview, subplot 2 of 4, Sales in North.".
   *
   * Shares the lobby wording rules with {@link subplotEntryText} and
   * {@link formatFigureText}.
   * @param state - The figure lobby state returned to.
   * @param title - The focused subplot's authored title ('' when none).
   * @returns The message to announce, or `null` when text mode is OFF.
   */
  public subplotExitText(state: PlotState, title: string): string | null {
    if (this.mode === TextMode.OFF) {
      return null;
    }
    const terse = this.mode === TextMode.TERSE;
    if (state.type === 'figure' && !state.empty) {
      if (terse) {
        return title
          ? t('text.figureTerseTitled', { title })
          : t('text.figureTerseSubplot', { index: state.index });
      }
      return title
        ? t('text.returnedToFigureSubplotTitled', { index: state.index, size: state.size, title })
        : t('text.returnedToFigureSubplot', { index: state.index, size: state.size });
    }
    return terse ? t('text.figureTerse') : t('text.returnedToFigure');
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
    const identity = traceState && !traceState.empty
      ? TextService.layerIdentity(traceState)
      : t('text.plotOfType', { type: traceType });
    return t('text.layerOfSize', { index, size, identity });
  }

  /**
   * Names a layer for an announcement: what it is, or failing that, its kind.
   *
   * A subplot whose layers are the same kind of thing -- one per hue level of
   * a grouped chart -- reads identically at every layer without the name, so
   * the reader hears two sets of numbers and never learns which series each
   * belongs to. A figure whose layers differ in kind is better served by the
   * type, which is why this falls back to it rather than to a placeholder.
   *
   * Shared by both announcement sites rather than written twice. They compose
   * the same sentence from different states, and the reason to make that
   * explicit is that duplicated formatting is exactly how the two would come
   * to disagree about the same layer.
   *
   * @param state - The trace state of the layer being announced
   * @returns The layer's name, or a phrase naming its type
   */
  private static layerIdentity(state: NonEmptyTraceState): string {
    return state.name ?? t('text.plotOfType', { type: state.plotType || state.traceType });
  }

  /**
   * Whether a sectioned state announces its section *before* the axis label.
   *
   * The discrimination is between a box plot ("lower quartile Price") and a
   * candlestick ("high Price"), and `z` is what separates them: a candlestick
   * carries its trend there, a box plot carries nothing.
   *
   * Named for what it tests rather than for the box plot, because it is no
   * longer only the box plot that answers true — an error bar and a waterfall
   * step both carry a section with no `z`. Both read correctly on this branch,
   * but only because their section labels are already lower case; see
   * `KIND_LABEL` in `src/model/waterfall.ts` and `SECTION_LABEL` in
   * `src/model/errorBar.ts`, which say so at the definition.
   *
   * @param state - The text state to check
   * @returns True when the section is announced ahead of the label
   */
  private announcesSectionBeforeLabel(state: TextState): boolean {
    return state.section !== undefined && state.z === undefined;
  }

  /**
   * Whether a section is one of the box plot's two outlier groups, which read
   * as a list of values rather than as a single one.
   *
   * Compared against the rendered section names rather than against
   * `BoxplotSection`, because the model announces the section in the reader's
   * language and the raw enum would only ever match English.
   *
   * @param section - The section label carried by the text state
   * @returns True for the upper or lower outlier section
   */
  private static isOutlierSection(section: string): boolean {
    return section === t('model.boxSectionUpperOutlier')
      || section === t('model.boxSectionLowerOutlier');
  }

  /**
   * Formats trace text in verbose mode with full descriptions.
   * @param state - The text state to format
   * @returns Verbose formatted text with complete coordinate information
   */
  private formatVerboseTraceText(state: TextState): string {
    // Grid cell format: "{xLabel} is {xMin} through {xMax}, {yLabel} is {yMin} through {yMax}, points are: ..."
    if (state.gridPoints !== undefined && state.range && state.crossRange) {
      return this.formatVerboseGridText(state);
    }

    const verbose = new Array<string>();

    // Grid cell point navigation: add the "Cell [row,col]" clause
    if (state.gridPosition && state.gridPoints === undefined) {
      verbose.push(t('text.gridCell', {
        row: state.gridPosition.row,
        col: state.gridPosition.col,
      }));
    }

    // Use axis identity from TextState, fallback to default mapping
    const mainAxisType = state.mainAxis ?? 'x';
    const crossAxisType = state.crossAxis ?? 'y';
    // Bound once so the clause narrows for the whole method. Absent means
    // the chart has no cross axis, not that this point has no reading on one
    // -- see {@link TextState.cross}.
    const cross = state.cross;

    // Format main-axis values. Each clause is translated whole and the clauses
    // are joined, so a language that orders the words inside one differently
    // still reads the same facts in the same order.
    if (state.range !== undefined) {
      // Format for histogram and scatter plot.
      verbose.push(t('text.labelIsRange', {
        label: state.main.label,
        min: this.formatSingleValue(state.range.min, mainAxisType),
        max: this.formatSingleValue(state.range.max, mainAxisType),
      }));
    } else if (Array.isArray(state.main.value)) {
      verbose.push(t('text.labelIsValue', {
        label: state.main.label,
        value: this.formatArrayValue(state.main.value as (number | string)[], mainAxisType).join(Constant.COMMA_SPACE),
      }));
    } else {
      verbose.push(t('text.labelIsValue', {
        label: state.main.label,
        value: this.formatSingleValue(state.main.value as number | string, mainAxisType),
      }));
    }

    // Special handling for boxplot outlier sections
    if (
      state.section
      && this.announcesSectionBeforeLabel(state)
      && TextService.isOutlierSection(state.section)
      && cross !== undefined
      && Array.isArray(cross.value)
    ) {
      // e.g. 'upper outlier(s)' or 'lower outlier(s)' section
      const label = cross.label;
      const outliers = cross.value as (number | string)[];
      const formattedOutliers = this.formatArrayValue(outliers, crossAxisType);
      const outlierStr = `${Constant.OPEN_BRACKET}${formattedOutliers.join(Constant.COMMA_SPACE)}${Constant.CLOSE_BRACKET}`;
      const reading = t('text.labelIsValue', {
        label: state.main.label,
        value: this.formatSingleValue(state.main.value as number | string, mainAxisType),
      });
      if (outliers.length === 0) {
        // No outliers
        return [reading, t('text.noOutliersFor', { section: state.section, label })].join(Constant.COMMA_SPACE);
      }
      // Outlier values present. English agrees the verb with the count, so the
      // caller picks the key rather than a plural engine picking a form.
      const clause = outliers.length === 1
        ? t('text.outliersForOne', { section: state.section, label, values: outlierStr })
        : t('text.outliersForMany', { section: state.section, label, values: outlierStr });
      return [reading, clause].join(Constant.COMMA_SPACE);
    }

    // Format cross-axis label. A trace with no cross axis at all skips both
    // the label and the value: a pure hierarchy has no magnitude to name,
    // and a bare label with nothing after it would be worse than silence
    // (#1153).
    if (cross !== undefined) {
      // A section is announced ahead of the label, whichever kind of trace
      // carries it: a box plot's "Minimum Value" and a candlestick's "high
      // Price" are the same shape.
      //
      // Verbatim, as terse renders it. Lower-casing here meant the same point
      // announced two different ways depending on the mode, and the difference
      // was in a label that came from neither the user nor the data. It also
      // destroyed case a producer chose: a dumbbell's end names and a
      // ridgeline's group names are authored strings, so `Control` became
      // `control` in one mode and stayed `Control` in the other.
      const crossLabel = state.section !== undefined
        ? t('text.sectionLabel', { section: state.section, label: cross.label })
        : cross.label;

      // Format cross-axis values.
      //
      // A span on the cross axis replaces the single value, the same way
      // `state.range` replaces the main one for a histogram bin. A gantt
      // interval is the case: what the chart draws is a start and an end, and
      // announcing either alone names one edge of a bar as though it were the
      // bar. Every trace that carries one value is unaffected -- `crossRange`
      // is absent on all of them.
      if (state.crossRange !== undefined) {
        verbose.push(t('text.labelIsRange', {
          label: crossLabel,
          min: this.formatSingleValue(state.crossRange.min, crossAxisType),
          max: this.formatSingleValue(state.crossRange.max, crossAxisType),
        }));
      } else if (!Array.isArray(cross.value)) {
        verbose.push(t('text.labelIsValue', {
          label: crossLabel,
          value: this.formatSingleValue(cross.value as number | string, crossAxisType),
        }));
      } else if (cross.value.length > 1) {
        verbose.push(t('text.labelAreValues', {
          label: crossLabel,
          values: this.formatArrayValue(cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE),
        }));
      } else if (cross.value.length > 0) {
        verbose.push(t('text.labelIsValue', {
          label: crossLabel,
          value: this.formatArrayValue(cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE),
        }));
      } else {
        // A cross axis with nothing on it at this point: the label alone, as
        // it read before the clauses were joined rather than concatenated.
        verbose.push(crossLabel);
      }
    }

    // Format for the plots that carry a third value: the heatmap's cell value,
    // the segmented bar's level, the candlestick's trend, the pie's percentage.
    // Reads as ", Percentage is 33.3%" after the label and the value.
    if (state.z !== undefined) {
      verbose.push(t('text.labelIsValue', {
        label: state.z.label,
        value: this.formatZValue(state.z.value),
      }));
    }

    // The running total a stacked point sits inside. Reads as ", Total is 30,
    // 40% of it" after the point's own value, so the two magnitudes a stacked
    // area draws are never announced as one. Verbose only: the terse reading
    // stays one point per utterance, and the chart type — announced as
    // "stacked area" — already tells the reader which of the two `cross` is.
    // Off-axis facts, last and each as its own clause. Deliberately not run
    // through an axis formatter: they are not values on either axis, so the
    // cross axis's format would be the wrong one to apply.
    if (state.asides !== undefined) {
      for (const aside of state.asides) {
        verbose.push(t('text.labelIsValue', { label: aside.label, value: aside.value }));
      }
    }

    if (state.stack !== undefined) {
      verbose.push(t('text.labelIsValue', {
        label: state.stack.label,
        value: this.formatSingleValue(state.stack.value, crossAxisType),
      }));
      if (state.stack.share !== undefined) {
        verbose.push(t('text.shareOfTotal', { percent: (state.stack.share * 100).toFixed(1) }));
      }
    }

    // The uncertainty around the value, after it rather than instead of it —
    // a band is a second fact about a real reading, not a replacement for it
    // the way a histogram bin's extent is. Each bound is announced only when
    // the chart drew it, so a one-sided interval reads as one.
    if (state.interval !== undefined) {
      const { min, max } = state.interval;
      if (min !== undefined && max !== undefined) {
        verbose.push(t('text.intervalRange', {
          min: this.formatSingleValue(min, crossAxisType),
          max: this.formatSingleValue(max, crossAxisType),
        }));
      } else if (min !== undefined) {
        verbose.push(t('text.intervalFrom', { min: this.formatSingleValue(min, crossAxisType) }));
      } else if (max !== undefined) {
        verbose.push(t('text.intervalUpTo', { max: this.formatSingleValue(max, crossAxisType) }));
      }
    }

    return verbose.join(Constant.COMMA_SPACE);
  }

  /**
   * Formats trace text in terse mode with minimal output.
   * @param state - The text state to format
   * @returns Terse formatted text with compact coordinate representation
   */
  private formatTerseTraceText(state: TextState): string {
    // Grid cell format: "{xMin} through {xMax}, {yMin} through {yMax}, points: ..."
    if (state.gridPoints !== undefined && state.range && state.crossRange) {
      return this.formatTerseGridText(state);
    }

    const terse = new Array<string>();

    // Grid cell point navigation: add "Cell [row,col]" prefix
    if (state.gridPosition && state.gridPoints === undefined) {
      terse.push(
        t('text.gridCell', { row: state.gridPosition.row, col: state.gridPosition.col }),
        Constant.COMMA_SPACE,
      );
    }

    // Use axis identity from state (supports orientation-aware formatting)
    const mainAxisType = state.mainAxis ?? 'x';
    const crossAxisType = state.crossAxis ?? 'y';
    const cross = state.cross;

    if (Array.isArray(state.main.value)) {
      terse.push(Constant.OPEN_BRACKET, this.formatArrayValue(state.main.value as (number | string)[], mainAxisType).join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
    } else {
      terse.push(this.formatSingleValue(state.main.value as number | string, mainAxisType), Constant.COMMA_SPACE);
    }

    // Special handling for boxplot outlier sections
    if (
      state.section
      && this.announcesSectionBeforeLabel(state)
      && TextService.isOutlierSection(state.section)
      && cross !== undefined
      && Array.isArray(cross.value)
    ) {
      const outliers = cross.value as (number | string)[];
      const formattedOutliers = this.formatArrayValue(outliers, crossAxisType);
      const outlierStr = `${Constant.OPEN_BRACKET}${formattedOutliers.join(Constant.COMMA_SPACE)}${Constant.CLOSE_BRACKET}`;
      const formattedMainValue = this.formatSingleValue(state.main.value as number | string, mainAxisType);
      if (outliers.length === 0) {
        return t('text.terseNoOutliers', { value: formattedMainValue, section: state.section });
      }
      return t('text.terseOutliers', {
        value: formattedMainValue,
        count: outliers.length,
        section: state.section,
        values: outlierStr,
      });
    }

    // Format for cross axis values.
    // For candlestick and box plots, show section (type) first, then cross.value
    // (price/value); other plots show cross.value normally.
    if (state.section !== undefined) {
      terse.push(state.section, Constant.SPACE);
    }
    if (state.crossRange !== undefined) {
      // A span on the cross axis replaces the single value here for the same
      // reason it does in verbose mode: naming one end of an interval names
      // an edge of the bar as though it were the bar. Terse joins the two
      // with a dash rather than with "through", matching how terse drops
      // every other connective word.
      terse.push(
        this.formatSingleValue(state.crossRange.min, crossAxisType),
        Constant.TO_DASH,
        this.formatSingleValue(state.crossRange.max, crossAxisType),
      );
    } else if (cross !== undefined) {
      // Skipped entirely when the chart has no cross axis (#1153).
      if (!Array.isArray(cross.value)) {
        terse.push(this.formatSingleValue(cross.value as number | string, crossAxisType));
      } else {
        terse.push(Constant.OPEN_BRACKET, this.formatArrayValue(cross.value as (number | string)[], crossAxisType).join(Constant.COMMA_SPACE), Constant.CLOSE_BRACKET);
      }
    }

    // Format for heatmap, segmented and pie plots. Terse drops the label, so a
    // pie slice reads "Apples, 30, 33.3%".
    if (state.z !== undefined) {
      // For candlestick plots this reads e.g. "open 100, bear"
      terse.push(Constant.COMMA_SPACE, this.formatZValue(state.z.value));
    }

    // Terse drops the labels, as it does everywhere else, but keeps each
    // aside its own comma-separated clause: fusing one onto a neighbouring
    // value is exactly what made `section` unusable for them.
    if (state.asides !== undefined) {
      for (const aside of state.asides) {
        terse.push(Constant.COMMA_SPACE, aside.value);
      }
    }

    return terse.join(Constant.EMPTY);
  }

  /**
   * Formats grid cell text in verbose mode.
   * Output: "Cell [row,col], {xLabel} is {xMin} through {xMax}, {yLabel} is {yMin} through {yMax}, points are: (x1, y1), ..."
   */
  private formatVerboseGridText(state: TextState): string {
    const mainAxisType = state.mainAxis ?? 'x';
    const crossAxisType = state.crossAxis ?? 'y';
    const parts: string[] = [];

    // Cell position
    if (state.gridPosition) {
      parts.push(t('text.gridCell', {
        row: state.gridPosition.row,
        col: state.gridPosition.col,
      }));
    }

    // X range
    parts.push(t('text.labelIsRange', {
      label: state.main.label,
      min: this.formatSingleValue(state.range!.min, mainAxisType),
      max: this.formatSingleValue(state.range!.max, mainAxisType),
    }));

    // Y range
    parts.push(t('text.labelIsRange', {
      label: state.cross?.label ?? '',
      min: this.formatSingleValue(state.crossRange!.min, crossAxisType),
      max: this.formatSingleValue(state.crossRange!.max, crossAxisType),
    }));

    // Points. English agrees the verb with the count, so the caller picks the
    // key rather than a plural engine picking a form.
    const points = state.gridPoints!;
    if (points.length === 0) {
      parts.push(t('text.noPoints'));
    } else {
      const pointStrs = points.map(
        p => `(${this.formatSingleValue(p.x, mainAxisType)}, ${this.formatSingleValue(p.y, crossAxisType)})`,
      ).join(Constant.COMMA_SPACE);
      parts.push(points.length === 1
        ? t('text.pointIsOne', { points: pointStrs })
        : t('text.pointsAreMany', { points: pointStrs }));
    }

    return parts.join(Constant.COMMA_SPACE);
  }

  /**
   * Formats grid cell text in terse mode.
   * Output: "Cell [row,col], {xMin} through {xMax}, {yMin} through {yMax}, points: (x1, y1), ..."
   */
  private formatTerseGridText(state: TextState): string {
    const mainAxisType = state.mainAxis ?? 'x';
    const crossAxisType = state.crossAxis ?? 'y';
    const parts: string[] = [];

    // Cell position
    if (state.gridPosition) {
      parts.push(t('text.gridCell', {
        row: state.gridPosition.row,
        col: state.gridPosition.col,
      }));
    }

    // X range
    parts.push(t('text.rangeThrough', {
      min: this.formatSingleValue(state.range!.min, mainAxisType),
      max: this.formatSingleValue(state.range!.max, mainAxisType),
    }));

    // Y range
    parts.push(t('text.rangeThrough', {
      min: this.formatSingleValue(state.crossRange!.min, crossAxisType),
      max: this.formatSingleValue(state.crossRange!.max, crossAxisType),
    }));

    // Points
    const points = state.gridPoints!;
    if (points.length === 0) {
      parts.push(t('text.noPoints'));
    } else {
      const pointStrs = points.map(
        p => `(${this.formatSingleValue(p.x, mainAxisType)}, ${this.formatSingleValue(p.y, crossAxisType)})`,
      );
      parts.push(t('text.tersePoints', { points: pointStrs.join(Constant.COMMA_SPACE) }));
    }

    return parts.join(Constant.COMMA_SPACE);
  }

  /**
   * Updates the service with new plot state and emits appropriate events.
   * @param state - The new plot state to process
   */
  public update(state: PlotState): void {
    // Out-of-bounds events (empty trace state, no `warning`) are fired by
    // AbstractTrace.notifyOutOfBounds() when navigation hits a boundary. The
    // user stays at the last valid data point, so we must NOT overwrite
    // `currentState` (used by the AI chat) — hence the early return before that
    // bookkeeping below.
    //
    // We still announce a boundary alert so reaching an edge is not silent,
    // respecting text mode: OFF stays silent, TERSE gets the short "No more
    // data" cue, and VERBOSE gets "No more data to display". These literals are
    // LOCAL to this edge branch (not from format()) so the wording applies only
    // to edge navigation — the warning/rotor-bounds path (excluded by
    // `!state.warning`) still flows through format() and keeps its original,
    // mode-independent "No plot info to display" wording. Returning early also
    // avoids firing `first_navigation` for an empty state, keeping
    // announce-gating intact.
    if (
      state
      && state.empty
      && state.type === 'trace'
      && !state.warning
    ) {
      if (this.mode !== TextMode.OFF) {
        const text = this.mode === TextMode.TERSE ? t('text.noMoreData') : t('text.noMoreDataVerbose');
        this.onChangeEmitter.fire({ value: text });
      }
      return;
    }

    // Figure-level out-of-bounds: navigating subplots in the multi-panel lobby
    // and hitting an edge. Mirror the trace edge cue with subplot wording,
    // respecting text mode (OFF silent, TERSE short, VERBOSE full). Returns
    // early like the trace branch so the empty state does not overwrite
    // `currentState` (the user stayed on the current subplot).
    if (
      state
      && state.empty
      && state.type === 'figure'
      && !state.warning
    ) {
      if (this.mode !== TextMode.OFF) {
        const text = this.mode === TextMode.TERSE ? t('text.noMoreSubplots') : t('text.noMoreSubplotsVerbose');
        this.onChangeEmitter.fire({ value: text });
      }
      return;
    }

    // Layer-level out-of-bounds: Page Up or Page Down at the first or last
    // layer, and every such press on a single-layer chart, which
    // Context.stepTrace answers with this state. The cue is unchanged — it
    // still goes out as a notification with format()'s "No additional layer"
    // wording — but like the two branches above it must return before the
    // bookkeeping below, because the reader never moved: overwriting
    // `currentState` with an empty one left getCoordinateText() null, so the
    // AI chat's "current position" went blank on a keypress that did nothing.
    if (
      state
      && state.empty
      && state.type === 'subplot'
      && !state.warning
    ) {
      if (this.mode !== TextMode.OFF) {
        const text = this.format(state);
        if (text) {
          this.notification.notify(text);
        }
      }
      return;
    }

    // Store the current state for access by ViewModels. This bookkeeping runs
    // regardless of text mode so the AI chat's "current position" stays fresh
    // even after the user toggles text mode OFF and keeps navigating.
    this.currentState = state;

    // Track current layer ID for formatting
    if (state.type === 'trace' && !state.empty) {
      this.currentLayerId = state.layerId;
    } else if (state.type === 'subplot' && !state.empty && !state.trace.empty) {
      this.currentLayerId = state.trace.layerId;
    }

    // In OFF mode, skip all text emission and notification below; the state
    // bookkeeping above has already been applied.
    if (this.mode === TextMode.OFF) {
      return;
    }

    // Enable screen-reader announcements on the user's first navigation, at
    // whatever plot level that navigation happens.
    //
    // The initial instruction is shown visually with announcements suppressed
    // (Controller.showInitialInstructionInText -> setAnnounce(false)); the
    // first model-driven update that reaches this point is the user's first
    // arrow-key navigation, after which nav text must be announced.
    //
    // This previously only fired for figure-type states ("first navigation in
    // multi-panel plots"). But single-subplot plots start navigation at the
    // trace level and never emit a figure-type state, so `announce` stayed
    // false forever and their terse/verbose nav text was silently gated out
    // of the alert region — while rotor/notification messages (which ignore
    // `announce`) still spoke. Firing on the first non-empty update of ANY
    // level fixes single-panel plots and keeps multi-panel behavior identical.
    if (!this.hasHadFirstNavigation && !state.empty) {
      this.hasHadFirstNavigation = true;
      this.onNavigationEmitter.fire({ type: 'first_navigation' });
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

    this.notification.notify(t('text.textMode', { mode: TextService.modeName(this.mode) }));

    return this.mode !== TextMode.OFF;
  }

  /**
   * The name of a text mode as the reader hears it.
   *
   * The enum's values double as the English words, which is why the toggle
   * message used to interpolate the mode directly. They are identifiers, not
   * a translation, so the word is looked up from them instead.
   * @param mode - The mode to name
   * @returns The mode's name in the active locale
   */
  private static modeName(mode: TextMode): string {
    switch (mode) {
      case TextMode.OFF:
        return t('text.modeOff');
      case TextMode.TERSE:
        return t('text.modeTerse');
      case TextMode.VERBOSE:
        return t('text.modeVerbose');
    }
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
