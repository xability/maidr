/**
 * Tests for the AudioService data-tone path on a suspended AudioContext.
 *
 * The context is constructed when the controller is built, which happens from
 * a timeout after focus-in. When that focus is programmatic — a screen
 * reader's virtual cursor, `autofocus`, a host page calling `.focus()` — the
 * context is created `suspended` and its clock is frozen at 0, so a tone
 * scheduled against it is never heard. The cue paths (empty, warning, menu)
 * already defer behind `resume()`; the data tones every arrow key plays must
 * do the same, and must play exactly once when it settles.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls (the visible side
 * effect), mirroring test/service/audio.emptyTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';

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
  resumeCalls: number;
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

/**
 * Installs a global AudioContext mock in the requested initial state.
 * `resume()` flips the state only when the returned promise settles, the way
 * a real context does, so a cue requested while suspended is still suspended
 * at the moment it is requested.
 * @param state - Initial context state
 * @returns The single context every `new AudioContext()` returns
 */
function installAudioContextMock(state: string = 'running'): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state,
    destination: {},
    oscillators: [],
    resumeCalls: 0,
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    createStereoPanner: makePanner,
    createDynamicsCompressor: makeCompressor,
    resume() {
      this.resumeCalls += 1;
      return Promise.resolve().then(() => {
        this.state = 'running';
      });
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
 * A populated single-bar trace state carrying the given magnitude.
 * @param raw - The magnitude the bar reports
 * @returns A non-empty trace state for update()
 */
function barState(raw: number): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: 'bar',
    audio: {
      freq: { min: 40, max: 120, raw },
      panning: { x: 0, y: 0, rows: 1, cols: 1 },
    },
  } as unknown as PlotState;
}

describe('audioService data tones on a suspended context', () => {
  it('plays a data tone straight away when the context is already running', async () => {
    const ctx = installAudioContextMock('running');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(barState(60));

    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.resumeCalls).toBe(0);
    service.dispose();
  });

  it('resumes a suspended context and plays the data tone once it is running', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(barState(60));

    // Nothing yet: scheduling against a frozen clock would start and stop the
    // oscillator at the same instant, so the point would simply be silent.
    expect(ctx.oscillators.length).toBe(0);
    expect(ctx.resumeCalls).toBe(1);

    // Two microtask hops: the state flip, then the deferred scheduling.
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.state).toBe('running');
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    service.dispose();
  });

  it('plays a deferred data tone exactly once', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(barState(60));
    await Promise.resolve();
    await Promise.resolve();
    const afterResume = ctx.oscillators.length;

    // A second point on the now-running context adds one more tone's worth of
    // oscillators, not two: the deferred first tone must not replay.
    service.update(barState(90));

    expect(ctx.oscillators.length).toBe(afterResume * 2);
    service.dispose();
  });

  it('drops a data tone still waiting on resume() when audio is toggled off', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(barState(60));
    service.toggle(); // SEPARATE -> OFF during the async resume() gap

    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.oscillators.length).toBe(0);
    service.dispose();
  });

  it('drops a data tone still waiting on resume() when the service is disposed', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(barState(60));
    service.dispose();

    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.oscillators.length).toBe(0);
  });
});
