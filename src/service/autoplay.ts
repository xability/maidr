import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { MovableDirection } from '@type/movable';
import type { TraceState } from '@type/state';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { Emitter } from '@type/event';

const DEFAULT_SPEED = 250;
const MIN_SPEED = 50;
const MAX_SPEED = 500;

const DEFAULT_INTERVAL = 20;

/**
 * Event emitted when autoplay state changes.
 */
interface AutoplayChangeEvent {
  type: 'start' | 'stop';
}

enum AutoplaySettings {
  DURATION = 'general.autoplayDuration',
}

type AutoplayId = ReturnType<typeof setInterval>;

/**
 * Service responsible for managing automatic navigation through data points at configurable speeds.
 */
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
  private totalDuration: number;

  private readonly onChangeEmitter: Emitter<AutoplayChangedEvent>;
  public readonly onChange: Event<AutoplayChangedEvent>;

  /**
   * Creates an instance of AutoplayService.
   * @param context - Navigation context for moving through data
   * @param notification - Service for user notifications
   * @param settings - Service for managing settings
   */
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

    this.interval = DEFAULT_INTERVAL;
    this.autoplayRate = this.defaultSpeed;
    this.interval = DEFAULT_INTERVAL;
    this.totalDuration = settings.get<number>(AutoplaySettings.DURATION);
    settings.onChange((event) => {
      if (event.affectsSetting(AutoplaySettings.DURATION)) {
        this.totalDuration = event.get<number>(AutoplaySettings.DURATION);
        this.restart();
      }
    });

    this.onChangeEmitter = new Emitter<AutoplayChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  /**
   * Cleans up autoplay resources and stops any active autoplay.
   */
  public dispose(): void {
    this.stop();
    this.onChangeEmitter.dispose();
    this.settings.removeObserver(this);
  }

  /**
   * Updates the autoplay service based on settings changes.
   * @param settings - Updated settings object
   */
  public update(settings: Settings): void {
    this.updateSettings(settings);
  }

  /**
   * Handles settings changes and restarts autoplay if active.
   * @param settings - Updated settings object
   */
  private updateSettings(settings: Settings): void {
    this.currentDuration = settings.general.autoplayDuration;
    if (this.currentDirection) {
      this.restart();
    }
  }

  /**
   * Starts autoplay in the specified direction at the calculated rate.
   * @param direction - Direction to move during autoplay
   * @param state - Optional trace state for calculating autoplay rate
   */
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

  /**
   * Stops any active autoplay and clears the interval.
   */
  public stop(): void {
    if (this.autoplayId) {
      clearInterval(this.autoplayId);
    }

    this.autoplayId = null;
    this.currentDirection = null;
    this.onChangeEmitter.fire({ type: 'stop' });
  }

  /**
   * Restarts autoplay in the current direction with updated settings.
   */
  private restart(): void {
    if (this.autoplayId) {
      clearInterval(this.autoplayId);
    }

    if (this.currentDirection) {
      this.start(this.currentDirection);
    }
  }

  /**
   * Increases autoplay speed by decreasing the interval between movements.
   */
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

  /**
   * Decreases autoplay speed by increasing the interval between movements.
   */
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

  /**
   * Resets autoplay speed to the default calculated rate.
   */
  public resetSpeed(): void {
    this.userSpeed = null;
    this.autoplayRate = this.defaultSpeed;
    this.restart();
    this.notification.notify('Reset speed');
  }

  /**
   * Calculates the autoplay rate based on user settings or trace state.
   * @param direction - Direction of autoplay movement
   * @param state - Optional trace state for rate calculation
   * @returns Autoplay rate in milliseconds
   */
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
