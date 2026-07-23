/**
 * Tests for AudioService.playSubplotEnterTone / playSubplotExitTone — the
 * multi-panel lobby enter/exit cues. Each is a short three-note arpeggio, so a
 * successful cue creates exactly three oscillators.
 *
 * Also pins the "no double sound on exit" invariant the new UX relies on:
 * exitSubplot() re-notifies AudioService with a (non-empty) figure state, which
 * must NOT play a data tone — otherwise the falling exit cue would be followed
 * by an unexpected data tone in the same tick.
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator calls, mirroring
 * test/service/audio.menuTone.test.ts.
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
    createStereoPanner: () => ({ pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() }),
    createDynamicsCompressor: () => ({
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    }),
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

describe('AudioService subplot enter/exit cues', () => {
  it('playSubplotEnterTone creates three oscillators (a rising arpeggio)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playSubplotEnterTone();

    expect(ctx.oscillators.length).toBe(before + 3);
    service.dispose();
  });

  it('playSubplotExitTone creates three oscillators (a falling arpeggio)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playSubplotExitTone();

    expect(ctx.oscillators.length).toBe(before + 3);
    service.dispose();
  });

  it('plays no cue when audio mode is OFF', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    service.toggle(); // SEPARATE -> OFF

    const before = ctx.oscillators.length;
    service.playSubplotEnterTone();
    service.playSubplotExitTone();

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('update() with a figure state plays no data tone (no double sound on exit)', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    // exitSubplot() re-notifies AudioService with the (non-empty) figure state.
    service.update({ empty: false, type: 'figure' } as unknown as PlotState);

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });
});
