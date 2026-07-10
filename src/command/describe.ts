import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { HighlightService } from '@service/highlight';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { BoxBrailleState, LineBrailleState, NonEmptyTraceState } from '@type/state';
import type { Command } from './command';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/**
 * Abstract base class for describe commands.
 */
abstract class AnnounceCommand implements Command {
  protected readonly context: Context;
  protected readonly textViewModel: TextViewModel;
  protected readonly audioService: AudioService;
  protected readonly textService: TextService;
  protected readonly displayService: DisplayService;

  /**
   * Creates an instance of AnnounceCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  protected constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    this.context = context;
    this.textViewModel = textViewModel;
    this.audioService = audioService;
    this.textService = textService;
    this.displayService = displayService;
  }

  /**
   * Executes the describe command.
   * @param {Event} [event] - Optional event that triggered the command.
   */
  public abstract execute(event?: Event): void;

  /**
   * Restores the scope to the previous scope before entering label mode.
   * Uses DisplayService to properly manage the focus stack and restore
   * the correct scope (TRACE, BRAILLE, etc.) regardless of which scope
   * was active before entering label mode.
   *
   * Only exits when a label scope (TRACE_LABEL or FIGURE_LABEL) is actually
   * active. Every current caller (announce x/y/z/title/subtitle/caption) is
   * bound only inside a label scope, so this guard is defensive: it keeps the
   * command safe if a future keybinding ever invokes it from a non-label
   * scope, where exiting unconditionally would flip navigation into TRACE
   * scope via the stale focus stack and break subplot activation.
   */
  protected restoreScope(): void {
    const scope = this.context.scope;
    if (scope === Scope.TRACE_LABEL || scope === Scope.FIGURE_LABEL) {
      this.displayService.exitLabelScope();
    }
  }

  /**
   * Resolves the populated trace state whose labels (x / y / z) should be
   * announced, regardless of the current navigation level:
   *  - trace level: the active trace itself;
   *  - figure lobby (multi-panel) or subplot level: the *currently focused*
   *    subplot's active trace. In a facet figure every panel shares the same
   *    axes, so this is the figure-wide label; in a general multi-panel figure
   *    each panel may differ, so the announcement tracks whichever subplot the
   *    cursor is on (and updates as the user navigates between subplots).
   *
   * Returns null when no populated trace is reachable (e.g. an empty state),
   * so callers can fall back to an "unavailable" announcement.
   */
  protected resolveActiveTraceState(): NonEmptyTraceState | null {
    const state = this.context.state;
    if (state.empty) {
      return null;
    }
    if (state.type === 'trace') {
      return state;
    }
    // Defensive: at runtime the context stack never holds a bare Subplot (it is
    // always paired with a Trace on top, see Context.enterSubplot), so this
    // branch is unreachable in practice — kept for completeness like the
    // 'subplot' fallback in AnnounceTitleCommand.
    if (state.type === 'subplot') {
      return state.trace.empty ? null : state.trace;
    }
    // Figure lobby: read the focused subplot's active trace. Narrow the
    // subplot to its non-empty variant first so `trace` is well-typed.
    const subplot = state.subplot;
    if (subplot.empty || subplot.trace.empty) {
      return null;
    }
    return subplot.trace;
  }

  /**
   * Prefix that names which subplot an announced label belongs to.
   *
   * At the multi-panel figure lobby the cursor sits on one subplot at a time
   * and each panel may carry different axes, so an axis/level announcement is
   * prefixed with the focused subplot's position (e.g. "Subplot 2, "). Returns
   * an empty string once the user is inside a subplot (trace/subplot level) or
   * in a single-panel figure, where the source is already unambiguous — and in
   * terse mode, which stays minimal by design.
   */
  protected labelSourcePrefix(): string {
    if (this.textService.isTerse()) {
      return '';
    }
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      return `Subplot ${state.index}, `;
    }
    return '';
  }

  /**
   * The authored figure-wide axis label to announce at the multi-panel figure
   * lobby, or null when none was authored (so the caller falls back to the
   * focused subplot's own axis). Only applies at the lobby (figure state):
   * once the user is inside a subplot the trace's own axis is authoritative,
   * so this returns null there and existing single-panel behavior is untouched.
   * @param {'x' | 'y'} axis - Which figure-wide axis label to resolve.
   */
  protected figureWideAxisLabel(axis: 'x' | 'y'): string | null {
    const state = this.context.state;
    if (state.type !== 'figure' || state.empty) {
      return null;
    }
    const label = axis === 'x' ? this.context.figureXAxis : this.context.figureYAxis;
    return this.context.isAuthoredAxisLabel(label) ? label : null;
  }

  /**
   * Shared X/Y axis announcement: an authored figure-wide label wins at the
   * lobby ("Figure X label is ..."), otherwise the focused subplot's own axis
   * is used ("Subplot N, X label is ...") — falling through to "not available"
   * when no populated trace is reachable. Z is intentionally not routed here:
   * it reads a different field (`text.z`) with different wording and has no
   * figure-wide equivalent.
   * @param {'x' | 'y'} axis - Which axis to announce.
   */
  protected announceAxisLabel(axis: 'x' | 'y'): void {
    const axisName = axis === 'x' ? 'X' : 'Y';

    const figureLabel = this.figureWideAxisLabel(axis);
    if (figureLabel !== null) {
      const text = this.textService.isTerse()
        ? figureLabel
        : `Figure ${axisName} label is ${figureLabel}`;
      this.textViewModel.update(text);
      this.restoreScope();
      return;
    }

    const traceState = this.resolveActiveTraceState();
    const label = traceState !== null ? (axis === 'x' ? traceState.xAxis : traceState.yAxis) : '';
    // A blank / whitespace-only label is announced as "not available" (matching
    // the title/subtitle/caption commands), so an authored `axes.x.label: ""`
    // never speaks a bare "X label is ".
    if (traceState !== null && label.trim() !== '') {
      const text = this.textService.isTerse()
        ? label
        : `${this.labelSourcePrefix()}${axisName} label is ${label}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : `${axisName} label is not available`;
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
  }
}

/**
 * Command to describe the X-axis label.
 */
export class AnnounceXCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnounceXCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to display the X-axis label.
   *
   * Precedence at the figure lobby: an authored figure-wide X label wins
   * ("Figure X label is ..."); otherwise {@link resolveActiveTraceState} reads
   * the focused subplot's trace ("Subplot N, X label is ..."). Inside a
   * subplot / single-panel the trace's own axis is used unchanged. A blank or
   * whitespace-only label is announced as "not available".
   */
  public execute(): void {
    this.announceAxisLabel('x');
  }
}

/**
 * Command to describe the Y-axis label.
 */
export class AnnounceYCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnounceYCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to display the Y-axis label.
   *
   * Precedence at the figure lobby: an authored figure-wide Y label wins
   * ("Figure Y label is ..."); otherwise {@link resolveActiveTraceState} reads
   * the focused subplot's trace ("Subplot N, Y label is ..."). Inside a
   * subplot / single-panel the trace's own axis is used unchanged. A blank or
   * whitespace-only label is announced as "not available".
   */
  public execute(): void {
    this.announceAxisLabel('y');
  }
}

/**
 * Command to describe the z (level) property.
 * Works with candlestick (trend), heatmap (z value), segmented bars (level),
 * and multi-series line charts (group).
 */
export class AnnounceZCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnounceZCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to display the z (level) information.
   * Checks for valid z-axis data which is in state.text.z with label and value properties.
   * Supports: candlestick (trend), heatmap (z), segmented bars (level), multi-line (group).
   *
   * Works at the figure lobby too: {@link resolveActiveTraceState} reads the
   * active subplot's trace so `l z` announces its level/group label in
   * multi-panel/facet figures, degrading to "not available" for chart types
   * (e.g. box, single-line) that have no z.
   */
  public execute(): void {
    const traceState = this.resolveActiveTraceState();

    // text.z is optional and may be undefined for some chart types (e.g. box,
    // single-line). A blank label is also rejected below so an authored
    // `axes.z.label: ""` announces "not available" rather than a bare
    // "Z label is ", matching the X/Y label commands.
    const zData = traceState?.text.z;
    const hasValidZ = zData !== undefined
      && zData.value !== undefined
      && zData.value !== null
      && zData.value !== 'undefined'
      && zData.label.trim() !== '';

    if (hasValidZ) {
      const zLabel = zData!.label;
      const text = this.textService.isTerse()
        ? zLabel
        : `${this.labelSourcePrefix()}Z label is ${zLabel}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'Z label is not available';
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
  }
}

/**
 * Command to describe the title of the figure or subplot.
 */
export class AnnounceTitleCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnounceTitleCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to display the title sourced from the MAIDR JSON.
   *
   * Only announces titles authored in the JSON; the model's placeholder
   * defaults are treated as "no title". Announces "No title available"
   * when nothing was authored at either level.
   *
   * - Figure-level scope (multi-panel): prefers the figure title as
   *   "Figure title is ...", then falls back to the focused subplot's title as
   *   "Subplot N title is ..." so the lobby still names the panel the cursor is
   *   on when no figure title was authored.
   * - Trace-level scope, single-panel: prefers the layer title, then the
   *   figure title, announced as "Title is ...".
   * - Trace-level scope, multi-panel: prefers the layer title as
   *   "Subplot title is ...", then falls back to the figure title as
   *   "Figure title is ..." so the announcement disambiguates the source.
   */
  public execute(): void {
    const state = this.context.state;

    if (state.empty) {
      this.announceUnavailable();
      this.restoreScope();
      return;
    }

    if (state.type === 'figure') {
      if (this.context.isAuthoredTitle(state.title)) {
        this.announce(state.title, 'Figure title');
        this.restoreScope();
        return;
      }
      // No figure title: fall back to the focused subplot's own title.
      const subplotTitle = !state.subplot.empty && !state.subplot.trace.empty
        ? state.subplot.trace.title
        : '';
      if (this.context.isAuthoredTitle(subplotTitle)) {
        this.announce(subplotTitle, `Subplot ${state.index} title`);
      } else {
        this.announceUnavailable();
      }
      this.restoreScope();
      return;
    }

    if (state.type === 'trace') {
      this.announceTraceTitle(state.title);
      this.restoreScope();
      return;
    }

    // Fallback for unexpected state types (e.g. 'subplot').
    this.announceUnavailable();
    this.restoreScope();
  }

  /**
   * Announces a title value with the given label prefix.
   */
  private announce(title: string, label: string): void {
    const text = this.textService.isTerse()
      ? title
      : `${label} is ${title}`;
    this.textViewModel.update(text);
  }

  /**
   * Announces the appropriate title when in trace context.
   *
   * Mirrors {@link DescriptionService.getDescription} precedence: prefer the
   * authored layer/trace title (labeled "Subplot title" in multi-panel figures
   * and "Title" in single-panel figures), then fall back to the figure title
   * (labeled "Figure title" in multi-panel and "Title" in single-panel so the
   * announcement makes the source self-describing), then to "No title
   * available". Keeps `l t` consistent with `d` for plots that only set a
   * layer title (e.g. multiline_plot.html).
   * @param {string} traceTitle - The trace-level title from the current state.
   */
  private announceTraceTitle(traceTitle: string): void {
    if (this.context.isAuthoredTitle(traceTitle)) {
      const label = this.context.isMultiPanel ? 'Subplot title' : 'Title';
      this.announce(traceTitle, label);
      return;
    }

    // Trace title was a placeholder; fall back to the figure-level title.
    const figureTitle = this.context.figureTitle;
    if (this.context.isAuthoredTitle(figureTitle)) {
      const fallbackLabel = this.context.isMultiPanel ? 'Figure title' : 'Title';
      this.announce(figureTitle, fallbackLabel);
      return;
    }

    this.announceUnavailable();
  }

  /**
   * Announces that the title is not available and plays a warning tone.
   */
  private announceUnavailable(): void {
    const text = this.textService.isTerse()
      ? 'unavailable'
      : 'No title available';
    this.textViewModel.update(text);
    this.audioService.playWarningToneIfEnabled();
  }
}

/**
 * Command to describe the subtitle of the figure.
 */
export class AnnounceSubtitleCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnounceSubtitleCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to display the subtitle.
   * Accesses subtitle from the figure level via Context, since subtitle
   * is a figure-level property not available on trace state. Only announces
   * when the JSON authored a subtitle; otherwise announces "No subtitle
   * available", matching the unavailable phrasing used by sibling title
   * and caption commands.
   */
  public execute(): void {
    const subtitle = this.context.figureSubtitle;
    if (this.context.isAuthoredSubtitle(subtitle)) {
      const text = this.textService.isTerse()
        ? subtitle
        : `Subtitle is ${subtitle}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'No subtitle available';
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
  }
}

/**
 * Command to describe the caption of the figure.
 */
export class AnnounceCaptionCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnounceCaptionCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textViewModel: TextViewModel,
    audioService: AudioService,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to display the caption.
   * Accesses caption from the figure level via Context, since caption
   * is a figure-level property not available on trace state. Only announces
   * when the JSON authored a caption; otherwise announces "No caption
   * available", matching the unavailable phrasing used by sibling title
   * and subtitle commands.
   */
  public execute(): void {
    const caption = this.context.figureCaption;
    if (this.context.isAuthoredCaption(caption)) {
      const text = this.textService.isTerse()
        ? caption
        : `Caption is ${caption}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'No caption available';
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
  }
}

/**
 * Command to describe the current point with audio, braille, and highlight.
 */
export class AnnouncePointCommand extends AnnounceCommand {
  private readonly audio: AudioService;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly highlight: HighlightService;

  /**
   * Creates an instance of AnnouncePointCommand.
   * @param {Context} context - The application context.
   * @param {AudioService} audioService - The audio service.
   * @param {HighlightService} highlightService - The highlight service.
   * @param {BrailleViewModel} brailleViewModel - The braille view model.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {TextService} textService - The text service for mode-aware formatting.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    audioService: AudioService,
    highlightService: HighlightService,
    brailleViewModel: BrailleViewModel,
    textViewModel: TextViewModel,
    textService: TextService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
    this.audio = audioService;
    this.highlight = highlightService;
    this.brailleViewModel = brailleViewModel;
  }

  /**
   * Executes the command to describe the current point with multiple modalities.
   */
  public execute(): void {
    const state = this.context.state;
    switch (state.type) {
      case 'figure':
      case 'subplot':
        this.textViewModel.update(state);
        break;

      case 'trace':
        this.textViewModel.update(state);
        this.audio.update(state);
        this.brailleViewModel.update(state);
        this.highlight.update(state);
        break;
    }
  }
}

/**
 * Command to announce the current position in the chart.
 * Formats output based on text mode (terse/verbose) and chart type.
 */
export class AnnouncePositionCommand extends AnnounceCommand {
  /**
   * Creates an instance of AnnouncePositionCommand.
   * @param {Context} context - The application context.
   * @param {TextService} textService - The text service for mode checking.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {DisplayService} displayService - The display service for scope management.
   */
  public constructor(
    context: Context,
    textService: TextService,
    textViewModel: TextViewModel,
    audioService: AudioService,
    displayService: DisplayService,
  ) {
    super(context, textViewModel, audioService, textService, displayService);
  }

  /**
   * Executes the command to announce the current position.
   */
  public execute(): void {
    // Get current state
    const state = this.context.state;

    // Handle no data case
    if (state.empty || state.type !== 'trace') {
      this.textViewModel.update('Not in a chart, unable to show position.');
      return;
    }

    // Warn if text mode is off instead of announcing position
    if (this.textViewModel.warnIfTextOff()) {
      return;
    }

    // Grid mode: announce axis ranges without points
    if (state.text.gridPoints !== undefined && state.text.range && state.text.crossRange) {
      this.announceGridPosition(state);
      return;
    }

    // Get position from audio.panning (contains x, y, rows, cols)
    const { panning } = state.audio;
    const { x, y, rows, cols } = panning;

    // Check for special chart types
    const traceType = state.traceType;

    if (traceType === TraceType.BOX) {
      this.announceBoxplotPosition(state);
    } else if (traceType === TraceType.CANDLESTICK) {
      this.announceCandlestickPosition(state);
    } else if (
      traceType === TraceType.STACKED
      || traceType === TraceType.NORMALIZED
      || traceType === TraceType.DODGED
    ) {
      this.announceSegmentedBarPosition(state, x, cols);
    } else if (traceType === TraceType.SMOOTH) {
      if (rows > 1) {
        // Multi-violin plots: y=violin index, x=position within violin
        this.announceMultiViolinPosition(y, rows, x, cols);
      } else {
        // Single smooth/violin plot: 1D position within the curve
        this.announceSmoothPosition(x, cols);
      }
    } else if (traceType === TraceType.LINE && state.groupCount && state.groupCount > 1) {
      // Check for multi plots (multiline, panel, layer, facet)
      // Multi-line plots: x=position in the line, y=line index
      this.announceMultiLinePosition(x, cols, y, rows);
    } else if (traceType === TraceType.SCATTER) {
      // Scatter plot: use x/y for column/row position, but don't include 'Position' as it sounds weird
      this.announceScatter(x, y, rows, cols);
    } else if (this.is2DPlot(rows, cols)) {
      // Default position announcement
      this.announce2DPosition(x, y, rows, cols);
    } else {
      this.announce1DPosition(x, cols);
    }
  }

  /**
   * Determines if the chart is a 2D plot based on rows and columns.
   */
  private is2DPlot(rows: number, cols: number): boolean {
    return rows > 1 && cols > 1;
  }

  /**
   * Announces position for 1D plots.
   */
  private announce1DPosition(x: number, cols: number): void {
    const position = x + 1;
    const total = cols;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const percent = cols > 1 ? Math.round((x / (cols - 1)) * 100) : 0;
      this.textViewModel.update(`${percent}%`);
    } else {
      this.textViewModel.update(`Position is ${position} of ${total}`);
    }
  }

  /**
   * Announces position for 2D plots (e.g., heatmaps).
   */
  private announce2DPosition(x: number, y: number, rows: number, cols: number): void {
    const colPos = x + 1;
    const rowPos = y + 1;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const colPercent = cols > 1 ? Math.round((x / (cols - 1)) * 100) : 0;
      const rowPercent = rows > 1 ? Math.round((y / (rows - 1)) * 100) : 0;
      this.textViewModel.update(`${colPercent}%, ${rowPercent}%`);
    } else {
      this.textViewModel.update(
        `Position is column ${colPos} of ${cols}, row ${rowPos} of ${rows}`,
      );
    }
  }

  /**
   * Announces position for grid navigation mode.
   * Shows axis ranges without the points list.
   */
  private announceGridPosition(state: NonEmptyTraceState): void {
    const { text } = state;
    const xRange = text.range!;
    const yRange = text.crossRange!;

    if (this.textService.isTerse()) {
      this.textViewModel.update(
        `${xRange.min} through ${xRange.max}, ${yRange.min} through ${yRange.max}`,
      );
    } else {
      const xLabel = text.main.label || 'x';
      const yLabel = text.cross.label || 'y';
      this.textViewModel.update(
        `${xLabel} is ${xRange.min} through ${xRange.max}, ${yLabel} is ${yRange.min} through ${yRange.max}`,
      );
    }
  }

  /**
   * Announces position for boxplots with section information.
   * Uses braille state which normalizes box position regardless of orientation.
   */
  private announceBoxplotPosition(state: NonEmptyTraceState): void {
    const section = state.text.section || '';
    const braille = state.braille as BoxBrailleState;

    // braille.row is always the box index (normalized for orientation)
    // braille.values is BoxPoint[] with length = number of boxes
    const boxIndex = braille.row;
    const totalBoxes = braille.values.length;
    const position = boxIndex + 1;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const percent = totalBoxes > 1 ? Math.round((boxIndex / (totalBoxes - 1)) * 100) : 0;
      this.textViewModel.update(`${percent}%, ${section.toLowerCase()}`);
    } else {
      this.textViewModel.update(`Position is ${position} of ${totalBoxes} in ${section.toLowerCase()}`);
    }
  }

  /**
   * Announces position for candlestick charts with component information.
   * Uses braille state to get correct candle position.
   */
  private announceCandlestickPosition(state: NonEmptyTraceState): void {
    const section = state.text.section || '';
    const braille = state.braille as LineBrailleState;

    // braille.col is the candle index
    // braille.values is candleValues[segment][candle], so values[0].length = total candles
    const candleIndex = braille.col;
    const totalCandles = braille.values[0].length;
    const position = candleIndex + 1;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const percent = totalCandles > 1 ? Math.round((candleIndex / (totalCandles - 1)) * 100) : 0;
      this.textViewModel.update(`${percent}%, ${section.toLowerCase()}`);
    } else {
      this.textViewModel.update(`Position is ${position} of ${totalCandles}, ${section.toLowerCase()}`);
    }
  }

  /**
   * Announces position for segmented bar charts (stacked, normalized, dodged).
   * Shows column position and level information.
   */
  private announceSegmentedBarPosition(state: NonEmptyTraceState, x: number, cols: number): void {
    const level = state.text.z?.value ?? '';
    const position = x + 1;
    const total = cols;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const percent = cols > 1 ? Math.round((x / (cols - 1)) * 100) : 0;
      this.textViewModel.update(`${percent}%, ${level}`);
    } else {
      this.textViewModel.update(`Position is ${position} of ${total}, Level is ${level}`);
    }
  }

  /**
   * Announces position for smooth/violin plots.
   * Treats as 1D plot - only announces position within the curve.
   */
  private announceSmoothPosition(
    posIndex: number,
    totalPos: number,
  ): void {
    // Smooth plots are 1D - just use position within the curve
    this.announce1DPosition(posIndex, totalPos);
  }

  /**
   * Announces position for multi-violin plots.
   * Shows which violin and position within that violin.
   */
  private announceMultiViolinPosition(
    violinIndex: number,
    totalViolins: number,
    posIndex: number,
    totalPos: number,
  ): void {
    const violinPos = violinIndex + 1;
    const pos = posIndex + 1;
    const violinPrefix = `Violin ${violinPos} of ${totalViolins}`;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const posPercent = totalPos > 1 ? Math.round((posIndex / (totalPos - 1)) * 100) : 0;
      this.textViewModel.update(`${violinPrefix}, ${posPercent}%`);
    } else {
      this.textViewModel.update(`${violinPrefix}, Position is ${pos} of ${totalPos}`);
    }
  }

  /**
   * Announces position for multi-line plots.
   * Always shows "Plot X of Y" prefix, followed by position within the line.
   */
  private announceMultiLinePosition(
    posIndex: number,
    totalPos: number,
    lineIndex: number,
    totalLines: number,
  ): void {
    const linePos = lineIndex + 1;
    const pos = posIndex + 1;
    const plotPrefix = `Plot ${linePos} of ${totalLines}`;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const posPercent = totalPos > 1 ? Math.round((posIndex / (totalPos - 1)) * 100) : 0;
      this.textViewModel.update(`${plotPrefix}, ${posPercent}%`);
    } else {
      this.textViewModel.update(`${plotPrefix}, Position is ${pos} of ${totalPos}`);
    }
  }

  /**
   * Announces position for 2D plots (e.g., heatmaps).
   */
  private announceScatter(x: number, y: number, rows: number, cols: number): void {
    const colPos = x + 1;
    const rowPos = y + 1;

    if (this.textService.isTerse() || this.textService.isOff()) {
      const colPercent = cols > 1 ? Math.round((x / (cols - 1)) * 100) : 0;
      const rowPercent = rows > 1 ? Math.round((y / (rows - 1)) * 100) : 0;
      this.textViewModel.update(`${colPercent}%, ${rowPercent}%`);
    } else {
      this.textViewModel.update(
        `Column ${colPos} of ${cols}, row ${rowPos} of ${rows}`,
      );
    }
  }
}
