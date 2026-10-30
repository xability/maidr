/**
 * Tests for when a value of exactly 0 plays the low "null" tone.
 *
 * The null tone (100 Hz, a triangle wave, below the whole register) marks a
 * zero magnitude: a bar of no height, an empty bin. It played for every 0,
 * so a 0 that is a position in the middle of a signed register -- a median of
 * 0 in a band from -1.5 to 1.6, a contour point at a Northing of 0 -- sounded
 * below the register's minimum, and a sleep stage coded 0 sounded like a
 * missing value rather than one step below the stage coded 1. A bar of 0 is
 * no bar whatever the other bars hold, and keeps the null tone.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls, mirroring
 * test/service/audio.dataTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { MaidrLayer } from '@type/grammar';
import type { AudioState, PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

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
  sampleRate: number;
  state: string;
  destination: object;
  oscillators: MockOscillator[];
  bufferSources: number;
  createOscillator: () => MockOscillator;
  createBuffer: (channels: number, frames: number) => unknown;
  createBufferSource: () => unknown;
  createBiquadFilter: () => unknown;
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

function makeNode(): unknown {
  return {
    pan: { value: 0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

/**
 * Installs a running global AudioContext mock.
 * @returns The single context every `new AudioContext()` returns
 */
function installAudioContextMock(): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: {},
    oscillators: [],
    bufferSources: 0,
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createBuffer: (_channels: number, frames: number) => ({
      getChannelData: () => new Float32Array(frames),
    }),
    createBufferSource() {
      this.bufferSources += 1;
      return { buffer: null, connect: jest.fn(), start: jest.fn(), stop: jest.fn(), disconnect: jest.fn() };
    },
    createBiquadFilter: () => ({
      type: '',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    }),
    createGain: makeGain,
    createStereoPanner: makeNode,
    createDynamicsCompressor: makeNode,
    resume: () => Promise.resolve(),
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

/** Settings with the default 200 to 1000 Hz register. */
function createSettings(): SettingsService {
  const values: Record<string, number> = {
    'general.minFrequency': 200,
    'general.maxFrequency': 1000,
  };
  return {
    get: <T>(key: string) => (values[key] ?? 100) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/**
 * A line point's state.
 * @param audio - What the point is heard as, past its panning
 * @returns A non-empty trace state for update()
 */
function pointState(audio: Omit<AudioState, 'panning'>): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'line',
    audio: { ...audio, panning: { x: 0, y: 0, rows: 1, cols: 2 } },
  } as unknown as PlotState;
}

/**
 * What a state starts: its first oscillator -- the tone's own, before any
 * harmonic -- and how many click buffers.
 * @param state - The state to play
 * @returns The oscillator's wave type and frequency, and the clicks
 */
async function toneOf(
  state: PlotState,
): Promise<{ type: string | undefined; frequency: number | undefined; clicks: number }> {
  const ctx = installAudioContextMock();
  const { AudioService } = await import('@service/audio');
  const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

  service.update(state);
  service.dispose();

  const [oscillator] = ctx.oscillators;
  return { type: oscillator?.type, frequency: oscillator?.frequency.value, clicks: ctx.bufferSources };
}

/**
 * The state a real trace gives the point at a cell.
 * @param type - The layer type
 * @param data - The layer's data
 * @param col - The point
 * @returns The trace state
 */
function stateOf(type: TraceType, data: MaidrLayer['data'], col: number): PlotState {
  const trace = TraceFactory.create({ id: 'zero', type, axes: { x: { label: 'X' }, y: { label: 'Y' } }, data });
  return (trace as unknown as { getStateAt: (row: number, col: number) => PlotState }).getStateAt(0, col);
}

const SIGNED = [{ x: 'a', y: -5 }, { x: 'b', y: 0 }, { x: 'c', y: 5 }];

describe('a value of 0', () => {
  it('is pitched where it lies when it is a position in a register that runs below zero', async () => {
    // A median of 0 in a band from -1.5 to 1.6: 1.5 / 3.1 of the way up.
    const tone = await toneOf(pointState({ freq: { min: -1.5, max: 1.6, raw: 0 }, positional: true }));

    expect(tone.frequency).toBeCloseTo(200 + (1.5 / 3.1) * 800);
  });

  it('is pitched as the lowest level when it is an ordinal code', async () => {
    // A hypnogram's N3, coded 0 below N2's 1 on a scale of 0 to 4.
    const tone = await toneOf(pointState({ freq: { min: 0, max: 4, raw: 0 }, positional: true, ordinal: true }));

    expect(tone.frequency).toBe(200);
  });

  it('still plays the null tone where it is a position at the bottom of the register', async () => {
    const tone = await toneOf(pointState({ freq: { min: 0, max: 10, raw: 0 }, positional: true }));

    expect(tone).toMatchObject({ type: 'triangle', frequency: 100 });
  });

  it('still plays the null tone where it is a magnitude, even among negative values', async () => {
    // A bar of 0 is no bar, whatever the bars either side of it hold.
    const tone = await toneOf(pointState({ freq: { min: -5, max: 5, raw: 0 } }));

    expect(tone).toMatchObject({ type: 'triangle', frequency: 100 });
  });

  it('still plays the null tone where the register is not finite', async () => {
    const tone = await toneOf(pointState({ freq: { min: Number.NaN, max: 5, raw: 0 }, positional: true }));

    expect(tone).toMatchObject({ type: 'triangle', frequency: 100 });
  });

  it('still clicks where a trace marks its zeros with a click, in a register that runs below zero', async () => {
    const tone = await toneOf(pointState({ freq: { min: -3, max: 3, raw: 0 }, positional: true, zeroClick: true }));

    expect(tone).toEqual({ type: undefined, frequency: undefined, clicks: 1 });
  });
});

describe('a value of 0 read from a real trace', () => {
  it('is pitched mid-register on a line through negative and positive values', async () => {
    const tone = await toneOf(stateOf(TraceType.LINE, [SIGNED], 1));

    expect(tone.frequency).toBe(600);
  });

  it('plays the null tone for a bar of 0 among negative and positive bars', async () => {
    const tone = await toneOf(stateOf(TraceType.BAR, SIGNED, 1));

    expect(tone).toMatchObject({ type: 'triangle', frequency: 100 });
  });
});
