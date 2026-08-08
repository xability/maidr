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
import { describe, expect, it, jest } from '@jest/globals';

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
    // `makeGain`/`makePanner`/`makeCompressor` are constructor functions:
    // every `ctx.createGain()` call invokes them fresh, so each consumer
    // gets its own gain node rather than sharing a singleton.
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

interface SettingsHandle {
  service: SettingsService;
  /** Fires a synthetic settings-change event so AudioService re-reads volume. */
  setVolume: (value: number) => void;
}

function createSettings(volume: number = 100): SettingsHandle {
  // Every settings lookup returns the same value — `general.volume` is the
  // only one that affects pointer-guidance assertions; min/max frequency
  // reads share the value but don't matter here.
  const state = { volume };
  let listener: ((event: { affectsSetting: (k: string) => boolean; get: <T>(k: string) => T }) => void) | null = null;
  const service = {
    get: <T>(key: string) => (key === 'general.volume' ? state.volume : 100) as unknown as T,
    onChange: (fn: typeof listener) => {
      listener = fn;
    },
  } as unknown as SettingsService;
  return {
    service,
    setVolume(value: number) {
      state.volume = value;
      listener?.({
        affectsSetting: (k: string) => k === 'general.volume',
        get: <T>(k: string) => (k === 'general.volume' ? value : 100) as unknown as T,
      });
    },
  };
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
  curveVertical: 'below',
  curveHorizontal: 'right',
};

describe('AudioService.playPointerGuidance', () => {
  it('skips beep when audio mode is OFF', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);
    service.toggle(); // SEPARATE -> OFF

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(oscillatorsBefore);
    service.dispose();
  });

  it('skips beep when guidance is on-curve', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance({ onCurve: true });

    expect(ctx.oscillators.length).toBe(oscillatorsBefore);
    service.dispose();
  });

  it('plays a beep for off-curve guidance', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(oscillatorsBefore + 1);
    service.dispose();
  });

  it('rate-limits subsequent beeps inside the throttle window', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // currentTime did not advance, so the throttle should still block.
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst);
    service.dispose();
  });

  it('emits another beep once currentTime advances past the throttle', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;
    ctx.currentTime = 5; // well past the longest configured interval

    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst + 1);
    service.dispose();
  });

  it('on-curve guidance does not reset throttle — prevents 60 Hz buzz at the boundary', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    // Arm the throttle with one off-curve beep.
    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // Cursor crosses the `isPointInBounds` boundary: on-curve event arrives,
    // then the next frame goes off-curve again. The on-curve event must NOT
    // zero the throttle; otherwise the next off-curve event would bypass the
    // rate limit and beep every animation frame.
    service.playPointerGuidance({ onCurve: true });
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst); // throttle still gates
    service.dispose();
  });

  it('resets the throttle when called with null guidance', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // Reset, then call again without advancing the clock: the next beep
    // should fire because nextPointerGuidanceBeepAt was zeroed.
    service.playPointerGuidance(null);
    service.playPointerGuidance(OFF_CURVE);

    expect(ctx.oscillators.length).toBe(afterFirst + 1);
    service.dispose();
  });

  it('out-of-range guidance does not reset throttle — prevents beep on every boundary crossing', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    // Fire one in-range beep so the throttle is armed.
    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // Send an out-of-range event (distancePx beyond the configured max).
    // The resolver returns null and the service must NOT reset the throttle;
    // otherwise the immediate-next in-range call would unblock and beep.
    const OUT_OF_RANGE: PointerGuidanceState = {
      onCurve: false,
      distancePx: 9999,
      curveVertical: 'below',
      curveHorizontal: 'right',
    };
    service.playPointerGuidance(OUT_OF_RANGE);
    expect(ctx.oscillators.length).toBe(afterFirst);

    // Re-enter range while currentTime is still inside the throttle window.
    service.playPointerGuidance(OFF_CURVE);
    expect(ctx.oscillators.length).toBe(afterFirst); // still throttled
    service.dispose();
  });

  it('volume=0 skips beep without consuming throttle slot', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    // Volume starts at 0, so playPointerGuidanceBeep returns early. The
    // throttle must NOT advance — otherwise turning volume back up would
    // silently delay the next beep until the would-be interval elapsed.
    const settings = createSettings(0);
    const service = new AudioService(createNotification(), settings.service, INITIAL_STATE);

    const oscillatorsBefore = ctx.oscillators.length;
    service.playPointerGuidance(OFF_CURVE);
    expect(ctx.oscillators.length).toBe(oscillatorsBefore); // no beep emitted

    // Turn volume back up without advancing currentTime. If the previous
    // call had armed the throttle, this call would be blocked. Because the
    // implementation only advances the throttle when a beep actually fires,
    // the gate is still open and this beep emits immediately.
    settings.setVolume(100);
    service.playPointerGuidance(OFF_CURVE);
    expect(ctx.oscillators.length).toBe(oscillatorsBefore + 1);
    service.dispose();
  });

  it('audio OFF does not reset throttle — preserves timing across mode toggles', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings().service, INITIAL_STATE);

    // Fire one beep so the throttle is armed.
    service.playPointerGuidance(OFF_CURVE);
    const afterFirst = ctx.oscillators.length;

    // Toggle audio OFF and call again — must not reset throttle.
    service.toggle();
    service.playPointerGuidance(OFF_CURVE);
    expect(ctx.oscillators.length).toBe(afterFirst); // no new oscillator while OFF

    // Toggle back ON without advancing currentTime. If the throttle was
    // (incorrectly) reset by the OFF call, this would fire a beep
    // immediately; preserving the throttle blocks it.
    service.toggle();
    service.playPointerGuidance(OFF_CURVE);
    expect(ctx.oscillators.length).toBe(afterFirst);
    service.dispose();
  });
});
