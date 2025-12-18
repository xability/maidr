import type { Context } from '@model/context';
import type { Command } from './command';

/**
 * Command to move the current position one step upward.
 */
export class MoveUpCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveUpCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move up operation by moving the position one step upward.
   */
  public execute(): void {
    this.context.moveOnce('UPWARD');
  }
}

/**
 * Command to move the current position one step downward.
 */
export class MoveDownCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveDownCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move down operation by moving the position one step downward.
   */
  public execute(): void {
    this.context.moveOnce('DOWNWARD');
  }
}

/**
 * Command to move the current position one step to the left.
 */
export class MoveLeftCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveLeftCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move left operation by moving the position one step backward.
   */
  public execute(): void {
    this.context.moveOnce('BACKWARD');
  }
}

/**
 * Command to move the current position one step to the right.
 */
export class MoveRightCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveRightCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move right operation by moving the position one step forward.
   */
  public execute(): void {
    this.context.moveOnce('FORWARD');
  }
}

/**
 * Command to move the current position to the topmost extreme.
 */
export class MoveToTopExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToTopExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the topmost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('UPWARD');
  }
}

/**
 * Command to move the current position to the bottommost extreme.
 */
export class MoveToBottomExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToBottomExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the bottommost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('DOWNWARD');
  }
}

/**
 * Command to move the current position to the leftmost extreme.
 */
export class MoveToLeftExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToLeftExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the leftmost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('BACKWARD');
  }
}

/**
 * Command to move the current position to the rightmost extreme.
 */
export class MoveToRightExtremeCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToRightExtremeCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to jump to the rightmost extreme position.
   */
  public execute(): void {
    this.context.moveToExtreme('FORWARD');
  }
}

/**
 * Command to move into the trace context from the current subplot.
 */
export class MoveToTraceContextCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToTraceContextCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to enter the subplot trace context.
   */
  public execute(): void {
    this.context.enterSubplot();
  }
}

/**
 * Command to move back to the subplot context from the trace context.
 */
export class MoveToSubplotContextCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToSubplotContextCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to exit the trace context and return to subplot.
   */
  public execute(): void {
    this.context.exitSubplot();
  }
}

/**
 * Command to move to the next trace in the sequence.
 */
export class MoveToNextTraceCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToNextTraceCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to step to the next trace upward.
   */
  public execute(): void {
    this.context.stepTrace('UPWARD');
  }
}

/**
 * Command to move to the previous trace in the sequence.
 */
export class MoveToPrevTraceCommand implements Command {
  private readonly context: Context;

  /**
   * Creates an instance of MoveToPrevTraceCommand.
   * @param {Context} context - The context in which the move operation is performed.
   */
  public constructor(context: Context) {
    this.context = context;
  }

  /**
   * Executes the move operation to step to the previous trace downward.
   */
  public execute(): void {
    this.context.stepTrace('DOWNWARD');
  }
}
