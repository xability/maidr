/**
 * Tests for the stereo slot of a trace that has no horizontal extent —
 * `panning.cols <= 1`.
 *
 * `AudioService` maps a column index onto the stereo field by interpolating it
 * over `[0, cols - 1]`. One column collapses that source range, and
 * `MathUtil.interpolate` answers an empty range with its `toMin`, which for a
 * stereo range is hard left. So a single-series horizontal bar chart — whose
 * `BarTrace` transposes the grid and puts the series count in `cols` — and a
 * gauge, which reports `cols: 1` outright, played every tone out of the left
 * ear for the whole chart. Not "no horizontal position", but a positive claim
 * of "far left", against a highlight moving down the page (#945).
 *
 * The visible side effect of a slot is the `pan.value` of the StereoPannerNode
 * the tone was built with, so the mock collects panners as
 * `audio.panning.test.ts` does. Every tone path is driven through the public
 * `update()`, because all six of them share the one mapping and a test that
 * reached past it would not notice a path left behind.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock, mirroring test/service/audio.emptyTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Long enough for any tone chained through setTimeout to have been built.
const PAST_THE_TONES_MS = 500;

const CENTRE = 0;
const HARD_LEFT = -1;
const HARD_RIGHT = 1;

interface MockPanner {
  pan: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockAudioContext {
  panners: MockPanner[];
}

function makeParam(): unknown {
  return {
    value: 0,
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
  };
}

function makeOscillator(): unknown {
  return {
    type: '',
    frequency: makeParam(),
    detune: makeParam(),
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeGain(): unknown {
  return { gain: makeParam(), connect: jest.fn(), disconnect: jest.fn() };
}

function makeCompressor(): unknown {
  return {
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function installAudioContextMock(): MockAudioContext {
  const ctx = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    panners: [] as MockPanner[],
    createOscillator: makeOscillator,
    createGain: makeGain,
    createDynamicsCompressor: makeCompressor,
    // One panner per tone, in build order, so pan.value records the slot each
    // tone sounded from.
    createStereoPanner(): MockPanner {
      const panner = { pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
      this.panners.push(panner);
      return panner;
    },
    createBuffer: (_channels: number, frames: number) => ({
      getChannelData: () => new Float32Array(frames),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      disconnect: jest.fn(),
    }),
    createBiquadFilter: () => ({
      type: '',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    }),
    resume: () => Promise.resolve(),
    close: jest.fn(),
  };
  (globalThis as unknown as { AudioContext: unknown }).AudioContext
    = function () {
      return ctx;
    };
  return ctx;
}

function createSettings(): SettingsService {
  return {
    get: <T>(): T => 100 as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/** The magnitude every path below pitches, where it pitches one at all. */
const FREQ = { min: 0, max: 10, raw: 5 };

/** The panning of a chart with no horizontal extent: one column, slot zero. */
const ONE_COLUMN = { x: 0, y: 0, rows: 3, cols: 1 };

/**
 * A trace state carrying the given audio payload.
 * @param audio - The `AudioState` the tone paths read
 * @returns A non-empty trace state for update()
 */
function stateWith(audio: object): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'bar',
    audio,
  } as unknown as PlotState;
}

/**
 * A plain data point at a given slot of a given number of columns.
 * @param cols - Columns the trace reports across the stereo field
 * @param x - The point's column index
 * @returns A non-empty trace state for update()
 */
function pointAt(cols: number, x: number = 0): PlotState {
  return stateWith({ freq: FREQ, panning: { x, y: 0, rows: 3, cols } });
}

/**
 * The tone paths `update()` dispatches to, each of which pans.
 *
 * Named by what puts a reader on them, and all spread over one column, so
 * every entry asserts the same thing: a chart with no horizontal extent sounds
 * from the centre, whichever tone it happens to sound with.
 */
const TONE_PATHS: { name: string; state: PlotState }[] = [
  { name: 'an ordinary data point', state: pointAt(1) },
  {
    name: 'a zero-magnitude point',
    state: stateWith({ freq: { ...FREQ, raw: 0 }, panning: ONE_COLUMN }),
  },
  {
    name: 'a zero on a trace that clicks for exact zeros',
    state: stateWith({
      freq: { ...FREQ, raw: 0 },
      panning: ONE_COLUMN,
      zeroClick: true,
    }),
  },
  {
    name: 'a point that glides to carry a direction',
    state: stateWith({ freq: FREQ, panning: ONE_COLUMN, glide: 'up' }),
  },
  {
    name: 'a continuous segment',
    state: stateWith({
      // A continuous segment sweeps a curve of magnitudes rather than sounding
      // one, so `raw` is the series `playSmooth` plays through.
      freq: { ...FREQ, raw: [3, 5, 7] },
      panning: ONE_COLUMN,
      isContinuous: true,
    }),
  },
  {
    name: 'a point with no value to pitch',
    state: stateWith({ freq: { ...FREQ, raw: Number.NaN }, panning: ONE_COLUMN }),
  },
];

describe('audioService panning of a trace with no horizontal extent', () => {
  let ctx: MockAudioContext;

  let AudioServiceClass: new (...args: never[]) => { update: (s: PlotState) => void; dispose: () => void };

  beforeEach(async () => {
    jest.useFakeTimers();
    ctx = installAudioContextMock();
    ({ AudioService: AudioServiceClass } = await import('@service/audio') as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Plays one state and reports where each tone it produced sounded from.
   * @param state - The trace state to hand to update()
   * @returns One pan value per tone, in build order
   */
  function pansFor(state: PlotState): number[] {
    // The mock context outlives a single service, so an earlier call's tones
    // would otherwise still be sitting at index 0 and every reading below
    // would be of the wrong tone.
    ctx.panners.length = 0;
    const service = new (AudioServiceClass as never as new (
      n: NotificationService,
      s: SettingsService,
      i: PlotState,
    ) => { update: (s: PlotState) => void; dispose: () => void })(
      createNotification(),
      createSettings(),
      INITIAL_STATE,
    );
    service.update(state);
    jest.advanceTimersByTime(PAST_THE_TONES_MS);
    const pans = ctx.panners.map(panner => panner.pan.value);
    service.dispose();
    return pans;
  }

  it('centres a one-column trace instead of pinning it to the left', () => {
    const pans = pansFor(pointAt(1));

    expect(pans.length).toBeGreaterThan(0);
    expect(pans[0]).toBeCloseTo(CENTRE);
  });

  it('keeps a one-column trace apart from the left edge of a wide one', () => {
    // Both points sit at column 0. Before the fix they were the same sound:
    // a horizontal bar chart was indistinguishable from a reader parked on
    // the leftmost bar of a wide chart, and it stayed there for every bar.
    const single = pansFor(pointAt(1));
    const leftmostOfWide = pansFor(pointAt(3, 0));

    expect(leftmostOfWide[0]).toBeCloseTo(HARD_LEFT);
    expect(single[0]).not.toBeCloseTo(leftmostOfWide[0]);
  });

  it('centres a trace that reports no columns at all', () => {
    // Several traces fall back to `cols: 0` for a row they cannot measure.
    // `interpolate(0, 0, -1, -1, 1)` is hard left too, so the guard has to
    // cover the whole degenerate range rather than the exact value 1.
    const pans = pansFor(pointAt(0));

    expect(pans.length).toBeGreaterThan(0);
    expect(pans[0]).toBeCloseTo(CENTRE);
  });

  it('still spreads a wide trace across the whole stereo field', () => {
    // The guard must not flatten a chart that does have a horizontal extent:
    // centring everything would silence the positional cue this exists for.
    expect(pansFor(pointAt(3, 0))[0]).toBeCloseTo(HARD_LEFT);
    expect(pansFor(pointAt(3, 1))[0]).toBeCloseTo(CENTRE);
    expect(pansFor(pointAt(3, 2))[0]).toBeCloseTo(HARD_RIGHT);
  });

  describe.each(TONE_PATHS)('$name', ({ state }) => {
    it('sounds from the centre when the trace has one column', () => {
      // All six tone paths read the same mapping, so a fix applied to the
      // data tone alone would leave a reader on a gap, a zero or a glide
      // still hearing the chart from the left.
      const pans = pansFor(state);

      expect(pans.length).toBeGreaterThan(0);
      pans.forEach(pan => expect(pan).toBeCloseTo(CENTRE));
    });
  });
});
