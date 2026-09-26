/**
 * @jest-environment jsdom
 */

/**
 * The WebMCP tools against a real model: every `target` that
 * `maidr_get_layer_data` hands out lands the reader, through
 * `maidr_navigate`, on the very point it came with -- including the layers
 * whose model does not keep the payload's order (a heatmap flips its rows, a
 * scatter sorts its points) and the horizontal bar family. And a move is
 * refused while a MAIDR dialog is open.
 *
 * Built on a real `Controller`, as `test/controller/navigateTo.test.ts` is,
 * with the Web Audio API and `hotkeys-js` stubbed at the boundary.
 */

import type { Keys } from '@type/event';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { LiveDataManager } from '@service/liveData';
import { buildWebMcpTools, TOOL_NAMES } from '@service/webMcp';
import { createMaidrStore } from '@state/store';
import { Orientation, TraceType } from '@type/grammar';
import { Controller } from '../../src/controller';

jest.mock('hotkeys-js', () => {
  const hotkeys = (): void => {};
  hotkeys.setScope = (): void => {};
  hotkeys.unbind = (): void => {};
  hotkeys.deleteScope = (): void => {};
  hotkeys.filter = (): boolean => true;
  hotkeys.getScope = (): string => '';
  return { __esModule: true, default: hotkeys };
});

/** A Web Audio node that accepts every call the audio service makes of it. */
function audioNode(): Record<string, unknown> {
  const param = {
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  };
  return {
    type: '',
    frequency: param,
    gain: param,
    pan: param,
    threshold: param,
    knee: param,
    ratio: param,
    attack: param,
    release: param,
    buffer: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };
}

/** A stand-in AudioContext, running from the start. */
function audioContext(): Record<string, unknown> {
  return {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    createOscillator: audioNode,
    createGain: audioNode,
    createStereoPanner: audioNode,
    createDynamicsCompressor: audioNode,
    createConvolver: audioNode,
    createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
    createBufferSource: audioNode,
    resume: () => Promise.resolve(),
    close: jest.fn(),
  };
}

const realStructuredClone = globalThis.structuredClone;

beforeAll(() => {
  globalThis.structuredClone = (<T>(value: T): T => JSON.parse(JSON.stringify(value)) as T) as typeof structuredClone;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext
    = function AudioContextStub(): Record<string, unknown> {
      return audioContext();
    } as unknown as typeof AudioContext;
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
});

let controller: Controller | null = null;

afterEach(() => {
  controller?.dispose();
  controller = null;
  document.body.innerHTML = '';
});

/** One entry of a `maidr_get_layer_data` page. */
interface Entry {
  group?: number;
  index: number;
  point: unknown;
  target?: Record<string, number>;
}

/**
 * A chart with one layer, the reader inside it, and the three tools over it.
 * @param layer - The layer
 * @returns The controller and the tools
 */
function chartWith(layer: MaidrLayer): { ctrl: Controller; tools: ReturnType<typeof buildWebMcpTools> } {
  const maidr: Maidr = { id: 'chart', subplots: [[{ layers: [layer] }]] };
  const plot = document.createElement('div');
  document.body.append(plot);
  const ctrl = new Controller(JSON.parse(JSON.stringify(maidr)) as Maidr, plot, createMaidrStore());
  controller = ctrl;
  const manager = new LiveDataManager();
  manager.register(
    maidr,
    jest.fn(),
    target => (target === null ? true : ctrl.navigateTo(target)),
    () => ({ inChart: true, position: ctrl.getPositionText(), blocked: ctrl.isNavigationBlocked() }),
  );
  let clock = 0;
  const tools = buildWebMcpTools(manager, () => (clock += 1000));
  return { ctrl, tools };
}

/**
 * Calls a tool by name.
 * @param tools - The tools
 * @param name - The tool name
 * @param input - The input
 * @returns The result
 */
async function call(
  tools: ReturnType<typeof buildWebMcpTools>,
  name: string,
  input: unknown,
): Promise<Record<string, unknown> & { content?: Record<string, unknown> }> {
  const found = tools.find(candidate => candidate.name === name);
  if (!found) {
    throw new Error(`no tool ${name}`);
  }
  return await found.execute(input, {}) as Record<string, unknown> & { content?: Record<string, unknown> };
}

const heatmap: MaidrLayer = {
  id: 'heat',
  type: TraceType.HEATMAP,
  axes: { x: { label: 'Column' }, y: { label: 'Row' } },
  data: {
    x: ['colA', 'colB', 'colC'],
    y: ['rowTop', 'rowMid', 'rowBottom'],
    points: [[11, 12, 13], [21, 22, 23], [31, 32, 33]],
  },
};

/**
 * A two-series bar-family layer: series Alpha and Beta over Mon and Tue.
 * @param type - The layer type
 * @param orientation - Which way the bars run
 * @returns The layer
 */
function segmented(type: TraceType, orientation: Orientation): MaidrLayer {
  const horizontal = orientation === Orientation.HORIZONTAL;
  const point = (category: string, value: number, z: string): Record<string, unknown> =>
    horizontal ? { x: value, y: category, z } : { x: category, y: value, z };
  return {
    id: 'bars',
    type,
    orientation,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [
      [point('Mon', 11, 'Alpha'), point('Tue', 12, 'Alpha')],
      [point('Mon', 21, 'Beta'), point('Tue', 22, 'Beta')],
    ],
  } as MaidrLayer;
}

/**
 * A one-series bar-family layer over three days.
 * @param type - The layer type
 * @param orientation - Which way the bars run
 * @returns The layer
 */
function flatBars(type: TraceType, orientation: Orientation): MaidrLayer {
  const horizontal = orientation === Orientation.HORIZONTAL;
  const data = [['Sat', 87], ['Sun', 76], ['Thur', 62]].map(([day, value]) =>
    horizontal ? { x: value, y: day } : { x: day, y: value });
  return { id: 'bars', type, orientation, axes: { x: { label: 'X' }, y: { label: 'Y' } }, data } as MaidrLayer;
}

const line: MaidrLayer = {
  id: 'lines',
  type: TraceType.LINE,
  axes: { x: { label: 'Year' }, y: { label: 'Value' } },
  data: [
    [{ x: 2001, y: 11, z: 'Alpha' }, { x: 2002, y: 12, z: 'Alpha' }],
    [{ x: 2001, y: 21, z: 'Beta' }, { x: 2002, y: 22, z: 'Beta' }],
  ],
};

const scatter: MaidrLayer = {
  id: 'dots',
  type: TraceType.SCATTER,
  axes: { x: { label: 'X' }, y: { label: 'Y' } },
  // Out of x order, so the model's sort moves every point.
  data: [{ x: 3, y: 33 }, { x: 1, y: 11 }, { x: 2, y: 22 }],
};

const histogram: MaidrLayer = {
  id: 'hist',
  type: TraceType.HISTOGRAM,
  axes: { x: { label: 'Bin' }, y: { label: 'Count' } },
  data: [
    { x: 'b1', y: 5, xMin: 0, xMax: 1, yMin: 0, yMax: 5 },
    { x: 'b2', y: 9, xMin: 1, xMax: 2, yMin: 0, yMax: 9 },
  ],
};

/**
 * The words the reader must hear for an entry: its labels, and what tells
 * the neighbouring points apart.
 * @param layer - The layer the entry came from
 * @param entry - The entry
 * @returns Substrings the position text must contain
 */
function expectedWords(layer: MaidrLayer, entry: Entry): string[] {
  if (layer.type === TraceType.HEATMAP) {
    const data = layer.data as { x: string[]; y: string[] };
    return [data.y[entry.group as number], data.x[entry.index]];
  }
  const point = entry.point as Record<string, unknown>;
  return Object.entries(point)
    .filter(([key]) => ['x', 'y', 'z'].includes(key))
    .map(([, value]) => String(value));
}

describe('a target from maidr_get_layer_data, handed to maidr_navigate', () => {
  it.each<[string, MaidrLayer]>([
    ['a heatmap, whose model holds its rows bottom-first', heatmap],
    ['a horizontal stacked bar', segmented(TraceType.STACKED, Orientation.HORIZONTAL)],
    ['a vertical stacked bar', segmented(TraceType.STACKED, Orientation.VERTICAL)],
    ['a horizontal dodged bar', segmented(TraceType.DODGED, Orientation.HORIZONTAL)],
    ['a vertical dodged bar', segmented(TraceType.DODGED, Orientation.VERTICAL)],
    ['a horizontal normalized bar', segmented(TraceType.NORMALIZED, Orientation.HORIZONTAL)],
    ['a horizontal bar', flatBars(TraceType.BAR, Orientation.HORIZONTAL)],
    ['a vertical bar', flatBars(TraceType.BAR, Orientation.VERTICAL)],
    ['a dot plot', flatBars(TraceType.DOT, Orientation.VERTICAL)],
    ['a lollipop', flatBars(TraceType.LOLLIPOP, Orientation.HORIZONTAL)],
    ['a histogram', histogram],
    ['a multi-series line', line],
    ['a step line', { ...line, type: TraceType.STEP }],
    ['a scatter, whose model sorts its points', scatter],
  ])('should land the reader on the point it came with, for %s', async (_, layer) => {
    const { ctrl, tools } = chartWith(layer);

    const page = await call(tools, TOOL_NAMES.GET_LAYER_DATA, { layerId: layer.id, limit: 200 });
    const entries = page.content?.points as Entry[];

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of [...entries].reverse()) {
      expect(entry.target).toBeDefined();
      const result = await call(tools, TOOL_NAMES.NAVIGATE, { layerId: layer.id, ...entry.target });
      expect(result).toEqual({ ok: true, applied: 'now' });
      const spoken = ctrl.getPositionText() ?? '';
      for (const word of expectedWords(layer, entry)) {
        expect(spoken).toContain(word);
      }
    }
  });
});

describe('maidr_navigate while a MAIDR dialog is open', () => {
  it('should refuse, and leave the dialog\'s keyboard scope in place', async () => {
    const { ctrl, tools } = chartWith(flatBars(TraceType.BAR, Orientation.VERTICAL));
    const { commandExecutor } = ctrl.getContextValue();
    commandExecutor.executeCommand('MOVE_RIGHT' as Keys);
    const before = ctrl.getPositionText();
    commandExecutor.executeCommand('TOGGLE_HELP' as Keys);
    expect(ctrl.isNavigationBlocked()).toBe(true);

    const result = await call(tools, TOOL_NAMES.NAVIGATE, { layerId: 'bars', row: 0, col: 2 });

    expect(result).toEqual({ ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' });
    expect(ctrl.isNavigationBlocked()).toBe(true);
    expect(ctrl.getPositionText()).toBe(before);

    commandExecutor.executeCommand('TOGGLE_HELP' as Keys);
    expect(ctrl.isNavigationBlocked()).toBe(false);
    expect(await call(tools, TOOL_NAMES.NAVIGATE, { layerId: 'bars', row: 0, col: 2 }))
      .toEqual({ ok: true, applied: 'now' });
  });
});
