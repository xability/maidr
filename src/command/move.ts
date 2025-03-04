import type { Plot } from '@type/plot';
import type { Command } from './command';

export class MoveUpCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce('UPWARD');
  }
}

export class MoveDownCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce('DOWNWARD');
  }
}

export class MoveLeftCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce('BACKWARD');
  }
}

export class MoveRightCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveOnce('FORWARD');
  }
}

export class MoveToTopExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme('UPWARD');
  }
}

export class MoveToBottomExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme('DOWNWARD');
  }
}

export class MoveToLeftExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme('BACKWARD');
  }
}

export class MoveToRightExtremeCommand implements Command {
  private readonly plot: Plot;

  public constructor(plot: Plot) {
    this.plot = plot;
  }

  public execute(): void {
    this.plot.moveToExtreme('FORWARD');
  }
}
