import AutoplayManager from '../manager/autoplay';
import {Command} from './command';
import {MovableDirection, Plot} from '../interface';

export class AutoplayUpwardCommand implements Command {
  private readonly autoplay: AutoplayManager;
  private readonly plot: Plot;

  constructor(autoplay: AutoplayManager, plot: Plot) {
    this.autoplay = autoplay;
    this.plot = plot;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.UPWARD, this.plot.state);
  }
}

export class AutoplayDownwardCommand implements Command {
  private readonly autoplay: AutoplayManager;
  private readonly plot: Plot;

  constructor(autoplay: AutoplayManager, plot: Plot) {
    this.autoplay = autoplay;
    this.plot = plot;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.DOWNWARD, this.plot.state);
  }
}

export class AutoplayForwardCommand implements Command {
  private readonly autoplay: AutoplayManager;
  private readonly plot: Plot;

  constructor(autoplay: AutoplayManager, plot: Plot) {
    this.autoplay = autoplay;
    this.plot = plot;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.FORWARD, this.plot.state);
  }
}

export class AutoplayBackwardCommand implements Command {
  private readonly autoplay: AutoplayManager;
  private readonly plot: Plot;

  constructor(autoplay: AutoplayManager, plot: Plot) {
    this.autoplay = autoplay;
    this.plot = plot;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.BACKWARD, this.plot.state);
  }
}

export class StopAutoplayCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute() {
    this.autoplay.stop();
  }
}

export class SpeedUpAutoplayCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute() {
    this.autoplay.speedUp();
  }
}

export class SpeedDownAutoplayCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute() {
    this.autoplay.speedDown();
  }
}

export class ResetAutoplaySpeedCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute() {
    this.autoplay.resetSpeed();
  }
}
