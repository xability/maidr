/**
 * Autoplay has to cover the point it starts from (#615).
 *
 * Playback used to open by scheduling a move, so the point the user pressed
 * the shortcut on was never sounded as part of the pass. On a four-bar chart,
 * arrowing onto the leftmost bar and playing forward gave three of the four
 * bars — and since the same is true from the right, there was no key sequence
 * that played a trace end to end. A reader hearing a run that begins and ends
 * at the edges has no way to tell it left a bar out.
 *
 * Driven through a real `Figure`/`Context` rather than a stubbed one, because
 * the claim is about which points a listener hears: the assertion reads the
 * audio states the trace pushed to its observers, which is the same channel
 * the AudioService consumes. `autoplay.test.ts` covers the step *pacing*
 * against a stub; this file covers what the pass contains.
 */
import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { Maidr } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { TraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { AutoplayService } from '@service/autoplay';
import { TraceType } from '@type/grammar';

/** Long enough that every scheduled step fires within one advance. */
const LONG_ENOUGH_MS = 60_000;

const VALUES = [1, 2, 3, 4];

/**
 * A single-panel bar chart whose four bars carry distinct values.
 * @returns The MAIDR spec under test
 */
function barChart(): Maidr {
  return {
    id: 'autoplay-starting-point',
    subplots: [[{
      layers: [{
        id: '0',
        type: TraceType.BAR,
        data: VALUES.map((y, index) => ({ x: String.fromCharCode(65 + index), y })),
      }],
    }]],
  };
}

/**
 * The service under test wired to a real context, plus the values heard.
 */
interface Harness {
  context: Context;
  service: AutoplayService;
  /** Raw audio values pushed since the last {@link Harness.clear}. */
  heard: () => number[];
  clear: () => void;
}

/**
 * Builds an autoplay service over a real four-bar figure.
 *
 * Only `echoTailDeadline` is faked on the audio side — held at 0, which is
 * what a 2D trace reports — so the steps run at the configured rate and the
 * test observes the sequence rather than the timing.
 * @returns The harness described by {@link Harness}
 */
function createHarness(): Harness {
  const context = new Context(new Figure(barChart()));
  const heard: number[] = [];

  const observable = context.active as unknown as {
    addObserver: (observer: { update: (state: TraceState) => void }) => void;
  };
  observable.addObserver({
    update: (state: TraceState): void => {
      // An out-of-bounds notification carries no audio; only sounded points
      // count toward what the pass covered.
      const audio = (state as unknown as { audio?: { freq?: { raw?: number } } }).audio;
      if (audio?.freq?.raw !== undefined) {
        heard.push(audio.freq.raw);
      }
    },
  });

  const settings = {
    get: <T>(): T => 5000 as unknown as T,
    onChange: (): void => {},
  } as unknown as SettingsService;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const audio = {
    get echoTailDeadline(): number {
      return 0;
    },
  } as unknown as AudioService;

  return {
    context,
    service: new AutoplayService(context, notification, settings, audio),
    heard: () => [...heard],
    clear: () => {
      heard.length = 0;
    },
  };
}

/**
 * Walks the cursor to the far end of the trace, as an arrow key would.
 * @param context - The context to move
 * @param direction - Direction to walk in
 */
function arrowToExtreme(context: Context, direction: MovableDirection): void {
  while (context.isMovable(direction)) {
    context.moveOnce(direction);
  }
}

describe('autoplay covers the point it starts from', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays every bar when started from the leftmost one', () => {
    const { context, service, heard, clear } = createHarness();

    // The issue's reproduction: arrow onto the leftmost bar, then autoplay
    // right. Clearing after the arrow leaves only what the pass itself played.
    context.moveOnce('FORWARD');
    clear();

    service.start('FORWARD', context.state as TraceState);
    jest.advanceTimersByTime(LONG_ENOUGH_MS);

    // Before the fix this was [2, 3, 4]: the bar the user stood on was
    // skipped, so a left-to-right pass covered three of the four bars.
    expect(heard()).toEqual(VALUES);

    service.dispose();
  });

  it('plays every bar when started from the rightmost one', () => {
    const { context, service, heard, clear } = createHarness();

    arrowToExtreme(context, 'FORWARD');
    clear();

    service.start('BACKWARD', context.state as TraceState);
    jest.advanceTimersByTime(LONG_ENOUGH_MS);

    // The other direction matters on its own: with both ends dropping their
    // first point, no pass in either direction covered the whole trace.
    expect(heard()).toEqual([...VALUES].reverse());

    service.dispose();
  });

  it('sounds the starting point before the first move', () => {
    const { context, service, heard, clear } = createHarness();

    context.moveOnce('FORWARD');
    clear();

    service.start('FORWARD', context.state as TraceState);

    // Sounded synchronously, before any timer has fired. Deferring it to the
    // first step would put it where the second point belongs and shift the
    // whole run one point late.
    expect(heard()).toEqual([VALUES[0]]);

    service.dispose();
  });

  it('sounds the current point when there is nowhere left to move', () => {
    const { context, service, heard, clear } = createHarness();

    arrowToExtreme(context, 'FORWARD');
    clear();

    service.start('FORWARD', context.state as TraceState);
    jest.advanceTimersByTime(LONG_ENOUGH_MS);

    // Playing forward from the last bar has one bar to cover, and covers it.
    // This used to be silent, which reads as "the shortcut did nothing"
    // rather than as "you are at the end".
    expect(heard()).toEqual([VALUES[VALUES.length - 1]]);

    service.dispose();
  });

  it('does not replay the starting point when a speed change restarts playback', () => {
    const { context, service, heard, clear } = createHarness();

    context.moveOnce('FORWARD');
    clear();

    service.start('FORWARD', context.state as TraceState);
    service.speedUp();
    jest.advanceTimersByTime(LONG_ENOUGH_MS);

    // A speed keypress re-schedules through the same path as a fresh start.
    // Sounding the starting point again there would repeat a bar mid-run,
    // which is the same class of wrong reading as dropping one.
    expect(heard()).toEqual(VALUES);

    service.dispose();
  });
});
