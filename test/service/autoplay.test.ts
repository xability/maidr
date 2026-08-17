/**
 * Tests for the pacing of autoplay: the self-rescheduling step that holds the
 * next move back until the point currently sounding has finished its 3D echo
 * train, without slowing down a plot that has no echoes at all.
 *
 * The echo tail reaches this service as a single number — `echoTailDeadline`,
 * a wall-clock timestamp — so the AudioService is faked down to that one
 * getter and no AudioContext is involved; `audio.echo.test.ts` is where the
 * deadline's own arithmetic is checked. Fake timers stand in for the wall
 * clock, and move `Date.now()` with them, which is what makes the deadline
 * comparison inside `scheduleStep` observable here.
 */
import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { TraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AutoplayService } from '@service/autoplay';

// getAutoplayRate is `Math.ceil(totalDuration / pointCount)`, so these two
// settle the rate at a round 1000 ms and every timing below is readable
// arithmetic rather than a magic number.
const TOTAL_DURATION = 5000;
const POINT_COUNT = 5;
const RATE_MS = TOTAL_DURATION / POINT_COUNT;

// The tail of a full five-echo train at the shipped defaults — the number
// `echoTailMs(5, 5, 0.3)` returns in audio.echo.test.ts. Deliberately longer
// than RATE_MS: this is the case the fix exists for.
const LONG_TAIL_MS = 2100;

/**
 * Settings stub answering the autoplay duration key.
 * @param totalDuration - Milliseconds one full pass of the trace should take
 * @returns A settings service reporting that duration and never changing
 */
function createSettings(totalDuration: number): SettingsService {
  return {
    get: <T>(): T => totalDuration as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

/**
 * Harness holding the service under test and the two things a test drives it
 * with: what the audio reports as still sounding, and where the moves land.
 */
interface AutoplayHarness {
  service: AutoplayService;
  moveOnce: ReturnType<typeof jest.fn>;
  /** Re-announcement of the point playback starts from (#615). */
  notifyStateUpdate: ReturnType<typeof jest.fn>;
  /** Sets the wall-clock timestamp the faked audio reports its tail ending at. */
  setEchoTailDeadline: (deadline: number) => void;
}

/**
 * Builds an AutoplayService over stubbed collaborators.
 *
 * The AudioService stub exposes only `echoTailDeadline`, which is all autoplay
 * reads; the Context stub always allows the move so a test observes the timing
 * and nothing else.
 * @param totalDuration - Value for the `general.autoplayDuration` setting
 * @returns The service together with its mocked move and tail controls
 */
function createAutoplay(totalDuration: number): AutoplayHarness {
  let echoTailDeadline = 0;
  const moveOnce = jest.fn();
  const notifyStateUpdate = jest.fn();

  const context = {
    state: { type: 'trace' },
    isMovable: () => true,
    moveOnce,
    notifyStateUpdate,
  } as unknown as Context;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const audio = {
    get echoTailDeadline(): number {
      return echoTailDeadline;
    },
  } as unknown as AudioService;

  const service = new AutoplayService(
    context,
    notification,
    createSettings(totalDuration),
    audio,
  );

  return {
    service,
    moveOnce,
    notifyStateUpdate,
    setEchoTailDeadline: (deadline: number): void => {
      echoTailDeadline = deadline;
    },
  };
}

/**
 * Trace state carrying the point counts the rate is derived from.
 * @param pointCount - Points to traverse in every direction
 * @returns A non-empty trace state for start()
 */
function traceState(pointCount: number): TraceState {
  return {
    empty: false,
    type: 'trace',
    autoplay: {
      UPWARD: pointCount,
      DOWNWARD: pointCount,
      FORWARD: pointCount,
      BACKWARD: pointCount,
    },
  } as unknown as TraceState;
}

/**
 * Trace state for a chart that is not square — the case direction-dependent
 * pacing showed up on.
 * @param rows - Points a vertical pass covers
 * @param cols - Points a horizontal pass covers
 * @returns A non-empty trace state with differing counts per axis
 */
function oblongState(rows: number, cols: number): TraceState {
  return {
    empty: false,
    type: 'trace',
    autoplay: {
      UPWARD: rows,
      DOWNWARD: rows,
      FORWARD: cols,
      BACKWARD: cols,
    },
  } as unknown as TraceState;
}

describe('autoplayService step pacing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('steps at exactly the configured rate when nothing is still sounding', () => {
    const { service, moveOnce } = createAutoplay(TOTAL_DURATION);

    // Deadline 0 is what a 2D trace reports: no echoes were ever queued, so
    // the wait must collapse to the configured rate and the plot must play at
    // the speed it did before the 3D feature existed.
    service.start('FORWARD', traceState(POINT_COUNT));

    jest.advanceTimersByTime(RATE_MS - 1);
    expect(moveOnce).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(moveOnce).toHaveBeenCalledTimes(1);
    expect(moveOnce).toHaveBeenCalledWith('FORWARD');

    jest.advanceTimersByTime(RATE_MS);
    expect(moveOnce).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('holds the next step until an echo tail longer than the rate has finished', () => {
    const { service, moveOnce, setEchoTailDeadline } = createAutoplay(TOTAL_DURATION);

    setEchoTailDeadline(Date.now() + LONG_TAIL_MS);
    service.start('FORWARD', traceState(POINT_COUNT));

    // This assertion fails before the fix: the step was a plain interval at
    // the configured rate, so the next point's tone started here — while the
    // previous point was still on its second echo — and the two points were
    // heard on top of each other.
    jest.advanceTimersByTime(RATE_MS);
    expect(moveOnce).not.toHaveBeenCalled();

    jest.advanceTimersByTime(LONG_TAIL_MS - RATE_MS);
    expect(moveOnce).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('does not extend the step for a tail that has already elapsed', () => {
    const { service, moveOnce, setEchoTailDeadline } = createAutoplay(TOTAL_DURATION);

    // A deadline left behind by a point that finished sounding before autoplay
    // started: it is in the past, so it must contribute nothing to the wait.
    setEchoTailDeadline(Date.now() - LONG_TAIL_MS);
    service.start('FORWARD', traceState(POINT_COUNT));

    jest.advanceTimersByTime(RATE_MS - 1);
    expect(moveOnce).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(moveOnce).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('drops a pending step when stop lands before it fires', () => {
    const { service, moveOnce } = createAutoplay(TOTAL_DURATION);

    service.start('FORWARD', traceState(POINT_COUNT));

    jest.advanceTimersByTime(RATE_MS - 1);
    service.stop();
    jest.advanceTimersByTime(RATE_MS * 3);

    expect(moveOnce).not.toHaveBeenCalled();

    service.dispose();
  });

  it('sounds the starting point without spending the first step on it', () => {
    const { service, moveOnce, notifyStateUpdate } = createAutoplay(TOTAL_DURATION);

    service.start('FORWARD', traceState(POINT_COUNT));

    // The point the shortcut was pressed on is sounded at once, and the first
    // move still lands a full rate later: the starting point is an extra point
    // in the pass rather than a step taken out of it (#615).
    expect(notifyStateUpdate).toHaveBeenCalledTimes(1);
    expect(moveOnce).not.toHaveBeenCalled();

    jest.advanceTimersByTime(RATE_MS);
    expect(moveOnce).toHaveBeenCalledTimes(1);
    expect(notifyStateUpdate).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('does not re-sound the current point when a speed change restarts the schedule', () => {
    const { service, notifyStateUpdate } = createAutoplay(TOTAL_DURATION);

    service.start('FORWARD', traceState(POINT_COUNT));
    expect(notifyStateUpdate).toHaveBeenCalledTimes(1);

    service.speedUp();
    service.speedDown();
    service.resetSpeed();

    // Each of these re-schedules playback through the same code path as a
    // fresh start. The point the user is on has just been heard, so replaying
    // it once per speed keypress would stutter the run rather than complete it.
    expect(notifyStateUpdate).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('steps at the same rate whichever way the reader goes', () => {
    // A candlestick's shape: five sections against twelve samples. The rate
    // used to be `duration / count-in-this-direction`, so the same chart
    // played at 800 ms a step down and 334 ms a step across (#614).
    const sections = 5;
    const samples = 12;
    const rate = Math.ceil(TOTAL_DURATION / samples);

    const vertical = createAutoplay(TOTAL_DURATION);
    vertical.service.start('UPWARD', oblongState(sections, samples));
    jest.advanceTimersByTime(rate - 1);
    expect(vertical.moveOnce).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(vertical.moveOnce).toHaveBeenCalledTimes(1);
    vertical.service.dispose();

    const horizontal = createAutoplay(TOTAL_DURATION);
    horizontal.service.start('FORWARD', oblongState(sections, samples));
    jest.advanceTimersByTime(rate - 1);
    expect(horizontal.moveOnce).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(horizontal.moveOnce).toHaveBeenCalledTimes(1);
    horizontal.service.dispose();
  });

  it('takes its tempo from the longest axis, not whichever is being played', () => {
    // The box plot's shape, where the swing went the other way: seven
    // sections against three boxes. Taking the shortest axis would make a
    // wide chart crawl; the longest keeps the setting naming something real.
    const { service, moveOnce } = createAutoplay(TOTAL_DURATION);
    const rate = Math.ceil(TOTAL_DURATION / 7);

    service.start('FORWARD', oblongState(7, 3));

    jest.advanceTimersByTime(rate - 1);
    expect(moveOnce).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(moveOnce).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('keeps rescheduling itself across consecutive steps', () => {
    const { service, moveOnce } = createAutoplay(TOTAL_DURATION);

    service.start('FORWARD', traceState(POINT_COUNT));

    // A timeout that rescheduled itself only once would stop after the first
    // move, which is the failure mode a single-step assertion misses.
    jest.advanceTimersByTime(RATE_MS);
    expect(moveOnce).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(RATE_MS);
    expect(moveOnce).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(RATE_MS);
    expect(moveOnce).toHaveBeenCalledTimes(3);

    service.dispose();
  });
});
