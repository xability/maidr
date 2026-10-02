/**
 * @jest-environment jsdom
 */

/**
 * A command an agent runs for the reader, now or on their arrival.
 *
 * `maidr_run_command` reaches the mounted chart through the registry the hook
 * signs into. While the reader is inside the figure the command runs at once;
 * while they are not, it is kept -- in order, at most eight -- and run on the
 * next focus-in, after a kept `maidr_navigate` target, one at a time so each
 * is announced, through the reader's own command executor. A MAIDR dialog
 * open in the chart refuses a command even while the page is unfocused, and
 * one the reader opens before a kept command runs holds it until the
 * focus-in that follows the dialog closing. Unlike a kept target, a kept
 * command survives a change of data, but not a change of chart id, nor the
 * reader switching agent access off. Switching it off drops a target an agent
 * kept as well, but never one the host page kept: whoever set the target
 * last owns it.
 *
 * With `focus: true`, a move or command for a reader who is away is kept as
 * ever, and then their keyboard focus is moved into the chart, whose entry --
 * the one a Tab makes -- makes the move and runs the commands with the same
 * announcements. Never from a MAIDR dialog, and never while the page does not
 * have the browser's focus, when the request stays kept for their return.
 *
 * An `esm-test` for the same reason the visibility test is: rendering `Maidr`
 * mounts the whole app, and the chat bubbles in it are ESM-only.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { liveDataManager, navigateMaidr } from '@service/liveData';
import { buildWebMcpTools, resetWebMcpForTests, setWebMcpEnabled, TOOL_NAMES } from '@service/webMcp';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { Controller } from '../../../src/controller';
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

let observer: MutationObserver | null = null;

/**
 * Records every announcement made from here on. A screen reader speaks a
 * `role="alert"` element when it is inserted, so a text replaced before it
 * was ever inserted is one the reader never hears -- which a look at the
 * current text alone cannot tell.
 *
 * Call the returned function after each step: an alert inserted inside a
 * newly mounted subtree is read from that subtree when the records are taken.
 * @returns A function giving the announcements so far, in order.
 */
function watchAnnouncements(): () => string[] {
  const heard: string[] = [];
  const take = (records: MutationRecord[]): void => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        const alerts = node.matches('[role="alert"]') ? [node] : [...node.querySelectorAll('[role="alert"]')];
        alerts.forEach(alert => heard.push(alert.textContent ?? ''));
      });
    }
  };
  observer = new MutationObserver(take);
  observer.observe(document.body, { childList: true, subtree: true });
  const watching = observer;
  return () => {
    take(watching.takeRecords());
    return [...heard];
  };
}

/**
 * Lets time pass, as the reader waits, so kept commands come due.
 * @param ms - How long.
 */
function wait(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
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
  observer?.disconnect();
  observer = null;
  resetWebMcpForTests();
  jest.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
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

  it('should be kept while nobody is inside, and run in order after a kept target, each announced, when they arrive', async () => {
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
    const heard = watchAnnouncements();

    focusIn();
    // The target first, on its own.
    expect(heard()).toEqual([expect.stringContaining('Category is C')]);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(3);
    wait(500);
    wait(500);
    wait(500);

    // Then the leftmost point (A), one step right (B) and the sound toggle,
    // each in an announcement of its own.
    expect(heard()).toEqual([
      expect.stringContaining('Category is C'),
      expect.stringContaining('Category is A'),
      expect.stringContaining('Category is B'),
      expect.stringContaining('Sound is off'),
    ]);
    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.modes).toEqual(expect.objectContaining({ sound: false }));
    expect(listed.pending).toBe(0);
    expect(listed.reader).toEqual({ inChart: true, blocked: false });
  });

  it('should let a returning reader hear where they are before a kept command', async () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('ArrowRight', 'ArrowRight', 39);
    tabOut();
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });
    const heard = watchAnnouncements();

    focusIn();
    expect(heard()).toEqual([expect.stringContaining('Category is B')]);
    wait(500);

    expect(heard()).toEqual([
      expect.stringContaining('Category is B'),
      expect.stringContaining('Text mode is terse'),
    ]);
  });

  it('should queue a command asked for while the reader\'s entry still runs the kept ones, behind them', async () => {
    renderChart();
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_sound' });
    focusIn();
    const heard = watchAnnouncements();

    // In the chart, but not yet through what was kept: it waits its turn
    // rather than cutting in, and has not run, so it has no modes.
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
      .toEqual({ ok: true, applied: 'queued', message: expect.stringContaining('waits its turn') });
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(3);
    wait(500);
    wait(500);
    wait(500);

    expect(heard()).toEqual([
      expect.stringContaining('Text mode is terse'),
      expect.stringContaining('Sound is off'),
      expect.stringContaining('Text mode is off'),
    ]);
    // Once they have all run, a command runs at once again.
    expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_sound' })).applied).toBe('now');
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
    wait(500);

    expect(announcedText()).toContain('Text mode is terse');
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).modes).toEqual(expect.objectContaining({ text: 'terse' }));
    // The target went with the data it addressed: the reader is on no point yet.
    const charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string | null } }> };
    expect(charts.charts[0].reader.position).toBeNull();
  });

  it('should not survive the chart becoming another one under a new id', async () => {
    const page = (data: MaidrData): ReactElement => (
      <>
        <Maidr data={data}>
          <svg />
        </Maidr>
        <button type="button">Elsewhere</button>
      </>
    );
    const { rerender } = render(page(DATA));
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(1);

    rerender(page({ ...DATA, id: 'another-bar' }));
    expect(await call(TOOL_NAMES.LIST_COMMANDS, { chartId: 'another-bar' })).toMatchObject({ pending: 0 });
    focusIn();
    wait(500);

    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).modes).toEqual(expect.objectContaining({ text: 'verbose' }));
  });

  it('should keep at most eight, and run them all on arrival', async () => {
    renderChart();
    for (let i = 0; i < 8; i++) {
      expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'announce_point' })).applied).toBe('on-next-focus');
    }

    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
      .toEqual({ ok: false, error: 'too many commands waiting' });
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(8);

    focusIn();
    wait(7 * 500);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(1);
    wait(500);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(0);
  });

  it('should refuse a command under a MAIDR dialog, even while the reader is in the agent panel', async () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    // The go-to-extremes dialog.
    press('g', 'KeyG', 71);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).reader).toEqual({ inChart: true, blocked: true });
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
      .toEqual({ ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' });

    // The reader switched to the browser's agent panel, leaving the dialog
    // open: refused as a move is, not kept to run once they close it.
    const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).reader).toEqual({ inChart: false, blocked: true });
      expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' }))
        .toEqual({ ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' });
      expect(await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 }))
        .toEqual({ ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' });
    } finally {
      hasFocus.mockRestore();
    }
    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'verbose' }));
  });

  it('should hold kept commands under a dialog the reader opens on arrival, and run them once it closes', async () => {
    const figure = renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    tabOut();
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_sound' });

    focusIn();
    // Before the first comes due, the go-to-extremes dialog.
    press('g', 'KeyG', 71);
    wait(1000);
    let listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.reader).toEqual({ inChart: true, blocked: true });
    expect(listed.pending).toBe(2);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'verbose', sound: true }));

    // Closing the dialog hands focus back to the plot, and they run.
    press('Escape', 'Escape', 27);
    act(() => {
      fireEvent.focus(figure);
      jest.runOnlyPendingTimers();
    });
    wait(1000);

    listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'terse', sound: false }));
  });

  it('should wait behind a kept target that braille holds on the reader\'s return, and run after it', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    tabOut();
    expect((await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 })).applied).toBe('on-next-focus');
    expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'move_left' })).applied).toBe('on-next-focus');

    // Braille is back, which a move waits on, and so the command waits too.
    focusIn();
    wait(1000);
    expect(document.querySelector('textarea')).not.toBeNull();
    let listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(1);
    let charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string } }> };
    expect(charts.charts[0].reader.position).toContain('Category is A');

    // Braille off hands focus back to the plot a tick later, which is a
    // focus-in: the target (C), then one step left from it (B).
    expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille' })).applied).toBe('now');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(plot);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string } }> };
    expect(charts.charts[0].reader.position).toContain('Category is C');
    wait(500);

    listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string } }> };
    expect(charts.charts[0].reader.position).toContain('Category is B');
  });
});

describe('a braille toggle kept behind a target braille holds', () => {
  it('should run first, closing braille, so the target is made and braille stays closed', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    tabOut();
    await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 });
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille' });

    focusIn();
    expect(document.querySelector('textarea')).not.toBeNull();
    // Its turn comes, ahead of the text toggle that waits behind the target.
    wait(500);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(plot);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    const charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string } }> };
    expect(charts.charts[0].reader.position).toContain('Category is C');
    wait(500);

    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ braille: false, text: 'terse' }));
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('what an agent left for the reader when they switch agent access off', () => {
  const secure = window.isSecureContext;

  // A browser with WebMCP, so the tools register as the chart mounts and the
  // switch has them to take away.
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(document, 'modelContext', {
      value: { registerTool: () => Promise.resolve() },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).modelContext;
    Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  });

  /** What the settings dialog does when the reader unchecks the box. */
  function switchOff(): void {
    act(() => setWebMcpEnabled(false));
  }

  /**
   * Sets a target as the host page does, through `window.maidrLive.navigateTo`.
   * @param col - The bar to point at.
   */
  function hostPointsAt(col: number): void {
    act(() => {
      expect(navigateMaidr({ layerId: 'bar-layer', row: 0, col }, { id: DATA.id })).toBe(true);
    });
  }

  /**
   * Keeps a target for the reader as an agent does, while they are away.
   * @param col - The bar to move them to.
   */
  async function agentPointsAt(col: number): Promise<void> {
    expect((await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col })).applied).toBe('on-next-focus');
  }

  /**
   * Where the reader is, as the chart reports it.
   * @returns What their screen reader last spoke for their point, or null.
   */
  async function readerPosition(): Promise<string | null> {
    const charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { position: string | null } }> };
    return charts.charts[0].reader.position;
  }

  it('should drop kept commands', async () => {
    renderChart();
    await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text' });
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(1);

    switchOff();
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(0);
    focusIn();
    wait(500);

    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).modes).toEqual(expect.objectContaining({ text: 'verbose' }));
  });

  it('should drop a target an agent kept, so the reader arrives where they would have', async () => {
    renderChart();
    await agentPointsAt(2);

    switchOff();
    focusIn();

    expect(announcedText()).not.toContain('Category is C');
    expect(await readerPosition()).toBeNull();
  });

  it('should keep a target the host page kept', async () => {
    renderChart();
    hostPointsAt(1);

    switchOff();
    focusIn();

    expect(await readerPosition()).toContain('Category is B');
  });

  it('should keep a host target that replaced an agent\'s', async () => {
    renderChart();
    await agentPointsAt(2);
    hostPointsAt(1);

    switchOff();
    focusIn();

    expect(await readerPosition()).toContain('Category is B');
  });

  it('should drop an agent target that replaced the host\'s, and the host\'s with it', async () => {
    renderChart();
    hostPointsAt(1);
    await agentPointsAt(2);

    switchOff();
    focusIn();

    expect(announcedText()).not.toContain('Category is');
    expect(await readerPosition()).toBeNull();
  });

  it('should leave a reader already moved to an agent\'s target where they are', async () => {
    renderChart();
    await agentPointsAt(2);
    focusIn();
    expect(await readerPosition()).toContain('Category is C');

    switchOff();
    expect(await readerPosition()).toContain('Category is C');
    tabOut();
    focusIn();

    expect(await readerPosition()).toContain('Category is C');
  });
});

describe('an agent taking the reader into the chart when they ask', () => {
  /**
   * Puts the reader's focus on the button beside the chart, as if they had
   * Tabbed there, without the chart ever having been entered.
   * @returns The button.
   */
  function focusElsewhere(): HTMLElement {
    const button = screen.getByRole('button', { name: 'Elsewhere' });
    act(() => {
      button.focus();
      jest.runOnlyPendingTimers();
    });
    return button;
  }

  /**
   * Where the reader is, as the chart reports it.
   * @returns Whether they are in it, and what was last spoken for their point.
   */
  async function reader(): Promise<{ inChart: boolean; position: string | null }> {
    const charts = (await call(TOOL_NAMES.LIST_CHARTS, {})).content as { charts: Array<{ reader: { inChart: boolean; position: string | null } }> };
    return charts.charts[0].reader;
  }

  it('should move their focus to the chart and announce the move there at once', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusElsewhere();
    const heard = watchAnnouncements();

    const result = await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true });

    expect(result).toEqual({ ok: true, applied: 'now', focused: true });
    expect(document.activeElement).toBe(plot);
    expect(heard()).toEqual([expect.stringContaining('Category is C')]);
    expect(await reader()).toEqual({ inChart: true, position: expect.stringContaining('Category is C') });
  });

  it('should bring a returning reader back to their point, then run the command half a second later', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('ArrowRight', 'ArrowRight', 39);
    tabOut();
    const heard = watchAnnouncements();

    const result = await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true });

    expect(result).toEqual({ ok: true, applied: 'queued', focused: true, message: expect.stringContaining('waits its turn') });
    expect(document.activeElement).toBe(plot);
    // Where they are first, on its own, as for a Tab in.
    expect(heard()).toEqual([expect.stringContaining('Category is B')]);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(1);
    wait(500);

    expect(heard()).toEqual([
      expect.stringContaining('Category is B'),
      expect.stringContaining('Text mode is terse'),
    ]);
    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'terse' }));
  });

  it('should run a first-time reader\'s command once they are in, and one asked for meanwhile after it', async () => {
    renderChart();
    focusElsewhere();

    expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true })).focused).toBe(true);
    // They are in now, but the first is still waiting: the second waits
    // behind it rather than cutting in, and focus is not asked for again.
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_sound', focus: true }))
      .toEqual({ ok: true, applied: 'queued', message: expect.stringContaining('waits its turn') });
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(2);
    const heard = watchAnnouncements();
    wait(500);
    expect(heard()).toEqual([expect.stringContaining('Text mode is terse')]);
    wait(500);

    expect(heard()).toEqual([
      expect.stringContaining('Text mode is terse'),
      expect.stringContaining('Sound is off'),
    ]);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).modes).toEqual(expect.objectContaining({ text: 'terse', sound: false }));
  });

  it('should answer as without focus for a reader already in the chart', async () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);

    expect(await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true }))
      .toEqual({ ok: true, applied: 'now' });
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true }))
      .toEqual({ ok: true, applied: 'now', modes: expect.objectContaining({ text: 'terse' }) });
  });

  it('should refuse under a MAIDR dialog without moving focus, whether or not the page has the browser\'s', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    // The go-to-extremes dialog.
    press('g', 'KeyG', 71);
    const inDialog = document.activeElement;
    expect(inDialog).not.toBe(plot);
    const refused = { ok: false, applied: 'blocked', error: 'reader is in a MAIDR dialog' };

    expect(await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true })).toEqual(refused);
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true })).toEqual(refused);
    const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      expect(await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true })).toEqual(refused);
      expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true })).toEqual(refused);
    } finally {
      hasFocus.mockRestore();
    }

    expect(document.activeElement).toBe(inDialog);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(0);
  });

  it('should keep the request, and change, make and announce nothing, while the page does not have the browser\'s focus', async () => {
    renderChart();
    const button = focusElsewhere();
    const heard = watchAnnouncements();
    // The reader is talking to the agent in the browser's side panel, which
    // the page cannot take focus from.
    const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      const moved = await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true });
      expect(moved).toEqual({ ok: true, applied: 'on-next-focus', focused: false, message: expect.stringContaining('could not be moved') });
      const ran = await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true });
      expect(ran).toEqual({ ok: true, applied: 'on-next-focus', focused: false, message: expect.stringContaining('could not be moved') });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // The page's own focus stayed where the reader left it, and nothing
      // was entered behind their back.
      expect(document.activeElement).toBe(button);
      expect(heard().filter(text => text !== '')).toEqual([]);
      expect(await reader()).toEqual({ inChart: false, position: null });
      expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(1);
    } finally {
      hasFocus.mockRestore();
    }

    // Back on the page, where they left it, they Tab into the chart, which
    // makes the move and runs the command.
    expect(document.activeElement).toBe(button);
    focusIn();
    expect(heard().filter(text => text !== '')).toEqual([expect.stringContaining('Category is C')]);
    wait(500);

    expect(heard().filter(text => text !== '')).toEqual([
      expect.stringContaining('Category is C'),
      expect.stringContaining('Text mode is terse'),
    ]);
  });

  it('should say the reader is not in the chart when entering it fails, and enter afresh next time', async () => {
    renderChart();
    focusElsewhere();
    const resume = jest.spyOn(Controller.prototype, 'resume').mockImplementationOnce(() => {
      throw new Error('broken');
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true });

      expect(result).toEqual({ ok: true, applied: 'on-next-focus', focused: false, message: expect.stringContaining('could not be entered') });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('[maidr] Could not enter the chart'), expect.any(Error));
      expect(await reader()).toEqual({ inChart: false, position: null });
    } finally {
      resume.mockRestore();
      error.mockRestore();
    }

    // The move was kept, and the next entry makes it.
    tabOut();
    focusIn();
    expect((await reader()).position).toContain('Category is C');
  });

  it('should not pull a reader who left back in straight away, and keep the move for them', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    const button = focusElsewhere();
    expect((await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true })).focused).toBe(true);
    expect(document.activeElement).toBe(plot);

    // They leave, on purpose, and the agent asks at once to take them back.
    tabOut();
    const again = await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 0, focus: true });

    expect(again).toEqual({ ok: true, applied: 'on-next-focus', focused: false, message: expect.stringContaining('less than 10 seconds ago') });
    expect(document.activeElement).toBe(button);
    focusIn();
    expect((await reader()).position).toContain('Category is A');
  });

  it('should not take focus from a dialog elsewhere on the page', async () => {
    render(
      <>
        <Maidr data={DATA}>
          <svg />
        </Maidr>
        <div role="dialog" aria-label="Cookies">
          <button type="button">Accept</button>
        </div>
      </>,
    );
    const accept = screen.getByRole('button', { name: 'Accept' });
    act(() => {
      accept.focus();
    });

    const result = await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true });

    expect(result).toEqual({ ok: true, applied: 'on-next-focus', focused: false, message: expect.stringContaining('could not be moved') });
    expect(document.activeElement).toBe(accept);
  });

  it('should not move focus away from where the reader is in the chart', async () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    const field = document.querySelector('textarea');
    expect(document.activeElement).toBe(field);
    // In the side panel, with the braille field still holding the page's focus.
    const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true }))
        .toEqual({ ok: true, applied: 'on-next-focus', focused: false, message: expect.stringContaining('could not be moved') });
    } finally {
      hasFocus.mockRestore();
    }

    expect(document.activeElement).toBe(field);
  });

  it('should leave focus where it is without focus, or with focus false', async () => {
    renderChart();
    const button = focusElsewhere();

    for (const input of [{}, { focus: false }]) {
      expect(await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, ...input }))
        .toEqual({ ok: true, applied: 'on-next-focus', message: expect.stringContaining('Best effort') });
      expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'announce_point', ...input }))
        .toEqual({ ok: true, applied: 'on-next-focus', message: expect.stringContaining('do not claim it has happened') });
    }

    expect(document.activeElement).toBe(button);
    expect(announcedText()).toBe('');
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(2);
  });

  it('should reject a focus that is not a boolean, moving and keeping nothing', async () => {
    renderChart();
    const button = focusElsewhere();

    expect(await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: 'yes' }))
      .toEqual({ ok: false, error: 'invalid focus' });
    expect(await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: 1 }))
      .toEqual({ ok: false, error: 'invalid focus' });

    expect(document.activeElement).toBe(button);
    expect((await call(TOOL_NAMES.LIST_COMMANDS, {})).pending).toBe(0);
    focusIn();
    expect((await reader()).position).toBeNull();
  });

  it('should say a command waits behind a kept move braille holds when it brings the reader back, and run it once they close braille', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    tabOut();
    expect((await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 })).applied).toBe('on-next-focus');

    const result = await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_text', focus: true });

    expect(result).toEqual({ ok: true, applied: 'on-next-focus', focused: true, message: expect.stringContaining('braille field reopened') });
    expect(result.message).toContain('runs once they close braille');
    wait(1000);
    expect(document.querySelector('textarea')).not.toBeNull();
    let listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(1);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'verbose', braille: true }));

    // Braille off hands focus back to the plot: the move, then the command.
    expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille' })).applied).toBe('now');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(plot);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect((await reader()).position).toContain('Category is C');
    wait(500);
    listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ text: 'terse', braille: false }));
  });

  it('should let a braille toggle it brings the reader back for close braille, and then make the kept move', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    tabOut();
    await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2 });

    const result = await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille', focus: true });

    expect(result).toEqual({ ok: true, applied: 'queued', focused: true, message: expect.stringContaining('waits its turn') });
    expect(document.querySelector('textarea')).not.toBeNull();
    wait(500);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(plot);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect((await reader()).position).toContain('Category is C');
    wait(1000);
    expect(document.querySelector('textarea')).toBeNull();
    const listed = await call(TOOL_NAMES.LIST_COMMANDS, {});
    expect(listed.pending).toBe(0);
    expect(listed.modes).toEqual(expect.objectContaining({ braille: false }));
  });

  it('should take a reader who left braille open back into it, and make the move once they close it', async () => {
    renderChart();
    const plot = screen.getByRole('img');
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    tabOut();

    const result = await call(TOOL_NAMES.NAVIGATE, { layerId: 'bar-layer', row: 0, col: 2, focus: true });

    expect(result).toEqual({ ok: true, applied: 'on-next-focus', focused: true, message: expect.stringContaining('braille field reopened') });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(document.querySelector('textarea')).not.toBeNull();
    expect(await reader()).toEqual({ inChart: true, position: expect.stringContaining('Category is A') });

    // Braille off hands focus back to the plot, which is a focus-in.
    expect((await call(TOOL_NAMES.RUN_COMMAND, { command: 'toggle_braille' })).applied).toBe('now');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(plot);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect((await reader()).position).toContain('Category is C');
  });
});
