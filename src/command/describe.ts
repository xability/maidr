import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { HighlightService } from '@service/highlight';
import type { TextService } from '@service/text';
import type { Command } from './command';

abstract class DescribeCommand implements Command {
  protected readonly context: ContextService;
  protected readonly text: TextService;

  protected constructor(context: ContextService, text: TextService) {
    this.context = context;
    this.text = text;
  }

  public abstract execute(event?: Event): void;
}

export class DescribeXCommand extends DescribeCommand {
  public constructor(context: ContextService, text: TextService) {
    super(context, text);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `X label is ${state.xAxis}`;
      this.text.update(message);
    }
  }
}

export class DescribeYCommand extends DescribeCommand {
  public constructor(context: ContextService, text: TextService) {
    super(context, text);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `Y label is ${state.yAxis}`;
      this.text.update(message);
    }
  }
}

export class DescribeFillCommand extends DescribeCommand {
  public constructor(context: ContextService, text: TextService) {
    super(context, text);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      const message = `Fill is ${state.fill}`;
      this.text.update(message);
    }
  }
}

export class DescribeTitleCommand extends DescribeCommand {
  public constructor(context: ContextService, text: TextService) {
    super(context, text);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.empty) {
      return;
    }

    if (state.type === 'figure') {
      const message = `Figure title is ${state.title}`;
      this.text.update(message);
    } else if (state.type === 'trace') {
      const message = `Subplot title is ${state.title}`;
      this.text.update(message);
    }
  }
}

export class DescribeSubtitleCommand extends DescribeCommand {
  public constructor(context: ContextService, text: TextService) {
    super(context, text);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      const message = `Subtitle is ${state.subtitle}`;
      this.text.update(message);
    }
  }
}

export class DescribeCaptionCommand extends DescribeCommand {
  public constructor(context: ContextService, text: TextService) {
    super(context, text);
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'figure' && !state.empty) {
      const message = `Caption is ${state.caption}`;
      this.text.update(message);
    }
  }
}

export class DescribePointCommand extends DescribeCommand {
  private readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly highlight: HighlightService;

  public constructor(
    context: ContextService,
    text: TextService,
    audio: AudioService,
    braille: BrailleService,
    highlight: HighlightService,
  ) {
    super(context, text);
    this.audio = audio;
    this.braille = braille;
    this.highlight = highlight;
  }

  public execute(): void {
    const state = this.context.state;
    switch (state.type) {
      case 'figure':
      case 'subplot':
        this.text.update(state);
        break;

      case 'trace':
        this.text.update(state);
        this.audio.update(state);
        this.braille.update(state);
        this.highlight.update(state);
        break;
    }
  }
}
