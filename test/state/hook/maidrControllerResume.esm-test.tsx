/**
 * @jest-environment jsdom
 */

/**
 * A reader who Tabs out of a chart and back in picks up where they left off.
 *
 * The controller holds the page's hotkeys, so it is disposed whenever focus
 * leaves the figure. What the reader had -- the point they were on, and the
 * text, sound and braille modes they had set -- is carried to the controller
 * built on the next focus-in, and the point is announced in place of the
 * initial instruction (#1338).
 *
 * An `esm-test` for the same reason the visibility test is: rendering `Maidr`
 * mounts the whole app, and the chat bubbles in it are ESM-only.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { Maidr } from '../../../src/maidr-component';

const DATA: MaidrData = {
  id: 'resume-bar',
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
  return document.querySelector('#maidr-figure-resume-bar')?.textContent ?? '';
}

// jsdom implements neither structuredClone nor the Web Audio API, both of
// which the controller reaches for as it starts. Stubbed at that boundary, the
// way test/service/audio.*.test.ts stubs the same API.
const realStructuredClone = globalThis.structuredClone;

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
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('a reader who Tabs out and back in', () => {
  it('should be announced the point they were on, and move on from it', () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('ArrowRight', 'ArrowRight', 39);
    expect(announcedText()).toContain('Category is B');

    tabOut();
    focusIn();

    expect(announcedText()).toContain('Category is B');
    expect(announcedText()).not.toContain('Use Arrows to navigate');

    press('ArrowRight', 'ArrowRight', 39);
    expect(announcedText()).toContain('Category is C');
  });

  it('should be given the instruction again when they never moved', () => {
    renderChart();
    focusIn();
    tabOut();
    focusIn();

    expect(announcedText()).toContain('Use Arrows to navigate');
  });

  it('should find braille still open', () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('b', 'KeyB', 66);
    expect(document.querySelector('textarea')).not.toBeNull();

    tabOut();
    expect(document.querySelector('textarea')).toBeNull();
    focusIn();

    expect(document.querySelector('textarea')).not.toBeNull();
  });

  it('should find text mode where they left it', () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    // Verbose, then terse.
    press('t', 'KeyT', 84);
    expect(announcedText()).toContain('Text mode is terse');

    tabOut();
    focusIn();

    // Terse names the value alone, without its axis.
    expect(announcedText()).not.toContain('Category is');
    press('ArrowRight', 'ArrowRight', 39);
    expect(announcedText()).not.toContain('Category is');
  });

  it('should find sound where they left it', () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('s', 'KeyS', 83);
    expect(announcedText()).toContain('Sound is off');

    tabOut();
    focusIn();

    // Sound was off, so the next toggle turns it back on.
    press('s', 'KeyS', 83);
    expect(announcedText()).toContain('Sound is');
    expect(announcedText()).not.toContain('Sound is off');
  });
});
