import {Command} from './command';
import {Plot} from '../../model/plot';

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
