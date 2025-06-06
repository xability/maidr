import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { MovableDirection } from '@type/movable';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import type { TraceState } from '@type/state';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { Emitter } from '@type/event';

const DEFAULT_SPEED = 250;
const MIN_SPEED = 50;
const MAX_SPEED = 500;

const DEFAULT_INTERVAL = 20;

interface AutoplayChangeEvent {
  type: 'start' | 'stop';
}

type AutoplayId = ReturnType<typeof setInterval>;

export class AutoplayService implements Disposable, Observer<Settings> {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly settings: SettingsService;

  private autoplayId: AutoplayId | null;
  private currentDirection: MovableDirection | null;

  private userSpeed: number | null;
  private defaultSpeed: number;
  private minSpeed: number;
  private readonly maxSpeed: number;

  private autoplayRate: number;
  private readonly interval: number;
  private currentDuration: number;

  private readonly onChangeEmitter: Emitter<AutoplayChangeEvent>;
  public readonly onChange: Event<AutoplayChangeEvent>;

  public constructor(context: Context, notification: NotificationService, settings: SettingsService) {
    this.notification = notification;
    this.context = context;
    this.settings = settings;

    this.autoplayId = null;
    this.currentDirection = null;

    this.userSpeed = null;
    this.defaultSpeed = DEFAULT_SPEED;
    this.minSpeed = MIN_SPEED;
    this.maxSpeed = MAX_SPEED;

    this.autoplayRate = this.defaultSpeed;
    this.interval = DEFAULT_INTERVAL;
    this.currentDuration = this.settings.loadSettings().general.autoplayDuration;

    this.onChangeEmitter = new Emitter<AutoplayChangeEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.settings.addObserver(this);
  }

  public dispose(): void {
    this.stop();
    this.onChangeEmitter.dispose();
    this.settings.removeObserver(this);
  }

  public update(settings: Settings): void {
    this.currentDuration = settings.general.autoplayDuration;
    if (this.currentDirection) {
      this.restart();
    }
  }

  public start(direction: MovableDirection, state?: TraceState): void {
    this.stop();
    this.onChangeEmitter.fire({ type: 'start' });

    this.autoplayRate = this.getAutoplayRate(direction, state);
    this.currentDirection = direction;

    this.autoplayId = setInterval(() => {
      if (this.context.isMovable(direction)) {
        this.context.moveOnce(direction);
      } else {
        this.stop();
      }
    }, this.autoplayRate);
  }

  public stop(): void {
    if (this.autoplayId) {
      clearInterval(this.autoplayId);
    }

    this.autoplayId = null;
    this.currentDirection = null;
    this.onChangeEmitter.fire({ type: 'stop' });
  }

  private restart(): void {
    if (this.autoplayId) {
      clearInterval(this.autoplayId);
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
        this.currentDuration / state.autoplay[direction],
      );
      this.defaultSpeed = calculatedRate;
      this.minSpeed = Math.min(this.minSpeed, calculatedRate);
      return calculatedRate;
    }

    return this.defaultSpeed;
  }
}
