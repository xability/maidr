import {Movable, MovableDirection} from '../interface';
import NotificationManager from './notification';
import {PlotState} from '../../model/state';
import TextManager from './text';

export default class AutoplayManager {
  private readonly notification: NotificationManager;
  private readonly text: TextManager;
  private readonly movable: Movable;

  private playId?: NodeJS.Timeout | null;
  private currentDirection?: MovableDirection | null;

  private defaultSpeed = 250;
  private minSpeed = 50;
  private readonly maxSpeed = 500;

  private rate = this.defaultSpeed;
  private readonly totalDuration = 4000;
  private readonly interval = 20;

  constructor(
    notification: NotificationManager,
    text: TextManager,
    movable: Movable
  ) {
    this.notification = notification;
    this.text = text;
    this.movable = movable;
  }

  public destroy() {
    this.stop();
  }

  public start(direction: MovableDirection, state?: PlotState): void {
    this.stop();

    if (state) {
      this.rate = state.empty
        ? this.defaultSpeed
        : Math.ceil(this.totalDuration / state.autoplay[direction]);
      this.defaultSpeed = this.rate;
      this.minSpeed = Math.min(this.minSpeed, this.rate);
    }

    this.text.mute();
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
    }

    this.playId = null;
    this.currentDirection = null;
    this.text.unmute();
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
