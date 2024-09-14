import Audio from './audio';
import Display from './display';
import Plot from './layer/plot';

export default interface Command {
  execute(event?: KeyboardEvent): void;
}

export class MoveUpCommand implements Command {
  private readonly plot: Plot;

  constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveUp();
  }
}

export class MoveDownCommand implements Command {
  private readonly plot: Plot;

  constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveDown();
  }
}

export class MoveLeftCommand implements Command {
  private readonly plot: Plot;

  constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveLeft();
  }
}

export class MoveRightCommand implements Command {
  private readonly plot: Plot;

  constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveRight();
  }
}

export class ToggleSoundCommand implements Command {
  private readonly audio: Audio;

  constructor(audio: Audio) {
    this.audio = audio;
  }

  public execute(): void {
    this.audio.toggle();
  }
}

export class ToggleTextCommand implements Command {
  private readonly display: Display;

  constructor(display: Display) {
    this.display = display;
  }

  public execute(): void {
    this.display.toggle();
  }
}
