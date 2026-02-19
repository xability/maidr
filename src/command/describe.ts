import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
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
abstract class DescribeCommand implements Command {
  protected readonly context: Context;
  protected readonly textViewModel: TextViewModel;

  /**
   * Creates an instance of DescribeCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   */
  protected constructor(context: Context, textViewModel: TextViewModel) {
    this.context = context;
    this.textViewModel = textViewModel;
  }

  /**
   * Executes the describe command.
   * @param {Event} [event] - Optional event that triggered the command.
   */
  public abstract execute(event?: Event): void;
}

/**
 * Command to describe the X-axis label.
 */
export class DescribeXCommand extends DescribeCommand {
  /**
   * Creates an instance of DescribeXCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   */
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  /**
   * Executes the command to display the X-axis label.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `X label is ${state.xAxis}`;
      this.textViewModel.update(message);
    }
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
   */
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  /**
   * Executes the command to display the Y-axis label.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `Y label is ${state.yAxis}`;
      this.textViewModel.update(message);
    }
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
   */
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  /**
   * Executes the command to display the fill information.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `Fill is ${state.fill}`;
      this.textViewModel.update(message);
    }
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
   */
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  /**
   * Executes the command to display the title based on state type.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.empty) {
      return;
    }

    if (state.type === 'figure') {
      const message = `Figure title is ${state.title}`;
      this.textViewModel.update(message);
    } else if (state.type === 'trace') {
      const message = `Subplot title is ${state.title}`;
      this.textViewModel.update(message);
    }
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
   */
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  /**
   * Executes the command to display the subtitle.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      const message = `Subtitle is ${state.subtitle}`;
      this.textViewModel.update(message);
    }
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
   */
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  /**
   * Executes the command to display the caption.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      const message = `Caption is ${state.caption}`;
      this.textViewModel.update(message);
    }
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
   */
  public constructor(
    context: Context,
    audioService: AudioService,
    highlightService: HighlightService,
    brailleViewModel: BrailleViewModel,
    textViewModel: TextViewModel,
  ) {
    super(context, textViewModel);
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
  private readonly textService: TextService;

  /**
   * Creates an instance of AnnouncePositionCommand.
   * @param {Context} context - The application context.
   * @param {TextService} textService - The text service for mode checking.
   * @param {TextViewModel} textViewModel - The text view model.
   */
  public constructor(
    context: Context,
    textService: TextService,
    textViewModel: TextViewModel,
  ) {
    super(context, textViewModel);
    this.textService = textService;
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
    }
    // Check for multi plots (multiline, panel, layer, facet)
    else if (traceType === TraceType.LINE && state.groupCount && state.groupCount > 1) {
      // Multi-line plots: x=line index, y=position within line
      this.announceMultiLinePosition(x, rows, y, cols);
    } else if (traceType === TraceType.LINE) {
      // Single line plot: y=position within line, cols=total points
      this.announce1DPosition(y, cols);
    }
    else if (traceType === TraceType.SCATTER) {
      // Scatter plot: use x/y for column/row position, but don't include 'Position' as it sounds weird
      this.announceScatter(x, y, rows, cols);
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
    const level = state.text.fill?.value ?? '';
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
    lineIndex: number,
    totalLines: number,
    posIndex: number,
    totalPos: number,
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
