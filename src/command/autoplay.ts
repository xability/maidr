import type { Context } from '@model/context';
import type { AutoplayService } from '@service/autoplay';
import type { Command } from './command';

/**
 * Command to start autoplay in the upward direction.
 */
export class AutoplayUpwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of AutoplayUpwardCommand.
   * @param {Context} context - The application context.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(context: Context, autoplay: AutoplayService) {
    this.context = context;
    this.autoplay = autoplay;
  }

  /**
   * Executes the command to start upward autoplay if in trace state.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('UPWARD', state);
    }
  }
}

/**
 * Command to start autoplay in the downward direction.
 */
export class AutoplayDownwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of AutoplayDownwardCommand.
   * @param {Context} context - The application context.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(context: Context, autoplay: AutoplayService) {
    this.autoplay = autoplay;
    this.context = context;
  }

  /**
   * Executes the command to start downward autoplay if in trace state.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('DOWNWARD', state);
    }
  }
}

/**
 * Command to start autoplay in the forward direction.
 */
export class AutoplayForwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of AutoplayForwardCommand.
   * @param {Context} context - The application context.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(context: Context, autoplay: AutoplayService) {
    this.autoplay = autoplay;
    this.context = context;
  }

  /**
   * Executes the command to start forward autoplay if in trace state.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('FORWARD', state);
    }
  }
}

/**
 * Command to start autoplay in the backward direction.
 */
export class AutoplayBackwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of AutoplayBackwardCommand.
   * @param {Context} context - The application context.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(context: Context, autoplay: AutoplayService) {
    this.autoplay = autoplay;
    this.context = context;
  }

  /**
   * Executes the command to start backward autoplay if in trace state.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('BACKWARD', state);
    }
  }
}

/**
 * Command to stop the current autoplay.
 */
export class StopAutoplayCommand implements Command {
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of StopAutoplayCommand.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  /**
   * Executes the command to stop autoplay.
   */
  public execute(): void {
    this.autoplay.stop();
  }
}

/**
 * Command to increase the autoplay speed.
 */
export class SpeedUpAutoplayCommand implements Command {
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of SpeedUpAutoplayCommand.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  /**
   * Executes the command to speed up autoplay.
   */
  public execute(): void {
    this.autoplay.speedUp();
  }
}

/**
 * Command to decrease the autoplay speed.
 */
export class SpeedDownAutoplayCommand implements Command {
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of SpeedDownAutoplayCommand.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  /**
   * Executes the command to slow down autoplay.
   */
  public execute(): void {
    this.autoplay.speedDown();
  }
}

/**
 * Command to reset the autoplay speed to default.
 */
export class ResetAutoplaySpeedCommand implements Command {
  private readonly autoplay: AutoplayService;

  /**
   * Creates an instance of ResetAutoplaySpeedCommand.
   * @param {AutoplayService} autoplay - The autoplay service.
   */
  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  /**
   * Executes the command to reset autoplay speed.
   */
  public execute(): void {
    this.autoplay.resetSpeed();
  }
}
