import type { Context } from '@model/context';
import type { AutoplayService } from '@service/autoplay';
import type { Command } from './command';

export class AutoplayUpwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  public constructor(context: Context, autoplay: AutoplayService) {
    this.context = context;
    this.autoplay = autoplay;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('UPWARD', state);
    }
  }
}

export class AutoplayDownwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  public constructor(context: Context, autoplay: AutoplayService) {
    this.autoplay = autoplay;
    this.context = context;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('DOWNWARD', state);
    }
  }
}

export class AutoplayForwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  public constructor(context: Context, autoplay: AutoplayService) {
    this.autoplay = autoplay;
    this.context = context;
  }

  public execute(): void {
    console.log(`[JAWS DEBUG] AutoplayForwardCommand.execute() called`);
    console.log(`[JAWS DEBUG] Stack trace:`, new Error().stack);
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      console.log(`[JAWS DEBUG] Starting forward autoplay`);
      this.autoplay.start('FORWARD', state);
    } else {
      console.log(`[JAWS DEBUG] Cannot start autoplay - invalid state:`, state);
    }
  }
}

export class AutoplayBackwardCommand implements Command {
  private readonly context: Context;
  private readonly autoplay: AutoplayService;

  public constructor(context: Context, autoplay: AutoplayService) {
    this.autoplay = autoplay;
    this.context = context;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace' && !state.empty) {
      this.autoplay.start('BACKWARD', state);
    }
  }
}

export class StopAutoplayCommand implements Command {
  private readonly autoplay: AutoplayService;

  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.stop();
  }
}

export class SpeedUpAutoplayCommand implements Command {
  private readonly autoplay: AutoplayService;

  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.speedUp();
  }
}

export class SpeedDownAutoplayCommand implements Command {
  private readonly autoplay: AutoplayService;

  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.speedDown();
  }
}

export class ResetAutoplaySpeedCommand implements Command {
  private readonly autoplay: AutoplayService;

  public constructor(autoplay: AutoplayService) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.resetSpeed();
  }
}
