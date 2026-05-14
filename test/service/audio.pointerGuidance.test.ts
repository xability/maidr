/**
 * Tests for AudioService.playPointerGuidance covering rate-limiting,
 * mode handling, and the on-curve bypass.
 *
 * AudioContext doesn't exist in the node test environment, so we install
 * a minimal global mock that records `createOscillator` calls. That count
 * acts as the visible side effect for guidance beep attempts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState, PointerGuidanceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';

interface MockOscillator {
  type: string;
  frequency: { value: number };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

interface MockGain {
  gain: {
    value: number;
    setValueAtTime: jest.Mock;
    exponentialRampToValueAtTime: jest.Mock;
    linearRampToValueAtTime: jest.Mock;
    setValueCurveAtTime: jest.Mock;
  };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockPanner {
  pan: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockCompressor {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  oscillators: MockOscillator[];
  createOscillator: () => MockOscillator;
  createGain: () => MockGain;
  createStereoPanner: () => MockPanner;
  createDynamicsCompressor: () => MockCompressor;
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

function makeGain(): MockGain {
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

function makePanner(): MockPanner {
  return {
    pan: { value: 0 },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeCompressor(): MockCompressor {
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
    close: jest.fn(),
  };
  (globalThis as any).AudioContext = function () {
    return ctx;
  };
  return ctx;
}

function createSettings(): SettingsService {
  return {
    get: <T>(_key: string) => 100 as unknown as T,
    onChange: jest.fn(),
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = {
  empty: true,
  type: 'figure',
};

const OFF_CURVE: PointerGuidanceState = {
  onCurve: false,
  distancePx: 25,
  cursorVerticalPosition: 'above',
  cursorHorizontalPosition: 'left',
};

describe('AudioService.playPointerGuidance', () => {
  test('skips beep when audio mode is OFF', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    service.toggle(); // SEPARATE -> OFF

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(oscillatorsBefore);
    service.dispose();
  });

  test('skips beep when guidance is on-curve', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance({ ...OFF_CURVE, onCurve: true });

    expect(ctx.oscillators.length).toBe(oscillatorsBefore);
    service.dispose();
  });

  test('plays a beep for off-curve guidance', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(oscillatorsBefore + 1);
    service.dispose();
  });

  test('rate-limits subsequent beeps inside the throttle window', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // currentTime did not advance, so the throttle should still block.
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst);
    service.dispose();
  });

  test('emits another beep once currentTime advances past the throttle', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;
    ctx.currentTime = 5; // well past the longest configured interval

    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst + 1);
    service.dispose();
  });

  test('resets the throttle when called with null guidance', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // Reset, then call again without advancing the clock: the next beep
    // should fire because nextPointerGuidanceBeepAt was zeroed.
    service.playPointerGuidance(null);
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst + 1);
    service.dispose();
  });
});
