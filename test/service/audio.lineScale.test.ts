/**
 * A multi-series line's tones, from the state the real trace emits.
 *
 * Every series is pitched on the range of the whole layer. A layer whose
 * values are all one value has a range of zero width, which
 * `MathUtil.interpolate` answers with the bottom of the register, so every
 * point plays a finite tone there, alone or in a chord, rather than a NaN
 * frequency.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls, mirroring
 * test/service/audio.dataTone.test.ts.
 */
import type { AbstractTrace } from '@model/abstract';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { LinePoint } from '@type/grammar';
import type { PlotState } from '@type/state';
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
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createBuffer: (_channels: number, frames: number) => ({
      getChannelData: () => new Float32Array(frames),
    }),
    createBufferSource: () => ({ buffer: null, connect: jest.fn(), start: jest.fn(), stop: jest.fn(), disconnect: jest.fn() }),
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
 * The frequencies the oscillators start at when a real line layer's point is
 * played: one for a lone tone, one per series for a chord.
 * @param data - One row per series
 * @param row - The series
 * @param col - The point along it
 * @returns The frequency of every oscillator started
 */
async function frequenciesAt(data: LinePoint[][], row: number, col: number): Promise<number[]> {
  const ctx = installAudioContextMock();
  const { AudioService } = await import('@service/audio');
  const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
  const trace = TraceFactory.create({
    id: 'flat',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  }) as unknown as AbstractTrace;

  service.update(trace.getStateAt(row, col));
  service.dispose();
  trace.dispose();

  return ctx.oscillators.map(osc => osc.frequency.value);
}

describe('a flat line layer through the audio service', () => {
  it('plays a lone tone at the bottom of the register', async () => {
    // Two flat segments of one value that share no point, so no chord.
    const data = [
      [{ x: 1, y: 5, z: 'Before' }, { x: 2, y: 5, z: 'Before' }],
      [{ x: 3, y: 5, z: 'After' }, { x: 4, y: 5, z: 'After' }],
    ];

    const frequencies = await frequenciesAt(data, 1, 0);

    expect(frequencies[0]).toBe(200);
  });

  it('plays a chord at the bottom of the register where the series meet', async () => {
    const data = [
      [{ x: 1, y: 5, z: 'A' }, { x: 2, y: 5, z: 'A' }],
      [{ x: 1, y: 5, z: 'B' }, { x: 2, y: 5, z: 'B' }],
    ];

    const frequencies = await frequenciesAt(data, 0, 1);

    expect(frequencies).toEqual([200, 200]);
  });
});
