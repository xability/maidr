import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Command} from './command';
import {Plot} from '../../plot/plot';
import TextManager from '../manager/text';

abstract class MoveCommand implements Command {
  protected readonly plot: Plot;

  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;

  protected constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
  ) {
    this.plot = plot;
    this.audio = audio;
    this.braille = braille;
    this.text = text;
  }

  public execute(...args: unknown[]): void {
    this.move(args);
    this.audio.play(this.plot.state);
    this.text.show(this.plot.state);
    this.braille.show(this.plot.braille());
  }

  protected abstract move(...args: unknown[]): void;
}

export class MoveUpCommand extends MoveCommand {
  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
  ) {
    super(plot, audio, braille, text);
  }

  public move(): void {
    this.plot.moveUp();
  }
}

export class MoveDownCommand extends MoveCommand {
  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
  ) {
    super(plot, audio, braille, text);
  }

  public move(): void {
    this.plot.moveDown();
  }
}

export class MoveLeftCommand extends MoveCommand {
  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
  ) {
    super(plot, audio, braille, text);
  }

  public move(): void {
    this.plot.moveLeft();
  }
}

export class MoveRightCommand extends MoveCommand {
  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
  ) {
    super(plot, audio, braille, text);
  }

  public move(): void {
    this.plot.moveRight();
  }
}

export class MoveToIndexCommand extends MoveCommand {
  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager
  ) {
    super(plot, audio, braille, text);
  }

  public move(index: number): void {
    this.plot.moveToIndex(index);
  }
}
