import type { ContextService } from '@service/context';
import type { Command } from './command';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class MoveUpCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('UPWARD');
  }
}

export class MoveDownCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('DOWNWARD');
  }
}

export class MoveLeftCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('BACKWARD');
  }
}

export class MoveRightCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveOnce('FORWARD');
  }
}

export class MoveToTopExtremeCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('UPWARD');
  }
}

export class MoveToBottomExtremeCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('DOWNWARD');
  }
}

export class MoveToLeftExtremeCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('BACKWARD');
  }
}

export class MoveToRightExtremeCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.moveToExtreme('FORWARD');
  }
}

export class MoveToTraceContextCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.enterSubplot();
    hotkeys.setScope(Scope.TRACE);
  }
}

export class MoveToSubplotContextCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    this.context.exitSubplot();
    hotkeys.setScope(Scope.SUBPLOT);
  }
}

export class MoveToNextTraceCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.context.stepTrace('UPWARD');
    }
  }
}

export class MoveToPrevPlotCommand implements Command {
  private readonly context: ContextService;

  public constructor(context: ContextService) {
    this.context = context;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.context.stepTrace('DOWNWARD');
    }
  }
}
