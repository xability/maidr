import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Command} from './command';
import {Plot} from '../../plot/plot';
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
    this.text.show(message);
  }
}

export class DescribeYCommand extends DescribeCommand {
  constructor(plot: Plot, text: TextManager) {
    super(plot, text);
  }

  public execute(): void {
    const message = `Y label is ${this.plot.yAxis}`;
    this.text.show(message);
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

  execute(): void {
    this.audio.play(this.plot.state);
    this.braille.show(this.plot.state);
    this.text.show(this.plot.state);
  }
}
