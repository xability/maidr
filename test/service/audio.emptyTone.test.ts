/**
 * Tests for the AudioService empty-state tone — the spatialized "null" sound
 * played from update() for empty/out-of-bounds navigation states. A successful
 * tone creates exactly five oscillators (one per harmonic). On a suspended
 * AudioContext (issue #644: before the first user gesture reaches the audio
 * graph) the tone is deferred behind resume() and plays once the context is
 * running, instead of being scheduled at currentTime === 0 and firing at an
 * arbitrary later instant, detached from the interaction that caused it.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls (the visible side
 * effect), mirroring test/service/audio.menuTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';

const EMPTY_TONE_OSCILLATORS = 5; // one per harmonic frequency

interface MockOscillator {
  type: string;
  frequency: { value: number };
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

function installAudioContextMock(state: string = 'running'): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state,
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
    // Simplification: state flips synchronously, though a real AudioContext
    // only transitions once the promise settles. Tests where that ordering
    // matters must override resume() with a deferred flip.
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
// An empty subplot state routes update() to the default-panning empty tone.
const EMPTY_SUBPLOT_STATE = { empty: true, type: 'subplot' } as unknown as PlotState;

describe('AudioService empty-state tone', () => {
  it('update() with an empty state plays the five-oscillator empty tone', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(EMPTY_SUBPLOT_STATE);

    expect(ctx.oscillators.length).toBe(before + EMPTY_TONE_OSCILLATORS);
    service.dispose();
  });

  it('resumes a suspended AudioContext, then plays the empty tone (no stray late tone)', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(EMPTY_SUBPLOT_STATE);

    // Nothing synchronously: scheduling start(0)/stop() against a still-suspended
    // context (currentTime === 0) would fire at an arbitrary instant on resume.
    expect(ctx.oscillators.length).toBe(before);

    // Flush the resume() microtask; the harmonics schedule once the context is
    // actually running.
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    expect(ctx.oscillators.length).toBe(before + EMPTY_TONE_OSCILLATORS);
    service.dispose();
  });

  it('does not resume a suspended context for a silent (volume 0) empty tone', async () => {
    const ctx = installAudioContextMock('suspended');
    let resumeCalls = 0;
    ctx.resume = () => {
      resumeCalls += 1;
      ctx.state = 'running';
      return Promise.resolve();
    };
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(0), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(EMPTY_SUBPLOT_STATE);

    await Promise.resolve();
    expect(resumeCalls).toBe(0);
    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('drops an empty tone still waiting on resume() when audio is toggled OFF', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(EMPTY_SUBPLOT_STATE);
    service.toggle(); // SEPARATE -> OFF during the async resume() gap

    await Promise.resolve();
    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('drops an empty tone still waiting on resume() when the service is disposed', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.update(EMPTY_SUBPLOT_STATE);
    service.dispose();

    // The mock's close() does not flip the state, so only the dispose-time
    // cancellation of the pending cue prevents audio after disposal.
    await Promise.resolve();
    expect(ctx.oscillators.length).toBe(before);
  });

  it('an empty tone queued while suspended supersedes a pending menu cue', async () => {
    const ctx = installAudioContextMock('suspended');
    // Like a real browser, flip the state only when resume() settles, so both
    // cues below are requested while the context is still suspended.
    ctx.resume = () => Promise.resolve().then(() => {
      ctx.state = 'running';
    });
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playMenuOpenTone();
    service.update(EMPTY_SUBPLOT_STATE);
    expect(ctx.oscillators.length).toBe(before);

    // The deferred slot is deliberately shared across cue types (last one
    // wins): after resume() settles (two microtask hops: the state flip, then
    // the deferred scheduling), only the newest cue — the five-harmonic empty
    // tone — plays; the stale menu cue is superseded.
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.oscillators.length).toBe(before + EMPTY_TONE_OSCILLATORS);
    service.dispose();
  });
});
