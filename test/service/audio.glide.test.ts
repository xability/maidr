/**
 * Tests for AudioService's directional pitch glide (the candlestick delta
 * layer's above/below-line sonification).
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock. Critically, the oscillator's `frequency` mock mirrors
 * the Web Audio spec: `exponentialRampToValueAtTime` THROWS on a non-positive
 * target. That makes this a real regression guard for the `safeBase`/
 * `safeTarget` clamps — remove them and the negative-Min-Frequency test throws
 * exactly like the browser would.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';

interface MockParam {
  value: number;
  setValueAtTime: jest.Mock;
  exponentialRampToValueAtTime: jest.Mock;
  linearRampToValueAtTime: jest.Mock;
  setValueCurveAtTime: jest.Mock;
}

function makeParam(spec = false): MockParam {
  return {
    value: 0,
    setValueAtTime: jest.fn(),
    // Spec-faithful only for oscillator frequency: the real API throws when
    // the ramp target is <= 0. Other params (gain) are lenient.
    exponentialRampToValueAtTime: jest.fn((target: number) => {
      if (spec && !(target > 0)) {
        throw new RangeError('exponentialRampToValueAtTime: target must be > 0');
      }
    }) as jest.Mock,
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  };
}

interface MockOscillator {
  type: string;
  frequency: MockParam;
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

function makeOscillator(): MockOscillator {
  return {
    type: '',
    frequency: makeParam(true),
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeGain(): { gain: MockParam; connect: jest.Mock; disconnect: jest.Mock } {
  return { gain: makeParam(false), connect: jest.fn(), disconnect: jest.fn() };
}

function makePanner(): { pan: { value: number }; connect: jest.Mock; disconnect: jest.Mock } {
  return { pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
}

function makeCompressor(): Record<string, unknown> {
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

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  sampleRate: number;
  oscillators: MockOscillator[];
  createOscillator: () => MockOscillator;
  createGain: () => ReturnType<typeof makeGain>;
  createStereoPanner: () => ReturnType<typeof makePanner>;
  createDynamicsCompressor: () => Record<string, unknown>;
  close: jest.Mock;
}

function installAudioContextMock(): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state: 'running',
    destination: {},
    sampleRate: 44100,
    oscillators: [],
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    createStereoPanner: makePanner,
    createDynamicsCompressor: makeCompressor,
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

/** Settings stub returning fixed volume / min / max frequency. */
function createSettings(min: number, max: number, volume = 100): SettingsService {
  return {
    get: <T>(key: string): T => {
      const value
        = key === 'general.volume'
          ? volume
          : key === 'general.minFrequency'
            ? min
            : key === 'general.maxFrequency'
              ? max
              : 0;
      return value as unknown as T;
    },
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/** A trace audio state that routes through the glide path in update(). */
function glideState(glide: 'up' | 'down', raw: number): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'candlestick_delta',
    hasMultiPoints: false,
    audio: {
      freq: { min: 0, max: 3, raw },
      panning: { x: 0, y: 0, rows: 4, cols: 4 },
      glide,
    },
  } as unknown as PlotState;
}

const INITIAL_STATE = { empty: true, type: 'figure' } as unknown as PlotState;

describe('AudioService directional glide', () => {
  it('rises for above-line and falls for below-line points', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(200, 1000), INITIAL_STATE);

    service.update(glideState('up', 1.5)); // base 600 -> up
    let osc = ctx.oscillators[ctx.oscillators.length - 1];
    let base = osc.frequency.setValueAtTime.mock.calls[0][0] as number;
    let target = osc.frequency.exponentialRampToValueAtTime.mock.calls[0][0] as number;
    expect(osc.type).toBe('triangle');
    expect(target).toBeGreaterThan(base);

    service.update(glideState('down', 1.5)); // base 600 -> down
    osc = ctx.oscillators[ctx.oscillators.length - 1];
    base = osc.frequency.setValueAtTime.mock.calls[0][0] as number;
    target = osc.frequency.exponentialRampToValueAtTime.mock.calls[0][0] as number;
    expect(osc.type).toBe('sine');
    expect(target).toBeLessThan(base);

    service.dispose();
  });

  it('does not throw when a negative Min Frequency setting pushes the base pitch below zero', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    // A negative Min Frequency + a small |delta| interpolates to a negative
    // base pitch; without the clamp the frequency ramp would throw (as the
    // spec-faithful mock does) and abort update() mid-observer-chain.
    const service = new AudioService(createNotification(), createSettings(-100, 1000), INITIAL_STATE);

    expect(() => service.update(glideState('down', 0.001))).not.toThrow();

    const osc = ctx.oscillators[ctx.oscillators.length - 1];
    const target = osc.frequency.exponentialRampToValueAtTime.mock.calls[0][0] as number;
    const base = osc.frequency.setValueAtTime.mock.calls[0][0] as number;
    expect(target).toBeGreaterThan(0); // clamped to a positive value
    expect(base).toBeGreaterThan(0);

    service.dispose();
  });
});
