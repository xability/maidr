/**
 * @jest-environment jsdom
 */

/**
 * The WebMCP command tools against a real controller: `maidr_run_command`
 * runs the reader's own command through the executor the command palette
 * uses, in the scope the reader is in, and `maidr_list_commands` reports the
 * modes it changed. A command the reader's scope has no key for, or whose key
 * would silently do nothing there, is unavailable rather than run somewhere
 * else; an arrow move stops autoplay first, as the arrow keys do; a MAIDR
 * dialog blocks every command, and the braille field blocks none that braille
 * mode has a key for.
 *
 * Built on a real `Controller`, as `webMcpNavigation.test.ts` is, with the
 * Web Audio API and `hotkeys-js` stubbed at the boundary. The reader is
 * always in the chart here; the hook's kept commands are covered by
 * `test/state/hook/maidrControllerCommands.esm-test.tsx`.
 */

import type { AppStore } from '@state/store';
import type { Keys } from '@type/event';
import type { CandlestickPoint, Maidr, MaidrLayer } from '@type/grammar';
import type { ControllerSession } from '../../src/controller';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LiveDataManager } from '@service/liveData';
import { TextMode } from '@service/text';
import { buildWebMcpTools, TOOL_NAMES } from '@service/webMcp';
import { createMaidrStore } from '@state/store';
import { TraceType } from '@type/grammar';
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
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  globalThis.structuredClone = (<T>(value: T): T => JSON.parse(JSON.stringify(value)) as T) as typeof structuredClone;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext
    = function AudioContextStub(): Record<string, unknown> {
      return audioContext();
    } as unknown as typeof AudioContext;
  // jsdom has no 2D canvas, which high contrast parses colours with.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

let controller: Controller | null = null;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  controller?.dispose();
  controller = null;
  jest.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

const bars: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  axes: { x: { label: 'Day' }, y: { label: 'Count' } },
  data: [{ x: 'Sat', y: 87 }, { x: 'Sun', y: 76 }, { x: 'Thur', y: 62 }],
};

/**
 * A candle closing at the given price.
 * @param value - The date
 * @param close - The close price
 * @returns The candle
 */
function candle(value: string, close: number): CandlestickPoint {
  return { value, open: close - 1, high: close + 2, low: close - 2, close, volume: 100, trend: 'Bull', volatility: 4 };
}

/** Candles under a moving average, which the comparison layer can measure them against. */
const candlesWithAverage: Maidr['subplots'] = [[{
  layers: [
    {
      id: 'candles',
      type: TraceType.CANDLESTICK,
      axes: { x: { label: 'Date' }, y: { label: 'Price' } },
      data: [candle('2026-01-01', 10), candle('2026-01-02', 12), candle('2026-01-03', 9)],
    },
    {
      id: 'average',
      type: TraceType.LINE,
      axes: { x: { label: 'Date' }, y: { label: 'Price' } },
      data: [[
        { x: '2026-01-01', y: 11, z: 'Moving average' },
        { x: '2026-01-02', y: 13, z: 'Moving average' },
        { x: '2026-01-03', y: 10, z: 'Moving average' },
      ]],
    },
  ],
}]];

/**
 * Builds a controller over a figure.
 * @param maidr - The figure
 * @param session - What the reader had when they last left, if anything
 * @param store - The store the controller's view models write to
 * @returns The controller
 */
function controllerFor(maidr: Maidr, session: ControllerSession | null = null, store: AppStore = createMaidrStore()): Controller {
  const plot = document.createElement('div');
  document.body.append(plot);
  const ctrl = new Controller(JSON.parse(JSON.stringify(maidr)) as Maidr, plot, store, session);
  controller = ctrl;
  return ctrl;
}

/**
 * A figure with the reader inside it and the tools over it, its command
 * channel wired to the controller as the hook wires it.
 * @param subplots - The figure's subplot grid
 * @returns The controller, its store and the tools
 */
function chartWith(subplots: Maidr['subplots']): { ctrl: Controller; store: AppStore; tools: ReturnType<typeof buildWebMcpTools> } {
  const maidr: Maidr = { id: 'chart', subplots };
  const store = createMaidrStore();
  const ctrl = controllerFor(maidr, null, store);
  const manager = new LiveDataManager();
  manager.register(maidr, jest.fn(), {
    probe: () => ({ inChart: true, position: ctrl.getPositionText(), blocked: ctrl.isNavigationBlocked() }),
    commands: {
      run: command => ctrl.runCommand(command),
      state: () => ({ modes: ctrl.getModes(), blocked: ctrl.isCommandBlocked(), pending: 0 }),
      clear: () => {},
    },
  });
  let clock = 0;
  const tools = buildWebMcpTools(manager, () => (clock += 1000));
  return { ctrl, store, tools };
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
): Promise<Record<string, unknown> & { modes?: Record<string, unknown> }> {
  const found = tools.find(candidate => candidate.name === name);
  if (!found) {
    throw new Error(`no tool ${name}`);
  }
  return await found.execute(input, {}) as Record<string, unknown> & { modes?: Record<string, unknown> };
}

describe('maidr_run_command on a real chart', () => {
  it('should run a toggle through the reader\'s own executor and report the mode it left', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }]]);
    expect((await call(tools, TOOL_NAMES.LIST_COMMANDS, {})).modes?.text).toBe('verbose');

    const result = await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });

    expect(result).toEqual({ ok: true, applied: 'now', modes: expect.objectContaining({ text: 'terse' }) });
    expect(ctrl.getModes().text).toBe(TextMode.TERSE);
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_sound' }))
      .toMatchObject({ applied: 'now', modes: { sound: false } });
  });

  it('should move the reader, and start and stop autoplay', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }]]);

    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_right' });
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_to_right_extreme' });
    expect(ctrl.getPositionText()).toContain('Thur');

    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_to_left_extreme' });
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'autoplay_forward' }))
      .toMatchObject({ applied: 'now', modes: { autoplay: true } });
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'stop_autoplay' }))
      .toMatchObject({ applied: 'now', modes: { autoplay: false } });
  });

  it('should report the rotor mode the reader moves in', async () => {
    const { tools } = chartWith([[{ layers: [bars] }]]);

    const result = await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'next_navigation_mode' });

    expect(result.modes?.navigationMode).toBe('lower');
  });

  it('should run, from the braille field, what braille mode has a key for, and nothing else', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }]]);
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_right' });

    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille' }))
      .toMatchObject({ applied: 'now', modes: { braille: true } });
    // Braille is a text field a move waits on, but not one commands wait on.
    expect(ctrl.isNavigationBlocked()).toBe(true);
    expect((await call(tools, TOOL_NAMES.LIST_COMMANDS, {})).reader).toEqual({ inChart: true, blocked: false });

    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_sound' }))
      .toMatchObject({ applied: 'now', modes: { sound: false, braille: true } });
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'return_to_subplot' }))
      .toEqual({ ok: false, applied: 'unavailable', error: 'command not available where the reader is' });
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille' }))
      .toMatchObject({ applied: 'now', modes: { braille: false } });
  });

  it('should refuse every command while a MAIDR dialog is open, and leave the dialog in place', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }]]);
    const { commandExecutor } = ctrl.getContextValue();
    commandExecutor.executeCommand('TOGGLE_HELP' as Keys);
    expect(ctrl.isCommandBlocked()).toBe(true);

    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
      .toEqual({ ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' });
    expect((await call(tools, TOOL_NAMES.LIST_COMMANDS, {})).reader).toEqual({ inChart: true, blocked: true });
    expect(ctrl.getModes().text).toBe(TextMode.VERBOSE);
    expect(ctrl.isCommandBlocked()).toBe(true);

    commandExecutor.executeCommand('TOGGLE_HELP' as Keys);
    expect((await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' })).applied).toBe('now');
  });

  it('should stop autoplay before an arrow move, as the arrow keys do, so the landing is announced', async () => {
    const { ctrl, store, tools } = chartWith([[{ layers: [bars] }]]);
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_right' });
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'autoplay_forward' }))
      .toMatchObject({ applied: 'now', modes: { autoplay: true } });
    expect(store.getState().text.announce).toBe(false);

    const result = await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_to_right_extreme' });

    expect(result).toMatchObject({ applied: 'now', modes: { autoplay: false } });
    expect(ctrl.getPositionText()).toContain('Thur');
    expect(store.getState().text.announce).toBe(true);
  });

  it('should leave autoplay running for a command whose key does not stop it', async () => {
    const { tools } = chartWith([[{ layers: [bars] }]]);
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_right' });
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'autoplay_forward' });

    const result = await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'speed_up_autoplay' });

    expect(result).toMatchObject({ applied: 'now', modes: { autoplay: true } });
  });

  it('should answer unavailable for a key that would silently do nothing where the reader is', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }]]);
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_right' });
    const before = ctrl.getPositionText();
    const unavailable = { ok: false, applied: 'unavailable', error: 'command not available where the reader is' };

    // Enter outside grid navigation, and Escape with no overview to return to.
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'enter_grid_cell' })).toEqual(unavailable);
    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'return_to_subplot' })).toEqual(unavailable);

    expect(ctrl.getPositionText()).toBe(before);
    expect(ctrl.isCommandBlocked()).toBe(false);
  });

  it('should return to the overview of a multi-panel figure', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }, { layers: [{ ...bars, id: 'more' }] }]]);
    ctrl.getContextValue().commandExecutor.executeCommand('MOVE_TO_TRACE_CONTEXT' as Keys);
    expect(ctrl.isNavigationBlocked()).toBe(false);

    expect((await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'return_to_subplot' })).applied).toBe('now');
    // In the overview, autoplay has no key.
    expect((await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'autoplay_forward' })).applied).toBe('unavailable');
  });

  it('should leave the candlestick comparison to the reader, whose key opens the reference picker at first', async () => {
    const { ctrl, tools } = chartWith(candlesWithAverage);
    await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'move_right' });

    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_candlestick_comparison' })).toEqual({
      ok: false,
      error: 'command not runnable by an agent',
      hint: 'maidr_list_commands gives its key: tell the reader to press it.',
    });
    expect(ctrl.isCommandBlocked()).toBe(false);

    // Why: with no reference chosen yet, as at every focus-in, the reader's
    // own key opens the picker and takes their focus.
    ctrl.getContextValue().commandExecutor.executeCommand('TOGGLE_CANDLESTICK_DELTA_LAYER' as Keys);
    expect(ctrl.isCommandBlocked()).toBe(true);
  });

  it('should answer unavailable for a command the multi-panel lobby has no key for', async () => {
    const { ctrl, tools } = chartWith([[{ layers: [bars] }, { layers: [{ ...bars, id: 'more' }] }]]);
    const before = ctrl.getModes();

    expect(await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'autoplay_forward' }))
      .toEqual({ ok: false, applied: 'unavailable', error: 'command not available where the reader is' });
    expect(ctrl.getModes()).toEqual(before);
    // A mode the lobby does have a key for still runs there.
    expect((await call(tools, TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' })).applied).toBe('now');
  });
});

describe('the modes a controller starts with', () => {
  it('should be what a fresh controller reports', () => {
    const maidr: Maidr = { id: 'chart', subplots: [[{ layers: [bars] }]] };
    const ctrl = controllerFor(maidr);

    expect(Controller.startingModes(null, maidr)).toEqual(ctrl.getModes());
  });

  it('should be what a controller built from a session reports once it resumes', () => {
    const maidr: Maidr = { id: 'chart', subplots: [[{ layers: [bars] }]] };
    const session: ControllerSession = { navigation: null, textMode: TextMode.OFF, soundOn: false, brailleOn: true };
    const ctrl = controllerFor(maidr, session);
    ctrl.resume();

    expect(Controller.startingModes(session, maidr)).toEqual(ctrl.getModes());
    expect(ctrl.getModes()).toMatchObject({ text: 'off', sound: false, braille: true });
  });

  it('should not reopen braille on the overview a multi-panel figure starts on when there is no point to return to', () => {
    const maidr: Maidr = { id: 'chart', subplots: [[{ layers: [bars] }, { layers: [{ ...bars, id: 'more' }] }]] };
    const session: ControllerSession = { navigation: null, textMode: TextMode.VERBOSE, soundOn: true, brailleOn: true };
    const ctrl = controllerFor(maidr, session);
    ctrl.resume();

    expect(Controller.startingModes(session, maidr)).toEqual(ctrl.getModes());
    expect(ctrl.getModes().braille).toBe(false);
  });

  it('should reopen braille on the point a multi-panel reader comes back to', () => {
    const maidr: Maidr = { id: 'chart', subplots: [[{ layers: [bars] }, { layers: [{ ...bars, id: 'more' }] }]] };
    const first = controllerFor(maidr);
    const { commandExecutor } = first.getContextValue();
    commandExecutor.executeCommand('MOVE_TO_TRACE_CONTEXT' as Keys);
    commandExecutor.executeCommand('MOVE_RIGHT' as Keys);
    commandExecutor.executeCommand('TOGGLE_BRAILLE' as Keys);
    const session = first.captureSession();
    first.dispose();
    expect(session).toMatchObject({ brailleOn: true, navigation: expect.anything() });

    const ctrl = controllerFor(maidr, session);
    ctrl.resume();

    expect(Controller.startingModes(session, maidr)).toEqual(ctrl.getModes());
    expect(ctrl.getModes().braille).toBe(true);
  });

  it('should take high contrast from the reader\'s saved settings', () => {
    const maidr: Maidr = { id: 'chart', subplots: [[{ layers: [bars] }]] };
    localStorage.setItem('maidr-settings', JSON.stringify({ general: { highContrastMode: true } }));
    const ctrl = controllerFor(maidr);

    expect(Controller.startingModes(null, maidr).highContrast).toBe(true);
    expect(ctrl.getModes().highContrast).toBe(true);
  });
});
