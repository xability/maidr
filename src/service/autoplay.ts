import type { Movable, MovableDirection } from '@type/movable';
import type { PlotState } from '@type/state';
import type { AudioService } from './audio';
import type { NotificationService } from './notification';
import type { TextService } from './text';

const DEFAULT_SPEED = 250;
const MIN_SPEED = 50;
const MAX_SPEED = 500;

const TOTAL_DURATION = 4000;
const DEFAULT_INTERVAL = 20;

/**
 * Service to handle autoplay functionality
 * Controls the automated traversal through data points
 */
export class AutoplayService {
  private readonly notification: NotificationService;
  private readonly text: TextService;
  private readonly movable: Movable;
  private readonly audioService?: AudioService;

  private playId: NodeJS.Timeout | null;
  private currentDirection: MovableDirection | null;

  private userSpeed: number | null;
  private defaultSpeed: number;
  private minSpeed: number;
  private readonly maxSpeed: number;

  private autoplayRate: number;
  private readonly totalDuration: number;
  private readonly interval: number;

  /**
   * Creates a new AutoplayService
   *
   * @param notification - Service to display notifications
   * @param text - Service to handle text output
   * @param movable - Interface for moving through data points
   * @param audioService - Optional audio service to notify of autoplay state changes
   */
  public constructor(
    notification: NotificationService,
    text: TextService,
    movable: Movable,
    audioService?: AudioService,
  ) {
    this.notification = notification;
    this.text = text;
    this.movable = movable;
    this.audioService = audioService;

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

  /**
   * Starts autoplay in the specified direction
   *
   * @param direction - The direction to move in during autoplay
   * @param state - Current plot state (optional)
   */
  public start(direction: MovableDirection, state?: PlotState): void {
    this.stop();
    this.text.mute();

    this.autoplayRate = this.getAutoplayRate(direction, state);
    this.currentDirection = direction;

    // Notify audio service that autoplay is starting
    if (this.audioService) {
      this.audioService.setAutoplayState(true);
    }

    this.playId = setInterval(() => {
      if (this.movable.isMovable(direction)) {
        this.movable.moveOnce(direction);
      } else {
        this.stop();
      }
    }, this.autoplayRate);
  }

  /**
   * Stops the current autoplay session
   */
  public stop(): void {
    if (this.playId) {
      clearInterval(this.playId);
    }

    this.playId = null;
    this.currentDirection = null;
    this.text.unmute();

    // Notify audio service that autoplay has stopped
    if (this.audioService) {
      this.audioService.setAutoplayState(false);
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

  private getAutoplayRate(direction: MovableDirection, state?: PlotState): number {
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
