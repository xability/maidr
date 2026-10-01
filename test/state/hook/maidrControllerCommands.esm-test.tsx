/**
 * @jest-environment jsdom
 */

/**
 * A command an agent runs for the reader, now or on their arrival.
 *
 * `maidr_run_command` reaches the mounted chart through the registry the hook
 * signs into. While the reader is inside the figure the command runs at once;
 * while they are not, it is kept -- in order, at most eight -- and run on the
 * next focus-in, after a kept `maidr_navigate` target, each through the
 * reader's own command executor. Unlike a kept target, a kept command
 * survives a change of data, and one a MAIDR dialog still blocks at focus-in
 * waits for the focus-in that follows the dialog closing.
 *
 * An `esm-test` for the same reason the visibility test is: rendering `Maidr`
 * mounts the whole app, and the chat bubbles in it are ESM-only.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { liveDataManager } from '@service/liveData';
import { buildWebMcpTools, TOOL_NAMES } from '@service/webMcp';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { Maidr } from '../../../src/maidr-component';

const DATA: MaidrData = {
  id: 'commands-bar',
  subplots: [[{
    layers: [{
      id: 'bar-layer',
      type: TraceType.BAR,
      axes: { x: { label: 'Category' }, y: { label: 'Value' } },
      data: [
        { x: 'A', y: 1 },
        { x: 'B', y: 2 },
        { x: 'C', y: 3 },
      ],
    }],
  }]],
};

type Result = Record<string, unknown> & { modes?: Record<string, unknown>; content?: unknown };

let tools: ReturnType<typeof buildWebMcpTools>;

/**
 * Calls a tool as an agent would.
 * @param name - The tool's name.
 * @param input - Its input.
 * @returns The result.
 */
async function call(name: string, input: unknown): Promise<Result> {
  const found = tools.find(candidate => candidate.name === name);
  if (!found) {
    throw new Error(`no tool ${name}`);
  }
  let result: unknown;
  await act(async () => {
    result = await found.execute(input, {});
  });
  return result as Result;
}

/**
 * Renders the chart beside another control on the page, without activating it.
 * @returns The figure element a focus lands on.
 */
function renderChart(): HTMLElement {
  render(
    <>
      <Maidr data={DATA}>
        <svg />
      </Maidr>
      <button type="button">Elsewhere</button>
    </>,
  );
  return screen.getByRole('img').parentElement as HTMLElement;
}

/**
 * Focuses the plot inside the figure, as a Tab does, and lets the controller
 * come up behind its timer.
 */
function focusIn(): void {
  act(() => {
    screen.getByRole('img').focus();
    jest.runOnlyPendingTimers();
  });
}

/**
 * Tabs to the button beside the chart, and lets the controller go.
 */
function tabOut(): void {
  act(() => {
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    jest.runOnlyPendingTimers();
  });
}

/**
 * Presses a key where the reader's focus is, as the keyboard does.
 * @param key - The key's name.
 * @param code - The physical key, which is what hotkeys-js reads.
 * @param keyCode - The key's legacy code.
 */
function press(key: string, code: string, keyCode: number): void {
  act(() => {
    const target = document.activeElement ?? document.body;
    fireEvent.keyDown(target, { key, code, keyCode });
    // Released, or hotkeys-js reads the next key as a chord with this one.
    fireEvent.keyUp(target, { key, code, keyCode });
    jest.runOnlyPendingTimers();
  });
}

/**
 * The text the chart is currently announcing, as the Text component shows it.
 * @returns The announced text, or '' when nothing is announced.
 */
function announcedText(): string {
  return document.querySelector('#maidr-figure-commands-bar')?.textContent ?? '';
}

// jsdom implements neither structuredClone nor the Web Audio API, both of
// which the controller reaches for as it starts. Stubbed at that boundary, the
// way test/service/audio.*.test.ts stubs the same API.
const realStructuredClone = globalThis.structuredClone;
const realGetContext = HTMLCanvasElement.prototype.getContext;

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

/**
 * A structured clone good enough for plain chart data.
 * @param value - The value to copy.
 * @returns A deep copy of it.
 */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

beforeAll(() => {
  globalThis.structuredClone = jsonClone as typeof structuredClone;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext
    = function AudioContextStub(): Record<string, unknown> {
      return audioContext();
    } as unknown as typeof AudioContext;
  // Nor a 2D canvas, which high contrast parses colours with.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

beforeEach(() => {
  jest.useFakeTimers();
  let clock = 0;
  tools = buildWebMcpTools(liveDataManager, () => (clock += 1000));
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('a command an agent runs for the reader', () => {
  it('should run at once while they are inside the figure', async () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);

    const result = await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });

    expect(result).toEqual({ ok: true, applied: 'now', modes: expect.objectContaining({ text: 'terse' }) });
    expect(announcedText()).toContain('Text mode is terse');
  });

  it('should be kept while nobody is inside, and run in order after a kept target when they arrive', async () => {
    renderChart();
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).modes).toEqual(expect.objectContaining({ text: 'verbose', sound: true }));

    expect((await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 })).applied).toBe('on-next-focus');
    // Commands and moves keep their own rate limits: back to back is fine.
    for (const command of ['move_to_left_extreme', 'move_right', 'toggle_sound']) {
      expect(await call(TOOL_NAMES.RUN_COMMAND, { command })).toEqual({
        ok: true,
        applied: 'on-next-focus',
        message: expect.stringContaining('do not claim it has happened'),
      });
    }
    // Nothing is announced to a reader who is not there.
    expect(announcedText()).toBe('');
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(3);

    focusIn();

    // The target (C), then the leftmost point (A), then one step right (B).
    const charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string } }> };
    expect(charts.charts[0].reader.position).toContain('Category is B');
    expect(announcedText()).toContain('Sound is off');
    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.modes).toEqual(expect.objectContaining({ sound: false }));
    expect(listed.pending).toBe(0);
    expect(listed.reader).toEqual({ inChart: true, blocked: false });
  });

  it('should report the modes the reader left with while they are away', async () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('t', 'KeyT', 84);
    tabOut();

    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});

    expect(listed.modes).toEqual(expect.objectContaining({ text: 'terse' }));
    expect(listed.reader).toEqual({ inChart: false, blocked: false });
  });

  it('should survive a change of data, which drops a kept target', async () => {
    renderChart();
    await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 });
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });

    act(() => {
      liveDataManager.setData({
        ...DATA,
        subplots: [[{ layers: [{ ...DATA.subplots[0][0].layers[0], data: [
          { x: 'D', y: 4 },
          { x: 'E', y: 5 },
          { x: 'F', y: 6 },
        ] }] }]],
      });
    });
    focusIn();

    expect(announcedText()).toContain('Text mode is terse');
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).modes).toEqual(expect.objectContaining({ text: 'terse' }));
    // The target went with the data it addressed: the reader is on no point yet.
    const charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string | null } }> };
    expect(charts.charts[0].reader.position).toBeNull();
  });

  it('should keep at most eight', async () => {
    renderChart();
    for (let i = 0; i < 8; i++) {
      expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'announce_point' })).applied).toBe('on-next-focus');
    }

    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
      .toEqual({ ok: false, error: 'too many commands waiting' });
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(8);

    focusIn();
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(0);
  });

  it('should wait out a MAIDR dialog still open when the reader comes back', async () => {
    const figure = renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    // The go-to-extremes dialog.
    press('g', 'KeyG', 71);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).reader).toEqual({ inChart: true, blocked: true });
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
      .toEqual({ ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' });

    // The reader switched to the browser's agent panel, leaving the dialog open.
    const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' })).applied).toBe('on-next-focus');
    } finally {
      hasFocus.mockRestore();
    }
    // Back in the page, the browser fires focus-in again; the dialog is still open.
    act(() => {
      fireEvent.focus(figure);
      jest.runOnlyPendingTimers();
    });
    let listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(1);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'verbose' }));

    // Closing the dialog hands focus back to the plot, and the command runs.
    press('Escape', 'Escape', 27);
    act(() => {
      fireEvent.focus(figure);
      jest.runOnlyPendingTimers();
    });

    listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'terse' }));
  });
});
