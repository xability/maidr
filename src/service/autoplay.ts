import type { Movable, MovableDirection } from '@type/movable';
import type { PlotState } from '@type/state';
import type { NotificationService } from './notification';
import type { TextService } from './text';

const DEFAULT_SPEED = 250;
const MIN_SPEED = 50;
const MAX_SPEED = 500;

const TOTAL_DURATION = 4000;
const DEFAULT_INTERVAL = 20;

export class AutoplayService {
  private readonly notification: NotificationService;
  private readonly text: TextService;
  private readonly movable: Movable;

  private playId: NodeJS.Timeout | null;
  private currentDirection: MovableDirection | null;

  private userSpeed: number | null;
  private defaultSpeed: number;
  private minSpeed: number;
  private readonly maxSpeed: number;

  private autoplayRate: number;
  private readonly totalDuration: number;
  private readonly interval: number;

  public constructor(notification: NotificationService, text: TextService, movable: Movable) {
    this.notification = notification;
    this.text = text;
    this.movable = movable;

    this.playId = null;
    this.currentDirection = null;

    this.userSpeed = null;
    this.defaultSpeed = DEFAULT_SPEED;
    this.minSpeed = MIN_SPEED;
    this.maxSpeed = MAX_SPEED;

    this.autoplayRate = this.defaultSpeed;
    this.totalDuration = TOTAL_DURATION;
    this.interval = DEFAULT_INTERVAL;
  }

  public destroy(): void {
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
    state?: PlotState,
  ): number {
    if (this.userSpeed !== null) {
      return this.userSpeed;
    }

    if (state && !state.empty) {
      const calculatedRate = Math.ceil(
        this.totalDuration / state.autoplay[direction],
      );
      this.defaultSpeed = calculatedRate;
      this.minSpeed = Math.min(this.minSpeed, calculatedRate);
      return calculatedRate;
    }

    return this.defaultSpeed;
  }
}
