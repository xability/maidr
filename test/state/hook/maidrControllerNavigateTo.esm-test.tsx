/**
 * @jest-environment jsdom
 */

/**
 * A target sent from outside lands the reader on it, now or on arrival.
 *
 * `navigateMaidr` reaches the mounted chart through the registry the hook
 * signs into. While the reader is inside the figure the cursor moves at once
 * and the mark is announced; while they are not -- the usual case, since the
 * click that chose the mark took the focus with it -- the target is kept and
 * applied on the next focus-in, after the instruction, so the reader arrives
 * where the host is pointing. `null` withdraws a kept target, and a change of
 * data drops it, since it addressed the figure that data described.
 *
 * An `esm-test` for the same reason the visibility test is: rendering `Maidr`
 * mounts the whole app, and the chat bubbles in it are ESM-only.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { navigateMaidr } from '@service/liveData';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { Maidr } from '../../../src/maidr-component';

const DATA: MaidrData = {
  id: 'navigate-bar',
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
 * Renders the chart without activating it.
 * @returns The figure element a focus lands on.
 */
function renderChart(): HTMLElement {
  render(
    <Maidr data={DATA}>
      <svg />
    </Maidr>,
  );
  return screen.getByRole('img').parentElement as HTMLElement;
}

/**
 * Focuses the figure and lets the controller come up behind its timer.
 * @param figure - The figure element.
 */
function focusIn(figure: HTMLElement): void {
  act(() => {
    fireEvent.focus(figure);
    jest.runOnlyPendingTimers();
  });
}

/**
 * The text the chart is currently announcing, as the Text component shows it.
 * @returns The announced text, or '' when nothing is announced.
 */
function announcedText(): string {
  return document.querySelector('#maidr-figure-navigate-bar')?.textContent ?? '';
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

describe('a target sent from outside', () => {
  it('should move the reader at once while they are inside the figure', () => {
    const figure = renderChart();
    focusIn(figure);
    expect(announcedText()).not.toContain('Category is C');

    let accepted = false;
    act(() => {
      accepted = navigateMaidr({ layerId: 'bar-layer', row: 0, col: 2 }, { id: 'navigate-bar' });
    });

    expect(accepted).toBe(true);
    expect(announcedText()).toContain('Category is C');
  });

  it('should be kept while nobody is inside, and land the reader on it when they arrive', () => {
    const figure = renderChart();

    let accepted = false;
    act(() => {
      accepted = navigateMaidr({ layerId: 'bar-layer', row: 0, col: 1 }, { id: 'navigate-bar' });
    });
    expect(accepted).toBe(true);
    // Nothing is announced to a reader who is not there.
    expect(announcedText()).toBe('');

    focusIn(figure);

    expect(announcedText()).toContain('Category is B');
  });

  it('should forget a kept target that was withdrawn', () => {
    const figure = renderChart();
    act(() => {
      navigateMaidr({ layerId: 'bar-layer', row: 0, col: 1 }, { id: 'navigate-bar' });
      navigateMaidr(null, { id: 'navigate-bar' });
    });

    focusIn(figure);

    // The instruction, not a mark: the reader starts where they always do.
    expect(announcedText()).toContain('Use Arrows to navigate');
    expect(announcedText()).not.toContain('Value');
  });

  it('should refuse a position the figure does not have', () => {
    const figure = renderChart();
    focusIn(figure);
    const before = announcedText();

    let accepted = true;
    act(() => {
      accepted = navigateMaidr({ layerId: 'bar-layer', row: 0, col: 3 }, { id: 'navigate-bar' });
    });

    expect(accepted).toBe(false);
    expect(announcedText()).toBe(before);
  });
});
