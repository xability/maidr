/**
 * Tests for the chord chain — the self-rescheduling timer that sounds one tone
 * per tick when a point carries several magnitudes (a scatter column, a grid
 * cell). Turning sound off must silence what is still queued, the way the echo
 * timers already do: the toggle announces "Sound is off" while the chain would
 * otherwise keep playing the point the reader has just muted.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls (the visible side
 * effect), mirroring test/service/audio.emptyTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

interface MockOscillator {
  type: string;
  frequency: { value: number; setValueAtTime: jest.Mock; exponentialRampToValueAtTime: jest.Mock };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  oscillators: MockOscillator[];
  createOscillator: () => MockOscillator;
  createGain: () => unknown;
  createStereoPanner: () => unknown;
  createDynamicsCompressor: () => unknown;
  resume: () => Promise<void>;
  close: () => void;
}

function makeOscillator(): MockOscillator {
  return {
    type: '',
    frequency: {
      value: 0,
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
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

function makePanner(): unknown {
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
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    createStereoPanner: makePanner,
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

function createSettings(): SettingsService {
  return {
    get: <T>(key: string) => (key === 'general.volume' ? 100 : 100) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

// One tone per 50 ms tick in SEPARATE mode.
const CHORD_TICK_MS = 50;

/**
 * A point carrying several magnitudes, which update() sounds as a chord.
 * `hasMultiPoints` stays false so the service keeps the SEPARATE mode that
 * staggers the tones; COMBINED plays them all on the same tick.
 * @param values - The magnitudes the point reports
 * @returns A non-empty trace state for update()
 */
function chordState(values: number[]): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'point',
    hasMultiPoints: false,
    audio: {
      freq: { min: 0, max: 100, raw: values },
      panning: { x: 0, y: 0, rows: 1, cols: 1 },
    },
  } as unknown as PlotState;
}

describe('audioService chord chain', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sounds one tone per tick while the chord plays out', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(chordState([10, 20, 30, 40, 50]));
    jest.advanceTimersByTime(CHORD_TICK_MS * 2 + 20);

    expect(ctx.oscillators.length).toBe(3);
    service.dispose();
  });

  it('stops sounding the rest of a chord once sound is turned off', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(chordState([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]));
    jest.advanceTimersByTime(CHORD_TICK_MS * 2 + 20);
    const sounded = ctx.oscillators.length;
    service.toggle(); // SEPARATE -> OFF, mid-chord

    jest.advanceTimersByTime(CHORD_TICK_MS * 20);

    expect(ctx.oscillators.length).toBe(sounded);
    service.dispose();
  });

  it('still plays a chord in full when sound stays on', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(chordState([10, 20, 30, 40, 50]));
    jest.advanceTimersByTime(CHORD_TICK_MS * 10);

    expect(ctx.oscillators.length).toBe(5);
    service.dispose();
  });
});
