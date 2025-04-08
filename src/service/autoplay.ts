import type { ContextService } from '@service/context';
import type { Disposable } from '@type/disposable';
import type { MovableDirection } from '@type/movable';
import type { TraceState } from '@type/state';
import type { NotificationService } from './notification';

const DEFAULT_SPEED = 250;
const MIN_SPEED = 50;
const MAX_SPEED = 500;

const TOTAL_DURATION = 4000;
const DEFAULT_INTERVAL = 20;

export class AutoplayService implements Disposable {
  private readonly context: ContextService;
  private readonly notification: NotificationService;

  private playId: NodeJS.Timeout | null;
  private currentDirection: MovableDirection | null;

  private userSpeed: number | null;
  private defaultSpeed: number;
  private minSpeed: number;
  private readonly maxSpeed: number;

  private autoplayRate: number;
  private readonly totalDuration: number;
  private readonly interval: number;

  public constructor(context: ContextService, notification: NotificationService) {
    this.notification = notification;
    this.context = context;

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

  public dispose(): void {
    this.stop();
  }

  public start(direction: MovableDirection, state?: TraceState): void {
    this.stop();
    // TODO: Emit autoplay started event.

    this.autoplayRate = this.getAutoplayRate(direction, state);
    this.currentDirection = direction;

    this.playId = setInterval(() => {
      if (this.context.isMovable(direction)) {
        this.context.moveOnce(direction);
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
    // TODO: Emit autoplay stopped event.
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

  private getAutoplayRate(direction: MovableDirection, state?: TraceState): number {
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
