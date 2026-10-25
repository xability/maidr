/**
 * Tests for the chord a point several series share is sounded as: one tone
 * per series, at once. The chord is gated on the trace type, so a trace that
 * inherits the line's intersection detection but is left off the gate plays
 * the cursor's own tone alone -- which is what a ROC curve did at the corners
 * every curve shares, and where the rotor's intersection mode lands.
 *
 * The chord sounds where its point is, as every other data tone does. Its
 * tones were wired straight to the compressor, so it sounded in the centre
 * wherever the point was: series indexed to the same first value met at the
 * chart's left edge and were heard in the middle (#1464).
 *
 * AudioContext doesn't exist in the node test environment, so we install a
 * minimal global mock that records createOscillator and createStereoPanner
 * calls (the visible side effects), mirroring
 * test/service/audio.dataTone.test.ts and test/service/audio.panning.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { AudioState, PlotState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';

interface MockOscillator {
  type: string;
  frequency: { value: number; setValueAtTime: jest.Mock; exponentialRampToValueAtTime: jest.Mock };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

interface MockPanner {
  pan: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  oscillators: MockOscillator[];
  panners: MockPanner[];
  createOscillator: () => MockOscillator;
  createGain: () => unknown;
  createStereoPanner?: () => MockPanner;
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

function installAudioContextMock(): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state: 'running',
    destination: {},
    oscillators: [],
    panners: [],
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    createStereoPanner() {
      const panner: MockPanner = { pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
      this.panners.push(panner);
      return panner;
    },
    createDynamicsCompressor: makeCompressor,
    resume: () => Promise.resolve(),
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

function createSettings(): SettingsService {
  return {
    get: <T>(key: string) => (key === 'general.volume' ? 100 : 100) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/**
 * A tone one series sounds at a shared point. Every tone of the chord carries
 * the cursor's own column, as LineTrace's findIntersections gives it.
 * @param group - The series
 * @param col - The point's column
 * @param cols - The series' column count
 * @returns The audio state for that series' tone
 */
function toneFor(group: number, col = 0, cols = 2): AudioState {
  return {
    freq: { min: 0, max: 1, raw: 0 },
    panning: { x: col, y: group, rows: 3, cols },
    group,
  };
}

/**
 * A populated trace state at a point every listed series shares.
 * @param traceType - The trace's type
 * @param groups - The series at the point; one means the point is not shared
 * @param col - The point's column
 * @param cols - The series' column count
 * @returns A non-empty trace state for update()
 */
function stateAt(traceType: TraceType, groups: number[], col = 0, cols = 2): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType,
    audio: toneFor(groups[0], col, cols),
    ...(groups.length > 1 && { intersections: groups.map(group => toneFor(group, col, cols)) }),
  } as unknown as PlotState;
}

describe('audioService chord at a shared point', () => {
  const originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    (globalThis as { AudioContext?: unknown }).AudioContext = originalAudioContext;
  });

  it.each([TraceType.LINE, TraceType.STEP, TraceType.ROC])(
    'sounds one tone per %s series at once',
    async (traceType) => {
      const ctx = installAudioContextMock();
      const { AudioService } = await import('@service/audio');
      const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

      service.update(stateAt(traceType, [0, 1]));

      expect(ctx.oscillators).toHaveLength(2);
      expect(ctx.oscillators.map(osc => osc.frequency.value)).toEqual([
        ctx.oscillators[0].frequency.value,
        ctx.oscillators[0].frequency.value,
      ]);
      service.dispose();
    },
  );

  it('sounds the cursor\'s tone alone at a point no other series shares', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(stateAt(TraceType.ROC, [0]));

    expect(ctx.oscillators).toHaveLength(1);
    service.dispose();
  });

  it.each([
    ['the first column', 0, -1],
    ['the middle column', 6, 0],
    ['the last column', 12, 1],
  ])('sounds every tone of a chord at %s where that column is heard', async (_where, col, pan) => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(stateAt(TraceType.LINE, [0, 1, 2], col, 13));

    expect(ctx.oscillators).toHaveLength(3);
    expect(ctx.panners.map(panner => panner.pan.value)).toEqual([pan, pan, pan]);
    service.dispose();
  });

  it('hears a chord where a single series\' tone at the same column is heard', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(stateAt(TraceType.LINE, [0], 0, 13));
    const single = ctx.panners.map(panner => panner.pan.value);
    service.update(stateAt(TraceType.LINE, [0, 1, 2], 0, 13));
    const chord = ctx.panners.slice(single.length).map(panner => panner.pan.value);

    expect(single).toEqual([-1]);
    expect(chord).toEqual([-1, -1, -1]);
    service.dispose();
  });

  it('still sounds a chord, unpanned, where the browser has no stereo panner', async () => {
    const ctx = installAudioContextMock();
    delete ctx.createStereoPanner;
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    service.update(stateAt(TraceType.LINE, [0, 1], 0, 13));

    expect(ctx.oscillators).toHaveLength(2);
    service.dispose();
  });
});
