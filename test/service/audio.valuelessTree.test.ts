/**
 * What the AudioService sounds for a tree that declares no magnitude -- an
 * org chart, a mindmap, a kanban board. Every node was the empty tone, the
 * tone a refused move plays, so a step onto a node and a step off the edge of
 * the tree sounded alike. A node is now pitched by its shape, and the edge is
 * still the empty tone.
 *
 * The states come from a real TreemapTrace, so a change to how the model
 * pitches a pure hierarchy is caught here too. AudioContext doesn't exist in
 * the node test environment, so a minimal global mock records the
 * oscillators, as test/service/audio.vennUnsized.test.ts does.
 */
import type { TreemapTrace } from '@model/treemap';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { PlotState, TraceState } from '@type/state';
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
  // The default range, so two pitches can differ.
  const values: Record<string, number> = {
    'general.minFrequency': 200,
    'general.maxFrequency': 1000,
    'general.echoCount': 0,
  };
  return {
    get: <T>(key: string) => (values[key] ?? 100) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

/** An org chart: Ada leads Bo and Cy; Bo leads two teams, Cy one. */
const ORG: TreemapPoint[] = [
  { x: 'Ada' },
  { x: 'Bo', path: ['Ada'] },
  { x: 'Cy', path: ['Ada'] },
  { x: 'Engineering', path: ['Ada', 'Bo'] },
  { x: 'Design', path: ['Ada', 'Bo'] },
  { x: 'Finance', path: ['Ada', 'Cy'] },
];

/**
 * Builds an entered tree on its root.
 * @returns The trace
 */
function orgChart(): TreemapTrace {
  const layer: MaidrLayer = { id: 'org', type: TraceType.TREE, title: 'Org chart', data: ORG };
  const trace = TraceFactory.create(layer) as TreemapTrace;
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The oscillators one state sounds.
 * @param state - The state to sound
 * @returns The frequency of each oscillator it started
 */
async function sounded(state: PlotState): Promise<number[]> {
  const ctx = installAudioContextMock();
  const { AudioService } = await import('@service/audio');
  const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

  service.update(state);

  const frequencies = ctx.oscillators.flatMap(osc => [
    osc.frequency.value,
    ...osc.frequency.setValueAtTime.mock.calls.map(call => call[0] as number),
  ]);
  service.dispose();
  return frequencies;
}

describe('AudioService on a tree that declares no magnitude', () => {
  it('sounds a node as one pitched tone, not the empty tone', async () => {
    const frequencies = await sounded(orgChart().state);

    expect(frequencies.length).toBeGreaterThan(0);
    expect(new Set(frequencies).size).toBe(1);
    expect(frequencies.every(frequency => Number.isFinite(frequency) && frequency > 0)).toBe(true);
  });

  it('sounds two nodes of different shape at different pitches', async () => {
    const trace = orgChart();
    trace.moveOnce('DOWNWARD');
    const bo = await sounded(trace.state);
    trace.moveOnce('FORWARD');
    const cy = await sounded(trace.state);

    expect(bo[0]).not.toBe(cy[0]);
  });

  it('still sounds a refused move as the empty tone, so a step and the edge differ', async () => {
    const trace = orgChart();
    let boundary: TraceState | undefined;
    trace.addObserver({
      update: (state: TraceState) => {
        boundary = state;
      },
    });

    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(boundary?.empty).toBe(true);
    const frequencies = await sounded(boundary as TraceState);

    expect(frequencies).toHaveLength(EMPTY_TONE_OSCILLATORS);
  });
});
