import {PlotState} from '../../model/state';
import {Movable, MovableDirection} from '../interface';
import {NotificationService} from './notification';
import {TextService} from './text';

export class AutoplayService {
  private readonly notification: NotificationService;
  private readonly text: TextService;
  private readonly movable: Movable;

  private playId?: NodeJS.Timeout | null = null;
  private currentDirection?: MovableDirection | null = null;

  private userSpeed: number | null = null;
  private defaultSpeed = 250;
  private minSpeed = 50;
  private readonly maxSpeed = 500;

  private autoplayRate = this.defaultSpeed;
  private readonly totalDuration = 4000;
  private readonly interval = 20;

  public constructor(
    notification: NotificationService,
    text: TextService,
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
    this.text.mute();

    this.autoplayRate = this.getAutoplayRate(direction, state);
    this.currentDirection = direction;

    this.playId = setInterval(() => {
      if (this.movable.isMovable(direction)) {
        this.movable.moveOnce(direction);
      } else {
        this.stop();
      }
    }, this.autoplayRate);
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
    const newSpeed = this.userSpeed ?? this.autoplayRate;
    if (newSpeed - this.interval > this.minSpeed) {
      this.userSpeed = newSpeed - this.interval;
      this.autoplayRate = this.userSpeed;
      this.restart();
      this.notification.notify('Speed up');
    } else {
      this.notification.notify('Max speed');
    }
  }

  public speedDown(): void {
    const newSpeed = this.userSpeed ?? this.autoplayRate;
    if (newSpeed + this.interval <= this.maxSpeed) {
      this.userSpeed = newSpeed + this.interval;
      this.autoplayRate = this.userSpeed;
      this.restart();
      this.notification.notify('Speed down');
    } else {
      this.notification.notify('Min speed');
    }
  }

  public resetSpeed(): void {
    this.userSpeed = null;
    this.autoplayRate = this.defaultSpeed;
    this.restart();
    this.notification.notify('Reset speed');
  }

  private getAutoplayRate(
    direction: MovableDirection,
    state?: PlotState
  ): number {
    if (this.userSpeed !== null) {
      return this.userSpeed;
    }

    if (state && !state.empty) {
      const calculatedRate = Math.ceil(
        this.totalDuration / state.autoplay[direction]
      );
      this.defaultSpeed = calculatedRate;
      this.minSpeed = Math.min(this.minSpeed, calculatedRate);
      return calculatedRate;
    }

    return this.defaultSpeed;
  }
}
