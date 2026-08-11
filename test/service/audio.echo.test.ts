/**
 * Tests for the 3D echo sonification: the train of echoes a point with a
 * `zIntensity` produces, and the tail arithmetic autoplay paces itself by.
 *
 * Echoes are queued with `setTimeout`, so the visible side effect of one
 * sounding is a fresh `createOscillator` call after the timers advance — the
 * same counting trick as `audio.emptyTone.test.ts`, with fake timers standing
 * in for the wall clock. `echoTailMs` is exported precisely so the arithmetic
 * can be checked without an `AudioContext` at all.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock, mirroring test/service/audio.glide.test.ts. Echo tones
 * additionally run through a convolver, so this mock adds `createConvolver`,
 * `createBuffer` and the `sampleRate` the impulse response is built from.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// The defaults the settings dialog ships, restated here so the expected echo
// counts below are readable arithmetic rather than derived constants.
const ECHO_COUNT = 5;
const ECHO_VOLUME = 50; // percent of the main tone at the conceptual last echo
const ECHO_DURATION = 0.3; // seconds between successive echoes

// Long enough for every echo of a full z = 1 train (5 * 300 ms) to have fired.
const PAST_THE_TAIL_MS = 2000;

interface MockParam {
  value: number;
  setValueAtTime: jest.Mock;
  exponentialRampToValueAtTime: jest.Mock;
  linearRampToValueAtTime: jest.Mock;
  setValueCurveAtTime: jest.Mock;
}

function makeParam(): MockParam {
  return {
    value: 0,
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  };
}

interface MockGain {
  gain: MockParam;
  connect: jest.Mock;
  disconnect: jest.Mock;
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
    frequency: makeParam(),
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeGain(): MockGain {
  return { gain: makeParam(), connect: jest.fn(), disconnect: jest.fn() };
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

interface MockAudioBuffer {
  getChannelData: (channel: number) => Float32Array;
}

interface MockConvolver {
  buffer: MockAudioBuffer | null;
  connect: jest.Mock;
  disconnect: jest.Mock;
}

function makeConvolver(): MockConvolver {
  return { buffer: null, connect: jest.fn(), disconnect: jest.fn() };
}

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  sampleRate: number;
  oscillators: MockOscillator[];
  convolvers: MockConvolver[];
  createOscillator: () => MockOscillator;
  createGain: () => MockGain;
  createStereoPanner: () => ReturnType<typeof makePanner>;
  createDynamicsCompressor: () => Record<string, unknown>;
  createConvolver: () => MockConvolver;
  createBuffer: (channels: number, length: number, rate: number) => MockAudioBuffer;
  close: jest.Mock;
}

function installAudioContextMock(): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state: 'running',
    destination: {},
    // A real rate, so the synthetic impulse response is built at the size the
    // browser would build it at.
    sampleRate: 44100,
    oscillators: [],
    convolvers: [],
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    createStereoPanner: makePanner,
    createDynamicsCompressor: makeCompressor,
    createConvolver() {
      const convolver = makeConvolver();
      this.convolvers.push(convolver);
      return convolver;
    },
    createBuffer(channels: number, length: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (channel: number) => data[channel] };
    },
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

interface EchoSettings {
  volume?: number;
  echoCount?: number;
  echoVolume?: number;
  echoDuration?: number;
}

/** Settings stub answering the volume, frequency-range and echo keys. */
function createSettings(overrides: EchoSettings = {}): SettingsService {
  const {
    volume = 100,
    echoCount = ECHO_COUNT,
    echoVolume = ECHO_VOLUME,
    echoDuration = ECHO_DURATION,
  } = overrides;
  const values: Record<string, number> = {
    'general.volume': volume,
    'general.echoCount': echoCount,
    'general.echoVolume': echoVolume,
    'general.echoDuration': echoDuration,
    'general.minFrequency': 200,
    'general.maxFrequency': 1000,
  };
  return {
    get: <T>(key: string): T => (values[key] ?? 0) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/**
 * A single scatter point routed through the scalar (non-chord) path of
 * update(): one pitched tone, then its echo train.
 * @param zIntensity - Normalized z, or undefined for a plain 2D point
 * @returns A non-empty trace state for update()
 */
function pointState(zIntensity?: number): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'scatter',
    hasMultiPoints: false,
    audio: {
      freq: { min: 0, max: 10, raw: 5 },
      panning: { x: 0, y: 0, rows: 1, cols: 1 },
      zIntensity,
    },
  } as unknown as PlotState;
}

/**
 * Peak level the ADSR envelope ramps this oscillator's own gain node to —
 * `this.volume * volumeScale`, which is what the echo ladder sets.
 * @param osc - An oscillator recorded by the mock context
 * @returns The target of the envelope's first linear ramp
 */
function peakGainOf(osc: MockOscillator): number {
  // playOscillator connects each oscillator to its envelope gain node first,
  // so the connect target is that node.
  const gain = osc.connect.mock.calls[0][0] as MockGain;
  return gain.gain.linearRampToValueAtTime.mock.calls[0][0] as number;
}

describe('audioService 3D echo sonification', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the wall-clock length of an echo tail, and none without echoes', async () => {
    const { echoTailMs } = await import('@service/audio');

    // 5 echoes * 300 ms + the last echo's own 300 ms note + its full 300 ms
    // reverb tail (position 5 of a configured max of 5).
    expect(echoTailMs(5, ECHO_COUNT, ECHO_DURATION)).toBe(2100);
    // 2 echoes: the reverb term shrinks with position, to 2/5 of 300 ms.
    expect(echoTailMs(2, ECHO_COUNT, ECHO_DURATION)).toBe(1020);
    // Nothing scheduled, so nothing for autoplay to wait on.
    expect(echoTailMs(0, ECHO_COUNT, ECHO_DURATION)).toBe(0);
    // Echoes turned off entirely: no tail, and no division by zero either.
    expect(echoTailMs(3, 0, ECHO_DURATION)).toBe(0);
  });

  it('schedules round(z * echoCount) echoes after the tone', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // z = 1 -> the full train of 5.
    const beforeFull = ctx.oscillators.length;
    service.update(pointState(1));
    expect(ctx.oscillators.length).toBe(beforeFull + 1); // the tone alone, so far

    jest.advanceTimersByTime(PAST_THE_TAIL_MS);
    expect(ctx.oscillators.length).toBe(beforeFull + 1 + 5);

    // z = 0.5 -> 2.5 echoes, rounded up to 3 rather than truncated to 2.
    const beforeHalf = ctx.oscillators.length;
    service.update(pointState(0.5));
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);
    expect(ctx.oscillators.length).toBe(beforeHalf + 1 + 3);

    service.dispose();
  });

  it('schedules no echoes for a point with no z (a plain 2D trace)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(pointState(undefined));
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);

    // The pitched tone and nothing after it — a 2D plot must sound exactly as
    // it did before the feature existed.
    expect(ctx.oscillators.length).toBe(before + 1);
    expect(ctx.convolvers).toHaveLength(0);

    service.dispose();
  });

  it('schedules no echoes when the echo count setting is 0', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(
      createNotification(),
      createSettings({ echoCount: 0 }),
      INITIAL_STATE,
    );

    const before = ctx.oscillators.length;
    service.update(pointState(1)); // fully 3D point, echoes turned off
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);

    expect(ctx.oscillators.length).toBe(before + 1);

    service.dispose();
  });

  it('pins echo volume to position, not to how many echoes play', async () => {
    const shortCtx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const shortService = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // z = 0.4 -> exactly 2 echoes.
    shortService.update(pointState(0.4));
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);
    // [tone, echo 1, echo 2]
    expect(shortCtx.oscillators).toHaveLength(3);
    const secondOfTwo = peakGainOf(shortCtx.oscillators[2]);
    shortService.dispose();

    const longCtx = installAudioContextMock();
    const longService = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // z = 1 -> 5 echoes, of which the second must sound identical to above.
    longService.update(pointState(1));
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);
    expect(longCtx.oscillators).toHaveLength(6);
    const secondOfFive = peakGainOf(longCtx.oscillators[2]);

    expect(secondOfTwo).toBe(secondOfFive);
    // Position 2 of a configured max of 5, lerped from 1.0 to echoVolume 0.5.
    expect(secondOfFive).toBe(0.8);
    // The ladder still descends: quieter than the original tone, louder than
    // the fifth echo, which lands on echoVolume itself.
    expect(secondOfFive).toBeLessThan(peakGainOf(longCtx.oscillators[0]));
    expect(secondOfFive).toBeGreaterThan(peakGainOf(longCtx.oscillators[5]));
    expect(peakGainOf(longCtx.oscillators[5])).toBe(0.5);

    longService.dispose();
  });

  it('cancels queued echoes when the next navigation arrives', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(pointState(1));
    jest.advanceTimersByTime(100); // mid-tail: no echo has fired yet
    expect(ctx.oscillators.length).toBe(before + 1);

    service.update(pointState(undefined)); // step to a point with no echoes
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);

    // Two tones and nothing else: the abandoned point's five queued echoes
    // must not bleed into the new one.
    expect(ctx.oscillators.length).toBe(before + 2);

    service.dispose();
  });

  it('cancels queued echoes on dispose', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(pointState(1));
    service.dispose();

    // The mock's close() does not flip the context state, so only the
    // dispose-time cancellation stops these firing against a closed context.
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);
    expect(ctx.oscillators.length).toBe(before + 1);
  });

  it('drops a queued echo when audio is toggled off mid-tail', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(pointState(1));
    jest.advanceTimersByTime(400); // the first echo has sounded
    expect(ctx.oscillators.length).toBe(before + 2);

    service.toggle(); // SEPARATE -> OFF, with four echoes still queued
    jest.advanceTimersByTime(PAST_THE_TAIL_MS);

    // The timers still fire; the re-check inside each one keeps them silent.
    expect(ctx.oscillators.length).toBe(before + 2);

    service.dispose();
  });

  it('exposes an echo-tail deadline only while a 3D point is sounding', async () => {
    installAudioContextMock();
    const { AudioService, echoTailMs } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // A 2D point schedules nothing, so autoplay is never asked to wait.
    service.update(pointState(undefined));
    expect(service.echoTailDeadline).toBe(0);

    service.update(pointState(1));
    expect(service.echoTailDeadline).toBeGreaterThan(Date.now());
    expect(service.echoTailDeadline).toBe(
      Date.now() + echoTailMs(5, ECHO_COUNT, ECHO_DURATION),
    );

    // The next navigation cancels the queue, so the deadline it left behind
    // has to go with it rather than stalling the following step.
    service.update(pointState(undefined));
    expect(service.echoTailDeadline).toBe(0);

    service.dispose();
  });
});
