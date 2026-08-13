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

  const context = {
    state: { type: 'trace' },
    isMovable: () => true,
    moveOnce,
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
