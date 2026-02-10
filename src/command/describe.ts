import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { HighlightService } from '@service/highlight';
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

  /**
   * Creates an instance of DescribeCommand.
   * @param {Context} context - The application context.
   * @param {TextViewModel} textViewModel - The text view model.
   * @param {AudioService} audioService - The audio service.
   */
  protected constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    this.context = context;
    this.textViewModel = textViewModel;
    this.audioService = audioService;
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
   * @param {AudioService} audioService - The audio service.
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    super(context, textViewModel, audioService);
  }

  /**
   * Executes the command to display the X-axis label.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.textViewModel.update(`X label is ${state.xAxis}`);
    } else {
      this.textViewModel.update('X label is not available');
      this.audioService.playWarningToneIfEnabled();
    }
    this.context.toggleScope(Scope.TRACE);
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
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    super(context, textViewModel, audioService);
  }

  /**
   * Executes the command to display the Y-axis label.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.textViewModel.update(`Y label is ${state.yAxis}`);
    } else {
      this.textViewModel.update('Y label is not available');
      this.audioService.playWarningToneIfEnabled();
    }
    this.context.toggleScope(Scope.TRACE);
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
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    super(context, textViewModel, audioService);
  }

  /**
   * Executes the command to display the fill information.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty && state.fill !== 'unavailable') {
      this.textViewModel.update(`Fill is ${state.fill}`);
    } else {
      this.textViewModel.update('Fill is not available');
      this.audioService.playWarningToneIfEnabled();
    }
    this.context.toggleScope(Scope.TRACE);
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
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    super(context, textViewModel, audioService);
  }

  /**
   * Executes the command to display the title based on state type.
   */
  public execute(): void {
    const state = this.context.state;
    if (!state.empty) {
      if (state.type === 'figure') {
        this.textViewModel.update(`Figure title is ${state.title}`);
      } else if (state.type === 'trace' && state.title !== 'unavailable') {
        this.textViewModel.update(`Subplot title is ${state.title}`);
      } else {
        this.textViewModel.update('Title is not available');
        this.audioService.playWarningToneIfEnabled();
      }
    } else {
      this.textViewModel.update('Title is not available');
      this.audioService.playWarningToneIfEnabled();
    }
    this.context.toggleScope(Scope.TRACE);
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
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    super(context, textViewModel, audioService);
  }

  /**
   * Executes the command to display the subtitle.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty && state.subtitle !== 'unavailable') {
      this.textViewModel.update(`Subtitle is ${state.subtitle}`);
    } else {
      this.textViewModel.update('Subtitle is not available');
      this.audioService.playWarningToneIfEnabled();
    }
    this.context.toggleScope(Scope.TRACE);
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
   */
  public constructor(context: Context, textViewModel: TextViewModel, audioService: AudioService) {
    super(context, textViewModel, audioService);
  }

  /**
   * Executes the command to display the caption.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty && state.caption !== 'unavailable') {
      this.textViewModel.update(`Caption is ${state.caption}`);
    } else {
      this.textViewModel.update('Caption is not available');
      this.audioService.playWarningToneIfEnabled();
    }
    this.context.toggleScope(Scope.TRACE);
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
    super(context, textViewModel, audioService);
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
