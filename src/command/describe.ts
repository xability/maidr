import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { HighlightService } from '@service/highlight';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Command } from './command';

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
