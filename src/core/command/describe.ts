import {Plot} from '../../model/plot';
import {AudioService} from '../service/audio';
import {BrailleService} from '../service/braille';
import {TextService} from '../service/text';
import {Command} from './command';

abstract class DescribeCommand implements Command {
  protected readonly plot: Plot;
  protected readonly text: TextService;

  protected constructor(plot: Plot, text: TextService) {
    this.plot = plot;
    this.text = text;
  }

  public abstract execute(event?: Event): void;
}

export class DescribeXCommand extends DescribeCommand {
  public constructor(plot: Plot, text: TextService) {
    super(plot, text);
  }

  public execute(): void {
    const message = `X label is ${this.plot.xAxis}`;
    this.text.update(message);
  }
}

export class DescribeYCommand extends DescribeCommand {
  public constructor(plot: Plot, text: TextService) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Y label is ${this.plot.yAxis}`;
    this.text.update(message);
  }
}

export class DescribeTitleCommand extends DescribeCommand {
  public constructor(plot: Plot, text: TextService) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Title is ${this.plot.title}`;
    this.text.update(message);
  }
}

export class DescribeSubtitleCommand extends DescribeCommand {
  public constructor(plot: Plot, text: TextService) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Subtitle is ${this.plot.subtitle}`;
    this.text.update(message);
  }
}

export class DescribeCaptionCommand extends DescribeCommand {
  public constructor(plot: Plot, text: TextService) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Caption is ${this.plot.caption}`;
    this.text.update(message);
  }
}

export class DescribePointCommand extends DescribeCommand {
  private readonly audio: AudioService;
  private readonly braille: BrailleService;

  public constructor(
    plot: Plot,
    audio: AudioService,
    braille: BrailleService,
    text: TextService
  ) {
    super(plot, text);
    this.audio = audio;
    this.braille = braille;
  }

  public execute(): void {
    this.audio.update(this.plot.state);
    this.braille.update(this.plot.state);
    this.text.update(this.plot.state);
  }
}
