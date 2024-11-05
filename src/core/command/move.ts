import {Command} from './command';

import {Plottable} from "../interface";

export class MoveUpCommand implements Command {
  private readonly plot: Plottable;

  constructor(plot: Plottable) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveUp();
  }
}

export class MoveDownCommand implements Command {
  private readonly plot: Plottable;

  constructor(plot: Plottable) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveDown();
  }
}

export class MoveLeftCommand implements Command {
  private readonly plot: Plottable;

  constructor(plot: Plottable) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveLeft();
  }
}

export class MoveRightCommand implements Command {
  private readonly plot: Plottable;

  constructor(plot: Plottable) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveRight();
  }
}
