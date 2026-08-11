/**
 * Tests for per-tone stereo panning of a chord — `AudioState.panX`.
 *
 * One navigation step can emit a chord whose tones sit at different x
 * positions: a 3D scatter ROW plays one note per point in that row. `panning.x`
 * stays the single representative slot every non-chord path reads, so the
 * per-tone slots travel beside it in `panX`, index-aligned with `freq.raw` and
 * read against the same `panning.cols`. Collapsing them onto `panning.x` would
 * saturate a whole row into one ear.
 *
 * The visible side effect of a tone's slot is the `pan.value` of the
 * StereoPannerNode it was built with — one per tone — so the mock collects
 * panners the way `audio.emptyTone.test.ts` collects oscillators. The chord is
 * chained through `setTimeout`, so fake timers stand in for the wall clock as
 * in `audio.echo.test.ts`.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock, mirroring test/service/audio.emptyTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Long enough for every tone of the chord to have been chained (50 ms apart at
// most) and played.
const PAST_THE_CHORD_MS = 500;

interface MockOscillator {
  type: string;
  frequency: { value: number };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

interface MockPanner {
  pan: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  oscillators: MockOscillator[];
  panners: MockPanner[];
  createOscillator: () => MockOscillator;
  createGain: () => unknown;
  createStereoPanner: () => MockPanner;
  createDynamicsCompressor: () => unknown;
  resume: () => Promise<void>;
  close: () => void;
}

function makeOscillator(): MockOscillator {
  return {
    type: '',
    frequency: { value: 0 },
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeGain(): unknown {
  return {
    gain: {
      value: 0,
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setValueCurveAtTime: jest.fn(),
    },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makePanner(): MockPanner {
  return { pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
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
  const ctx: MockAudioContext = {
    currentTime: 0,
    state: 'running',
    destination: {},
    oscillators: [],
    panners: [],
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    // One panner per tone, in the order the tones were built, so the recorded
    // pan.value of entry i is the stereo slot tone i sounded from.
    createStereoPanner() {
      const panner = makePanner();
      this.panners.push(panner);
      return panner;
    },
    createDynamicsCompressor: makeCompressor,
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

function createSettings(volume: number = 100): SettingsService {
  return {
    get: <T>(key: string) => (key === 'general.volume' ? volume : 100) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/**
 * A three-tone chord, as a 3D scatter ROW emits one: three magnitudes played
 * as a group, read against ten columns of stereo width.
 * @param panX - Per-tone stereo slots, omitted for a chord that has none
 * @param x - The single representative slot every non-chord path reads
 * @returns A non-empty trace state for update()
 */
function chordState(panX?: number[], x: number = 0): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'scatter',
    hasMultiPoints: true,
    audio: {
      freq: { min: 0, max: 10, raw: [1, 2, 3] },
      panning: { x, y: 0, rows: 1, cols: 10 },
      panX,
    },
  } as unknown as PlotState;
}

/**
 * The stereo slot each tone of the chord sounded from, in playback order.
 * @param ctx - The mock context the service played into
 * @returns One pan value per tone
 */
function pansOf(ctx: MockAudioContext): number[] {
  return ctx.panners.map(panner => panner.pan.value);
}

describe('audioService per-tone chord panning', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pans each tone of a chord to its own slot', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // Slots 0, 5 and 9 of ten columns: the left edge, near the middle, the
    // right edge — the spread a row of three scatter points would occupy.
    service.update(chordState([0, 5, 9]));
    jest.advanceTimersByTime(PAST_THE_CHORD_MS);

    const pans = pansOf(ctx);
    expect(pans).toHaveLength(3);
    // interpolate(slot, 0, cols - 1, -1, 1): hard left, just right of centre,
    // hard right.
    expect(pans[0]).toBeCloseTo(-1);
    expect(pans[1]).toBeCloseTo(1 / 9);
    expect(pans[2]).toBeCloseTo(1);
    // Distinct and in the order the points sit in, which is the whole point:
    // one ear per tone would carry no position at all.
    expect(pans[0]).toBeLessThan(pans[1]);
    expect(pans[1]).toBeLessThan(pans[2]);
    expect(new Set(pans).size).toBe(3);

    service.dispose();
  });

  it('falls back to the shared position for a tone past the end of panX', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // Two slots for three tones. The representative position sits at the
    // opposite edge, so a fallback cannot be mistaken for a supplied slot.
    service.update(chordState([9, 9], 0));
    jest.advanceTimersByTime(PAST_THE_CHORD_MS);

    const pans = pansOf(ctx);
    expect(pans).toHaveLength(3);
    expect(pans[0]).toBeCloseTo(1);
    expect(pans[1]).toBeCloseTo(1);
    expect(pans[2]).toBeCloseTo(-1);

    service.dispose();
  });

  it('keeps the single scalar pan on every tone of a chord with no panX', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // The common case — every non-scatter chord in the codebase — must sound
    // exactly as it did before per-tone slots existed.
    service.update(chordState(undefined, 5));
    jest.advanceTimersByTime(PAST_THE_CHORD_MS);

    const pans = pansOf(ctx);
    expect(pans).toHaveLength(3);
    expect(new Set(pans).size).toBe(1);
    expect(pans[0]).toBeCloseTo(1 / 9);

    service.dispose();
  });
});
