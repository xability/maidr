import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { HighlightService } from '@service/highlight';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { BoxBrailleState, LineBrailleState, NonEmptyTraceState } from '@type/state';
import type { Command } from './command';
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
   */
  protected restoreScope(): void {
    this.displayService.exitLabelScope();
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
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const text = this.textService.isTerse()
        ? state.xAxis
        : `X label is ${state.xAxis}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'X label is not available';
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
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
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const text = this.textService.isTerse()
        ? state.yAxis
        : `Y label is ${state.yAxis}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'Y label is not available';
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
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
   */
  public execute(): void {
    const state = this.context.state;

    // Check if we have valid z-axis data
    // state.text.z is optional and may be undefined for some chart types (e.g., box, single-line)
    const zData = state.type === 'trace' && !state.empty ? state.text.z : undefined;
    const hasValidZ = zData !== undefined
      && zData.value !== undefined
      && zData.value !== null
      && zData.value !== 'undefined';

    if (hasValidZ) {
      const zLabel = zData!.label;
      this.textViewModel.update(`${zLabel}`);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'Z-axis is not available';
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
   * Executes the command to display the title based on state type.
   *
   * - Single-panel plots: announces the figure title as "Title is ...".
   * - Multi-panel at figure level: announces "Figure title is ...".
   * - Multi-panel at trace level: announces "Subplot title is ...".
   */
  public execute(): void {
    const state = this.context.state;

    if (state.empty) {
      this.announceUnavailable();
      this.restoreScope();
      return;
    }

    if (state.type === 'figure') {
      this.announce(state.title, 'Figure title');
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
   * Announces the appropriate title when in trace context:
   * subplot title for multi-panel, figure title for single-panel.
   */
  private announceTraceTitle(traceTitle: string): void {
    // Multi-panel: show the subplot-level title if available.
    if (this.context.isMultiPanel && traceTitle !== 'unavailable') {
      this.announce(traceTitle, 'Subplot title');
      return;
    }

    // Single-panel (or multi-panel without subplot title): show figure title.
    const figureTitle = this.context.figureTitle;
    if (figureTitle !== 'unavailable') {
      this.announce(figureTitle, 'Title');
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
      : 'Title is not available';
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
   * is a figure-level property not available on trace state.
   */
  public execute(): void {
    const subtitle = this.context.figureSubtitle;
    if (subtitle !== 'unavailable') {
      const text = this.textService.isTerse()
        ? subtitle
        : `Subtitle is ${subtitle}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'Subtitle is not available';
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
   * is a figure-level property not available on trace state.
   */
  public execute(): void {
    const caption = this.context.figureCaption;
    if (caption !== 'unavailable') {
      const text = this.textService.isTerse()
        ? caption
        : `Caption is ${caption}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'Caption is not available';
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
