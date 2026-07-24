/**
 * Tests for AudioService.playWarningTone / playWarningToneIfEnabled — the
 * boundary/invalid-state cue. A warning is two descending beeps, so a
 * successful cue creates exactly two oscillators. On a suspended AudioContext
 * (issue #641: before the first user gesture reaches the audio graph) the
 * warning is deferred behind resume() and plays once the context is running,
 * instead of being scheduled against currentTime === 0 and collapsing to a
 * stray beep when the context later resumes.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls (the visible side
 * effect), mirroring test/service/audio.menuTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';

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

describe('AudioService warning cue', () => {
  it('playWarningTone creates two oscillators (a descending two-beep warning)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playWarningTone();

    expect(ctx.oscillators.length).toBe(before + 2);
    service.dispose();
  });

  it('resumes a suspended AudioContext, then plays the warning (no stray beep)', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playWarningTone();

    // Nothing synchronously: scheduling start(0)/stop() against a still-suspended
    // context (currentTime === 0) would fire at an arbitrary later instant.
    expect(ctx.oscillators.length).toBe(before);

    // Flush the resume() microtask; the two beeps schedule once the context is
    // actually running.
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    expect(ctx.oscillators.length).toBe(before + 2);
    service.dispose();
  });

  it('plays no warning when volume is 0', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(0), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playWarningTone();

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('playWarningToneIfEnabled plays nothing when audio mode is OFF', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    service.toggle(); // SEPARATE -> OFF

    const before = ctx.oscillators.length;
    service.playWarningToneIfEnabled();

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('a warning queued while suspended supersedes a pending menu cue', async () => {
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
    service.playWarningTone();
    expect(ctx.oscillators.length).toBe(before);

    // The deferred slot is deliberately shared across cue types (last one
    // wins): after resume() settles (two microtask hops: the state flip, then
    // the deferred scheduling), only the newest cue — the warning's descending
    // 180 Hz pair — plays; the stale menu cue would otherwise stack on top of
    // it at the same start time.
    await Promise.resolve();
    await Promise.resolve();
    const frequencies = ctx.oscillators.slice(before).map(osc => osc.frequency.value);
    expect(frequencies).toHaveLength(2);
    expect(frequencies[0]).toBe(180);
    expect(frequencies[1]).toBeCloseTo(180 / 2 ** (1 / 12), 10);
    service.dispose();
  });

  it('drops a warning still waiting on resume() when the service is disposed', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playWarningTone();
    service.dispose();

    // The mock's close() does not flip the state, so only the dispose-time
    // cancellation of the pending cue prevents audio after disposal.
    await Promise.resolve();
    expect(ctx.oscillators.length).toBe(before);
  });
});
