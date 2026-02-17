import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { HighlightService } from '@service/highlight';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { BoxBrailleState, LineBrailleState, NonEmptyTraceState } from '@type/state';
import type { Command } from './command';
import { TraceType } from '@type/grammar';
import { Scope } from '@type/event';

/**
 * Abstract base class for describe commands.
 */
abstract class DescribeCommand implements Command {
  protected readonly context: Context;
  protected readonly textViewModel: TextViewModel;
  protected readonly audioService: AudioService;
  protected readonly textService: TextService;

  /**
   * Creates an instance of DescribeCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  protected constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    this.context = context;
    this.textViewModel = textViewModel;
    this.audioService = audioService;
    this.textService = textService;
  }

  /**
   * Executes the describe command.
   * @param {Event} [event] - Optional event that triggered the command.
   */
  public abstract execute(event?: Event): void;

  /**
   * Restores the scope to the correct parent after a label describe command.
   * Returns to SUBPLOT when at figure level (came from FIGURE_LABEL),
   * TRACE otherwise (came from TRACE_LABEL).
   */
  protected restoreScope(): void {
    const returnScope = this.context.state.type === 'figure'
      ? Scope.SUBPLOT
      : Scope.TRACE;
    this.context.toggleScope(returnScope);
  }
}

/**
 * Command to describe the X-axis label.
 */
export class DescribeXCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeXCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    super(context, textViewModel, audioService, textService);
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
export class DescribeYCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeYCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    super(context, textViewModel, audioService, textService);
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
 * Command to describe the fill property.
 */
export class DescribeFillCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeFillCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    super(context, textViewModel, audioService, textService);
  }

  /**
   * Executes the command to display the fill information.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty && state.fill !== 'unavailable') {
      const text = this.textService.isTerse()
        ? state.fill
        : `Fill is ${state.fill}`;
      this.textViewModel.update(text);
    } else {
      const text = this.textService.isTerse()
        ? 'unavailable'
        : 'Fill is not available';
      this.textViewModel.update(text);
      this.audioService.playWarningToneIfEnabled();
    }
    this.restoreScope();
  }
}

/**
 * Command to describe the title of the figure or subplot.
 */
export class DescribeTitleCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeTitleCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    super(context, textViewModel, audioService, textService);
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
export class DescribeSubtitleCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeSubtitleCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    super(context, textViewModel, audioService, textService);
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
export class DescribeCaptionCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeCaptionCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService, textService: TextService) {
    super(context, textViewModel, audioService, textService);
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
export class DescribePointCommand extends DescribeCommand {
  private readonly audio: AudioService;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly highlight: HighlightService;

  /**
   * Creates an instance of DescribePointCommand.
   * @param {Context} context - The application context.
   * @param {AudioService} audioService - The audio service.
   * @param {HighlightService} highlightService - The highlight service.
   * @param {BrailleViewModel} brailleViewModel - The braille view model.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {TextService} textService - The text service for mode-aware formatting.
   */
  public constructor(
    context: Context,
    audioService: AudioService,
    highlightService: HighlightService,
    brailleViewModel: BrailleViewModel,
    textViewModel: TextViewModel,
    textService: TextService,
  ) {
    super(context, textViewModel, audioService, textService);
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
export class AnnouncePositionCommand extends DescribeCommand {
  /**
   * Creates an instance of AnnouncePositionCommand.
   * @param {Context} context - The application context.
   * @param {TextService} textService - The text service for mode checking.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   */
  public constructor(
    context: Context,
    textService: TextService,
    textViewModel: TextViewModel,
    audioService: AudioService,
  ) {
    super(context, textViewModel, audioService, textService);
  }

  /**
   * Executes the command to announce the current position.
   */
  public execute(): void {
    // Check if speech is off
    if (this.textService.isOff()) {
      return;
    }

    // Get current state
    const state = this.context.state;

    // Handle no data case
    if (state.empty || state.type !== 'trace') {
      this.textViewModel.update('Not in a chart, unable to show position.');
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
      // Violin KDE plots: y=violin index, x=position within violin
      this.announceViolinPosition(y, rows, x, cols);
    }
    // Check for multi plots (multiline, panel, layer, facet)
    else if (traceType === TraceType.LINE && state.groupCount && state.groupCount > 1) {
      // Multi-line plots: x=line index, y=position within line
      this.announceMultiLinePosition(x, rows, y, cols);
    }
    // Default position announcement
    else if (this.is2DPlot(rows, cols)) {
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

    if (this.textService.isTerse()) {
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

    if (this.textService.isTerse()) {
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

    if (this.textService.isTerse()) {
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

    if (this.textService.isTerse()) {
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
    const level = state.text.fill?.value ?? '';
    const position = x + 1;
    const total = cols;

    if (this.textService.isTerse()) {
      const percent = cols > 1 ? Math.round((x / (cols - 1)) * 100) : 0;
      this.textViewModel.update(`${percent}%, ${level}`);
    } else {
      this.textViewModel.update(`Position is ${position} of ${total}, Level is ${level}`);
    }
  }

  /**
   * Announces position for violin plots.
   * Shows which violin (row) and position within that violin (col).
   */
  private announceViolinPosition(
    violinIndex: number,
    totalViolins: number,
    posIndex: number,
    totalPos: number,
  ): void {
    const violinPos = violinIndex + 1;
    const pos = posIndex + 1;

    if (this.textService.isTerse()) {
      const violinPercent = totalViolins > 1 ? Math.round((violinIndex / (totalViolins - 1)) * 100) : 0;
      const posPercent = totalPos > 1 ? Math.round((posIndex / (totalPos - 1)) * 100) : 0;
      this.textViewModel.update(`${violinPercent}%, ${posPercent}%`);
    } else {
      this.textViewModel.update(`Position is ${violinPos} of ${totalViolins}, ${pos} of ${totalPos}`);
    }
  }

  /**
   * Announces position for multi-line plots.
   * Always shows "Plot X of Y" prefix, followed by position within the line.
   */
  private announceMultiLinePosition(
    lineIndex: number,
    totalLines: number,
    posIndex: number,
    totalPos: number,
  ): void {
    const linePos = lineIndex + 1;
    const pos = posIndex + 1;
    const plotPrefix = `Plot ${linePos} of ${totalLines}`;

    if (this.textService.isTerse()) {
      const posPercent = totalPos > 1 ? Math.round((posIndex / (totalPos - 1)) * 100) : 0;
      this.textViewModel.update(`${plotPrefix}, ${posPercent}%`);
    } else {
      this.textViewModel.update(`${plotPrefix}, Position is ${pos} of ${totalPos}`);
    }
  }
}
