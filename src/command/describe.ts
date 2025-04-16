import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { HighlightService } from '@service/highlight';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Command } from './command';

abstract class DescribeCommand implements Command {
  protected readonly context: Context;
  protected readonly textViewModel: TextViewModel;

  protected constructor(context: Context, textViewModel: TextViewModel) {
    this.context = context;
    this.textViewModel = textViewModel;
  }

  public abstract execute(event?: Event): void;
}

export class DescribeXCommand extends DescribeCommand {
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `X label is ${state.xAxis}`;
      this.textViewModel.update(message);
    }
  }
}

export class DescribeYCommand extends DescribeCommand {
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `Y label is ${state.yAxis}`;
      this.textViewModel.update(message);
    }
  }
}

export class DescribeFillCommand extends DescribeCommand {
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `Fill is ${state.fill}`;
      this.textViewModel.update(message);
    }
  }
}

export class DescribeTitleCommand extends DescribeCommand {
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

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

export class DescribeSubtitleCommand extends DescribeCommand {
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      const message = `Subtitle is ${state.subtitle}`;
      this.textViewModel.update(message);
    }
  }
}

export class DescribeCaptionCommand extends DescribeCommand {
  public constructor(context: Context, textViewModel: TextViewModel) {
    super(context, textViewModel);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      const message = `Caption is ${state.caption}`;
      this.textViewModel.update(message);
    }
  }
}

export class DescribePointCommand extends DescribeCommand {
  private readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly highlight: HighlightService;

  public constructor(
    context: Context,
    audioService: AudioService,
    brailleService: BrailleService,
    highlightService: HighlightService,
    textViewModel: TextViewModel,
  ) {
    super(context, textViewModel);
    this.audio = audioService;
    this.braille = brailleService;
    this.highlight = highlightService;
  }

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
        this.braille.update(state);
        this.highlight.update(state);
        break;
    }
  }
}
