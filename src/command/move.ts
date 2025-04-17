import type { Context } from '@model/context';
import type { Command } from './command';

export class MoveUpCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('UPWARD');
  }
}

export class MoveDownCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('DOWNWARD');
  }
}

export class MoveLeftCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('BACKWARD');
  }
}

export class MoveRightCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('FORWARD');
  }
}

export class MoveToTopExtremeCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('UPWARD');
  }
}

export class MoveToBottomExtremeCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('DOWNWARD');
  }
}

export class MoveToLeftExtremeCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('BACKWARD');
  }
}

export class MoveToRightExtremeCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('FORWARD');
  }
}

export class MoveToTraceContextCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.enterSubplot();
  }
}

export class MoveToSubplotContextCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.exitSubplot();
  }
}

export class MoveToNextTraceCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.stepTrace('UPWARD');
  }
}

export class MoveToPrevTraceCommand implements Command {
  private readonly context: Context;

  public constructor(context: Context) {
    this.context = context;
  }

  public execute(): void {
    this.context.stepTrace('DOWNWARD');
  }
}
