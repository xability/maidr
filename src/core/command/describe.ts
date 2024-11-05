import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Command} from './command';
import {Plot} from '../../model/plot';
import TextManager from '../manager/text';

abstract class DescribeCommand implements Command {
  protected readonly plot: Plot;
  protected readonly text: TextManager;

  protected constructor(plot: Plot, text: TextManager) {
    this.plot = plot;
    this.text = text;
  }

  public abstract execute(event?: Event): void;
}

export class DescribeXCommand extends DescribeCommand {
  constructor(plot: Plot, text: TextManager) {
    super(plot, text);
  }

  public execute(): void {
    const message = `X label is ${this.plot.xAxis}`;
    this.text.update(message);
  }
}

export class DescribeYCommand extends DescribeCommand {
  constructor(plot: Plot, text: TextManager) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Y label is ${this.plot.yAxis}`;
    this.text.update(message);
  }
}

export class DescribeTitleCommand extends DescribeCommand {
  constructor(plot: Plot, text: TextManager) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Title is ${this.plot.title}`;
    this.text.update(message);
  }
}

export class DescribeSubtitleCommand extends DescribeCommand {
  constructor(plot: Plot, text: TextManager) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Subtitle is ${this.plot.subtitle}`;
    this.text.update(message);
  }
}
export class DescribeCaptionCommand extends DescribeCommand {
  constructor(plot: Plot, text: TextManager) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Caption is ${this.plot.caption}`;
    this.text.update(message);
  }
}
export class DescribePointCommand extends DescribeCommand {
  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;

  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
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
