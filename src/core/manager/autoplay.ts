import {MovableDirection, Movable, Observer} from '../interface';
import NotificationManager from './notification';
import {PlotState} from '../../model/state';

export default class AutoplayManager implements Observer {
  private readonly notification: NotificationManager;
  private readonly movable: Movable;

  private playId?: NodeJS.Timeout | null;
  private currentDirection?: MovableDirection;

  private defaultSpeed: number = 250;
  private minSpeed: number = 50;
  private readonly maxSpeed: number = 500;

  private rate: number = this.defaultSpeed;
  private readonly totalDuration: number = 2000;
  private readonly interval: number = 20;

  constructor(
    notification: NotificationManager,
    movable: Movable,
    state: PlotState
  ) {
    this.notification = notification;
    this.movable = movable;
    this.setAutoplayRate(state);
  }

  private setAutoplayRate(state: PlotState): void {
    this.rate = state.empty
      ? this.defaultSpeed
      : Math.ceil(this.totalDuration / state.autoplay.duration);

    this.defaultSpeed = this.rate;
    this.minSpeed = Math.min(this.minSpeed, this.rate);
  }

  public update(state: PlotState) {
    if (state.empty) {
      return;
    }

    this.stop();
    this.setAutoplayRate(state);
  }

  public start(direction: MovableDirection): void {
    this.stop();
    this.currentDirection = direction;

    const move = this.getMove(direction);
    this.playId = setInterval(() => {
      if (this.movable.isMovable(direction)) {
        move();
      } else {
        this.stop();
      }
    }, this.rate);
  }

  public stop(): void {
    if (this.playId) {
      clearInterval(this.playId);
      this.playId = null;
    }
  }

  private restart(): void {
    if (this.playId) {
      clearInterval(this.playId);
    }

    if (this.currentDirection) {
      this.start(this.currentDirection);
    }
  }

  public speedUp(): void {
    if (this.rate - this.interval > this.minSpeed) {
      this.rate -= this.interval;
      this.restart();
      this.notification.notify('Speed up');
    } else {
      this.notification.notify('Max speed');
    }
  }

  public speedDown(): void {
    if (this.rate + this.interval <= this.maxSpeed) {
      this.rate += this.interval;
      this.restart();
      this.notification.notify('Speed down');
    } else {
      this.notification.notify('Min speed');
    }
  }

  public resetSpeed(): void {
    this.rate = this.defaultSpeed;
    this.restart();
    this.notification.notify('Reset speed');
  }

  private getMove(direction: MovableDirection): () => void {
    switch (direction) {
      case MovableDirection.UPWARD:
        return () => this.movable.moveUp();

      case MovableDirection.DOWNWARD:
        return () => this.movable.moveDown();

      case MovableDirection.FORWARD:
        return () => this.movable.moveRight();

      case MovableDirection.BACKWARD:
        return () => this.movable.moveLeft();
    }
  }
}
