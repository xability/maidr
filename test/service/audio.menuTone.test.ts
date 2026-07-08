/**
 * Tests for AudioService.playMenuOpenTone / playMenuCloseTone — the Go-To modal
 * open/close cues. Each cue is a short two-note arpeggio, so a successful cue
 * creates exactly two oscillators. The cue must be silent when audio is OFF,
 * when the volume is 0, or when the AudioContext is still suspended.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls (the visible side
 * effect), mirroring test/service/audio.pointerGuidance.test.ts.
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

describe('AudioService menu open/close cues', () => {
  it('playMenuOpenTone creates two oscillators (a rising two-note arpeggio)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playMenuOpenTone();

    expect(ctx.oscillators.length).toBe(before + 2);
    service.dispose();
  });

  it('playMenuCloseTone creates two oscillators (a falling two-note arpeggio)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playMenuCloseTone();

    expect(ctx.oscillators.length).toBe(before + 2);
    service.dispose();
  });

  it('plays no cue when audio mode is OFF', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    service.toggle(); // SEPARATE -> OFF

    const before = ctx.oscillators.length;
    service.playMenuOpenTone();
    service.playMenuCloseTone();

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('plays no cue when volume is 0', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(0), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playMenuOpenTone();

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('plays no cue while the AudioContext is suspended (avoids a beep on resume)', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playMenuOpenTone();

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('schedules each arpeggio note\'s cleanup after the note finishes (no truncation)', async () => {
    installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    // Record the cleanup-timer delays scheduled by the two menu beeps.
    const delays: number[] = [];
    const spy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((_fn: unknown, ms?: number) => {
      delays.push(ms ?? 0);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    service.playMenuOpenTone();
    spy.mockRestore();

    // Two notes: note 0 stops at 60 ms, note 1 starts at 110 ms and stops at
    // 170 ms. Each note's disconnect timer must fire AFTER the note stops, or
    // the tone is cut off (the bug this guards). Sorted ascending, both delays
    // must clear their respective stop times.
    expect(delays.length).toBe(2);
    const sorted = [...delays].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThanOrEqual(60);
    expect(sorted[1]).toBeGreaterThanOrEqual(170);
    service.dispose();
  });
});
