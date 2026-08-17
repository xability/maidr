import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { MovableDirection } from '@type/movable';
import type { AutoplayState, TraceState } from '@type/state';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { Emitter } from '@type/event';

/** Default autoplay speed in milliseconds between movements. */
const DEFAULT_SPEED = 250;
/** Minimum speed (fastest playback) in milliseconds between movements. */
const MIN_SPEED = 10;
/** Maximum speed (slowest playback) in milliseconds between movements. */
const MAX_SPEED = 500;

/** Default interval step for speed adjustments in milliseconds. */
const DEFAULT_INTERVAL = 20;

/**
 * Event emitted when autoplay state changes.
 */
interface AutoplayChangeEvent {
  /** The type of autoplay state change. */
  type: 'start' | 'stop';
}

/**
 * Settings keys used by the autoplay service.
 */
enum AutoplaySettings {
  /** Setting key for autoplay duration configuration. */
  DURATION = 'general.autoplayDuration',
}

/** Type alias for the timer ID returned by setTimeout. */
type AutoplayId = ReturnType<typeof setTimeout>;

/**
 * Service responsible for managing automatic navigation through data points at configurable speeds.
 */
export class AutoplayService implements Disposable {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly settings: SettingsService;
  private readonly audio: AudioService;

  private autoplayId: AutoplayId | null;
  private currentDirection: MovableDirection | null;

  private userSpeed: number | null;
  private defaultSpeed: number;
  private minSpeed: number;
  private readonly maxSpeed: number;

  private autoplayRate: number;
  private readonly interval: number;
  private totalDuration: number;
  private lastAutoplay: AutoplayState | null;

  private readonly onChangeEmitter: Emitter<AutoplayChangeEvent>;
  public readonly onChange: Event<AutoplayChangeEvent>;

  /**
   * Creates an instance of AutoplayService.
   * @param context - Navigation context for moving through data
   * @param notification - Service for user notifications
   * @param settings - Service for managing settings
   * @param audio - Service reporting how long the current point sounds for
   */
  public constructor(
    context: Context,
    notification: NotificationService,
    settings: SettingsService,
    audio: AudioService,
  ) {
    this.notification = notification;
    this.context = context;
    this.settings = settings;
    this.audio = audio;

    this.autoplayId = null;
    this.currentDirection = null;

    this.userSpeed = null;
    this.defaultSpeed = DEFAULT_SPEED;
    this.minSpeed = MIN_SPEED;
    this.maxSpeed = MAX_SPEED;

    this.interval = DEFAULT_INTERVAL;
    this.autoplayRate = this.defaultSpeed;
    this.totalDuration = settings.get<number>(AutoplaySettings.DURATION);
    this.lastAutoplay = null;
    settings.onChange((event) => {
      if (event.affectsSetting(AutoplaySettings.DURATION)) {
        this.totalDuration = event.get<number>(AutoplaySettings.DURATION);
        this.restart();
      }
    });

    this.onChangeEmitter = new Emitter<AutoplayChangeEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  /**
   * Cleans up autoplay resources and stops any active autoplay.
   */
  public dispose(): void {
    this.stop();
    this.onChangeEmitter.dispose();
  }

  /**
   * Starts autoplay in the specified direction at the calculated rate.
   * @param direction - Direction to move during autoplay
   * @param state - Optional trace state for calculating autoplay rate
   */
  public start(direction: MovableDirection, state?: TraceState): void {
    this.launch(direction, state, true);
  }

  /**
   * Begins playback, optionally sounding the point it begins from.
   *
   * The first thing playback used to do was move, so the point the user
   * pressed the shortcut on was never sounded as part of the pass: starting
   * from the leftmost point and playing forward gave every point but the
   * first, and there was no way to hear a trace end to end in one pass
   * (#615). Sounding it here makes the run cover what it claims to.
   *
   * It is the same notification a move would have produced, so it is heard
   * exactly like the points after it: the 'start' event above has already put
   * the text layer into autoplay's per-point suppression, and the echo tail
   * the sonification queues is what {@link scheduleStep} then waits out before
   * the first move — the same rule that spaces every later point.
   *
   * Rescheduling does not re-sound it. {@link restart} is a speed or duration
   * change landing mid-playback, and the point the user is on has just been
   * heard; replaying it on each speed keypress would stutter the run rather
   * than complete it.
   *
   * @param direction - Direction to move on each step
   * @param state - Optional trace state for calculating autoplay rate
   * @param fromCurrentPoint - Whether to sound the starting point first
   */
  private launch(
    direction: MovableDirection,
    state: TraceState | undefined,
    fromCurrentPoint: boolean,
  ): void {
    this.stop();
    this.onChangeEmitter.fire({ type: 'start' });

    this.autoplayRate = this.getAutoplayRate(state);
    this.currentDirection = direction;
    if (fromCurrentPoint) {
      this.context.notifyStateUpdate();
    }
    this.scheduleStep(direction);
  }

  /**
   * Queues the next autoplay step.
   *
   * The delay is the configured autoplay rate, held open until the 3D echo tail
   * of the point currently sounding has finished — otherwise the next point's
   * tone starts on top of the previous point's echoes and the two points are
   * heard as one. A trace with no z data reports no tail, so for every 2D plot
   * this is exactly the configured rate.
   *
   * A self-rescheduling timeout rather than an interval, because the wait is
   * decided per point: the number of echoes, and so the tail, scales with that
   * point's z value.
   *
   * @param direction - Direction to move on each step
   */
  private scheduleStep(direction: MovableDirection): void {
    const tailRemaining = Math.max(0, this.audio.echoTailDeadline - Date.now());
    const delay = Math.max(this.autoplayRate, tailRemaining);

    const stepId: AutoplayId = setTimeout(() => {
      // A stop() landing between scheduling and firing clears or replaces
      // autoplayId; this step is then stale and must not move anything.
      if (this.autoplayId !== stepId) {
        return;
      }

      // Autoplay is a trace-level operation. If the active context has been
      // popped out of the trace (e.g. Esc escalates to the subplot), stop
      // instead of blindly auto-navigating the parent element.
      if (this.context.state.type !== 'trace') {
        this.stop();
        return;
      }
      if (!this.context.isMovable(direction)) {
        this.stop();
        return;
      }

      this.context.moveOnce(direction);
      // moveOnce notifies observers synchronously, so the audio service has
      // already scheduled this point's echoes: echoTailDeadline now describes
      // the sonification the next step has to wait out.
      if (this.autoplayId === stepId) {
        this.scheduleStep(direction);
      }
    }, delay);

    this.autoplayId = stepId;
  }

  /**
   * Stops any active autoplay and clears the interval.
   */
  public stop(): void {
    // When autoplay is not running, skip the emitter fire. STOP_AUTOPLAY is
    // bound to the plain arrow keys, so this runs on every navigation keypress;
    // firing 'stop' when idle triggers a needless Redux dispatch on the hottest
    // path. Genuine stops (boundary, arrow during playback, dispose) still fire.
    if (this.autoplayId === null) {
      this.currentDirection = null;
      return;
    }

    clearTimeout(this.autoplayId);
    this.autoplayId = null;
    this.currentDirection = null;
    this.onChangeEmitter.fire({ type: 'stop' });
  }

  /**
   * Restarts autoplay in the current direction with updated settings.
   */
  private restart(): void {
    if (this.autoplayId) {
      clearTimeout(this.autoplayId);
    }

    if (this.currentDirection) {
      this.launch(this.currentDirection, undefined, false);
    }
  }

  /**
   * Increases autoplay speed by decreasing the interval between movements.
   */
  public speedUp(): void {
    const newSpeed = this.userSpeed ?? this.autoplayRate;
    if (newSpeed - this.interval >= this.minSpeed) {
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
   *
   * Takes no direction: the rate is a property of the trace rather than of
   * the pass being played, which is what makes a chart sound the same
   * whichever way a reader goes through it (#614).
   * @param state - Optional trace state for rate calculation
   * @returns Autoplay rate in milliseconds
   */
  private getAutoplayRate(state?: TraceState): number {
    // Remember the point counts so restart() — which passes no state — can
    // recompute the rate from the current totalDuration after a mid-playback
    // duration change, instead of reusing the stale defaultSpeed.
    if (state && !state.empty) {
      this.lastAutoplay = state.autoplay;
    }

    if (this.userSpeed !== null) {
      return this.userSpeed;
    }

    // One tempo for the whole trace, taken from its longest axis.
    //
    // The rate used to be `duration / count-in-this-direction`, which made a
    // chart play at two different speeds depending on which way the reader
    // went — 800 ms a step down a candlestick's five sections against 334 ms
    // along its twelve samples, and the swing reversed on a box plot, where
    // seven sections meet three boxes. A reader cannot use tempo to judge
    // anything if it means something different on each axis (#614).
    //
    // The longest axis rather than the shortest, so the setting keeps naming
    // something real: a full pass along the longest direction takes the
    // configured duration, and a pass along a shorter one finishes sooner
    // *because there is less of it* — which is the honest rendering of a
    // chart that is wider than it is tall.
    const counts = Object.values(this.lastAutoplay ?? {}).filter(
      (count): count is number => typeof count === 'number' && count > 0,
    );
    if (counts.length > 0) {
      const calculatedRate = Math.ceil(this.totalDuration / Math.max(...counts));
      this.defaultSpeed = calculatedRate;
      this.minSpeed = Math.min(this.minSpeed, calculatedRate);
      return calculatedRate;
    }

    return this.defaultSpeed;
  }
}
