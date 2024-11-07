import AutoplayManager from '../manager/autoplay';
import {Command} from './command';
import {MovableDirection} from '../interface';

export class AutoplayUpwardCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.UPWARD);
  }
}

export class AutoplayDownwardCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.DOWNWARD);
  }
}

export class AutoplayForwardCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.FORWARD);
  }
}

export class AutoplayBackwardCommand implements Command {
  private readonly autoplay: AutoplayManager;

  constructor(autoplay: AutoplayManager) {
    this.autoplay = autoplay;
  }

  public execute(): void {
    this.autoplay.start(MovableDirection.BACKWARD);
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
