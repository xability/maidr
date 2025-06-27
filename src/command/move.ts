import type { Context } from '@model/context';
import type { Subplot } from '@model/plot';
import type { TextViewModel } from '@state/viewModel/textViewModel';
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
  private readonly textViewModel: TextViewModel;

  public constructor(context: Context, textViewModel: TextViewModel) {
    this.context = context;
    this.textViewModel = textViewModel;
  }

  public execute(): void {
    // Check if movement is possible before attempting
    if (this.context.active.state.type === 'subplot') {
      const activeSubplot = this.context.active as Subplot;
      if (!activeSubplot.isMovable('UPWARD')) {
        // Provide layer boundary feedback
        activeSubplot.triggerBoundaryFeedback();
        this.textViewModel.notify('no additional layer');
        return;
      }
    }
    this.context.stepTrace('UPWARD');
  }
}

export class MoveToPrevTraceCommand implements Command {
  private readonly context: Context;
  private readonly textViewModel: TextViewModel;

  public constructor(context: Context, textViewModel: TextViewModel) {
    this.context = context;
    this.textViewModel = textViewModel;
  }

  public execute(): void {
    // Check if movement is possible before attempting
    if (this.context.active.state.type === 'subplot') {
      const activeSubplot = this.context.active as Subplot;
      if (!activeSubplot.isMovable('DOWNWARD')) {
        // Provide layer boundary feedback
        activeSubplot.triggerBoundaryFeedback();
        this.textViewModel.notify('no additional layer');
        return;
      }
    }
    this.context.stepTrace('DOWNWARD');
  }
}
