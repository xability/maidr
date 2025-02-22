import type { Plot } from '@type/plot';

import type { Command } from './command';
import { MovableDirection } from '@type/movable';

export class MoveUpCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce(MovableDirection.UPWARD);
  }
}

export class MoveDownCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce(MovableDirection.DOWNWARD);
  }
}

export class MoveLeftCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce(MovableDirection.BACKWARD);
  }
}

export class MoveRightCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce(MovableDirection.FORWARD);
  }
}

export class MoveToTopExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme(MovableDirection.UPWARD);
  }
}

export class MoveToBottomExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme(MovableDirection.DOWNWARD);
  }
}

export class MoveToLeftExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme(MovableDirection.BACKWARD);
  }
}

export class MoveToRightExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme(MovableDirection.FORWARD);
  }
}
