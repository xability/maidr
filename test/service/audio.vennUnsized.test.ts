/**
 * Tests what the AudioService sounds for a Venn diagram that sizes some
 * regions and not others (issue #1416). VennTrace gives such a diagram's
 * unsized region the magnitude NaN, so its audio state carries
 * `freq.raw: NaN`. That must reach the oscillators as the empty tone — the
 * gap cue bars already use — and never as a NaN frequency, which Web Audio
 * rejects or plays as garbage.
 *
 * The state comes from a real VennTrace rather than a hand-written literal,
 * so a change to how the model reports an unsized region is caught here too.
 * AudioContext doesn't exist in the node test environment, so a minimal
 * global mock records the oscillators, as test/service/audio.emptyTone.test.ts
 * does.
 */
import type { VennTrace } from '@model/venn';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { MaidrLayer, VennPoint } from '@type/grammar';
import type { PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const EMPTY_TONE_OSCILLATORS = 5; // one per harmonic frequency

interface MockOscillator {
  frequency: {
    value: number;
    setValueAtTime: jest.Mock;
    exponentialRampToValueAtTime: jest.Mock;
    setValueCurveAtTime: jest.Mock;
  };
  type: string;
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

function makeParam(): unknown {
  return {
    value: 0,
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  };
}

function installAudioContextMock(): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state: 'running',
    destination: {},
    oscillators: [],
    createOscillator() {
      const osc = {
        type: '',
        frequency: makeParam(),
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as MockOscillator;
      this.oscillators.push(osc);
      return osc;
    },
    createGain: () => ({ gain: makeParam(), connect: jest.fn(), disconnect: jest.fn() }),
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

function createSettings(): SettingsService {
  return {
    get: <T>() => 100 as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/** Two sized sets whose overlap declares no size. */
const PARTLY_SIZED: VennPoint[] = [
  { sets: ['A'], size: 10 },
  { sets: ['B'], size: 6 },
  { sets: ['A', 'B'], label: 'Both' },
];

/**
 * Builds an entered Venn trace on its first set.
 * @returns The trace
 */
function partlySizedVenn(): VennTrace {
  const layer: MaidrLayer = { id: 'venn', type: TraceType.VENN, title: 'Partly sized', data: PARTLY_SIZED };
  const trace = TraceFactory.create(layer) as VennTrace;
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Every finite-or-not frequency handed to the oscillators created so far.
 * @param oscillators - The recorded oscillators
 * @returns Their frequencies, by value and by scheduled automation
 */
function frequenciesOf(oscillators: MockOscillator[]): number[] {
  return oscillators.flatMap(osc => [
    osc.frequency.value,
    ...osc.frequency.setValueAtTime.mock.calls.map(call => call[0] as number),
    ...osc.frequency.exponentialRampToValueAtTime.mock.calls.map(call => call[0] as number),
  ]);
}

describe('AudioService on a Venn diagram with an unsized region', () => {
  it('the model reports the unsized overlap as raw NaN', () => {
    const trace = partlySizedVenn();
    trace.moveOnce('DOWNWARD');
    const state = trace.state;
    if (state.empty || state.type !== 'trace') {
      throw new Error('Expected a populated trace state');
    }
    expect(state.audio.freq.raw).toBeNaN();
  });

  it('sounds the unsized overlap as the empty tone, with no NaN frequency', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    const trace = partlySizedVenn();
    trace.moveOnce('DOWNWARD');

    const before = ctx.oscillators.length;
    service.update(trace.state);

    const played = ctx.oscillators.slice(before);
    expect(played).toHaveLength(EMPTY_TONE_OSCILLATORS);
    expect(frequenciesOf(played).every(Number.isFinite)).toBe(true);
    service.dispose();
  });

  it('still pitches a sized set of the same diagram', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    const trace = partlySizedVenn();

    const before = ctx.oscillators.length;
    service.update(trace.state);

    // One oscillator for a single pitched tone, not the five-harmonic cue.
    const played = ctx.oscillators.slice(before);
    expect(played).toHaveLength(1);
    expect(frequenciesOf(played).every(value => Number.isFinite(value) && value > 0)).toBe(true);
    service.dispose();
  });
});
