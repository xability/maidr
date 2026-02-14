import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { HighlightService } from '@service/highlight';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Command } from './command';
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
