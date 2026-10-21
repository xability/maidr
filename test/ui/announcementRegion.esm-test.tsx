/**
 * @jest-environment jsdom
 */

/**
 * Where a chart's announcements are spoken from.
 *
 * Every announcement -- a move, a notification, the same text again -- is a
 * new element added to the figure's `aria-live` region. The region is there
 * from the chart's first render, before the reader ever focuses the chart, so
 * a message sent by the focus-in that mounts the rest of the UI is a change
 * to a region the screen reader already knows, not a region arriving with its
 * text already in it, which screen readers do not announce.
 *
 * No announcement carries `role="alert"`: NVDA speaks an alert's role before
 * its text, so a reader moving through a chart heard "alert" on every key.
 *
 * jsdom has no accessibility tree, so what is pinned is the DOM a browser
 * builds one from. An `esm-test` for the same reason the visibility test is:
 * rendering `Maidr` mounts the whole app, and the chat bubbles in it are
 * ESM-only.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { Maidr } from '../../src/maidr-component';

const DATA: MaidrData = {
  id: 'announcement-bar',
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

/** The figure's live region, found the way a test harness outside MAIDR finds it. */
const REGION = '[id^="maidr-announcement-"]';

/**
 * Renders the chart beside another control on the page, without activating it.
 * @returns The figure.
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
 * The figure's live region.
 * @returns The region.
 */
function region(): HTMLElement {
  const found = document.querySelector<HTMLElement>(REGION);
  if (found === null) {
    throw new Error('no announcement region');
  }
  return found;
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

let observer: MutationObserver | null = null;

/**
 * Records what is added to the region from here on, in order. A live region
 * announces the mutation, not the text, so an identical message is heard
 * again only if it arrives again -- which the region's current text cannot
 * tell.
 * @param target - The region to watch.
 * @returns A function giving the elements added so far.
 */
function watch(target: HTMLElement): () => HTMLElement[] {
  const added: HTMLElement[] = [];
  const take = (records: MutationRecord[]): void => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          added.push(node);
        }
      });
    }
  };
  observer = new MutationObserver(take);
  observer.observe(target, { childList: true });
  const watching = observer;
  return () => {
    take(watching.takeRecords());
    return [...added];
  };
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
});

afterEach(() => {
  observer?.disconnect();
  observer = null;
  jest.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('the announcement region', () => {
  it('should be in the figure, empty and assertive, before the reader focuses the chart', () => {
    const figure = renderChart();

    expect(figure.contains(region())).toBe(true);
    expect(region().getAttribute('aria-live')).toBe('assertive');
    expect(region().getAttribute('aria-atomic')).toBe('true');
    expect(region().hasAttribute('role')).toBe(false);
    expect(region().textContent).toBe('');
    // The rest of the UI is not there yet: a focus-in mounts it.
    expect(document.getElementById('maidr-text-container')).toBeNull();
  });

  it('should be given each announcement as a new element, an identical one included', () => {
    renderChart();
    focusIn();
    const announcements = watch(region());

    press('ArrowRight', 'ArrowRight', 39);
    // Past the first point: the same message, twice.
    press('ArrowLeft', 'ArrowLeft', 37);
    press('ArrowLeft', 'ArrowLeft', 37);

    const added = announcements();
    expect(added.map(element => element.textContent)).toEqual([
      expect.stringContaining('Category is A'),
      'No more data to display',
      'No more data to display',
    ]);
    expect(added[1]).not.toBe(added[2]);
    // A block, so each is an accessible object of its own: Chromium tells a
    // new child from the old one by that object, and a run of identical text
    // replaced in place would be no change at all.
    expect(added.every(element => element.tagName === 'DIV')).toBe(true);
    expect(region().children).toHaveLength(1);
  });

  it('should never announce through role="alert"', () => {
    const figure = renderChart();
    focusIn();

    press('ArrowRight', 'ArrowRight', 39);
    press('ArrowLeft', 'ArrowLeft', 37);
    // A notification, rather than a move.
    press('t', 'KeyT', 84);

    expect(region().textContent).toContain('Text mode is');
    expect(figure.querySelector('[role="alert"]')).toBeNull();
    expect(region().querySelector('[role]')).toBeNull();
  });

  it('should take a returning reader\'s point in the region that was there before they came back', () => {
    renderChart();
    focusIn();
    press('ArrowRight', 'ArrowRight', 39);
    press('ArrowRight', 'ArrowRight', 39);
    tabOut();
    const before = region();
    // Emptied with the UI the reader left.
    expect(before.textContent).toBe('');
    const announcements = watch(before);

    focusIn();

    expect(region()).toBe(before);
    expect(announcements().map(element => element.textContent)).toEqual([
      expect.stringContaining('Category is B'),
    ]);
  });

  it('should speak at the ARIA mode the reader saved, from the moment they enter', () => {
    localStorage.setItem('maidr-settings', JSON.stringify({ general: { ariaMode: 'polite' } }));
    renderChart();
    focusIn();
    const announcements = watch(region());

    press('ArrowRight', 'ArrowRight', 39);

    expect(region().getAttribute('aria-live')).toBe('polite');
    expect(announcements().map(element => element.textContent)).toEqual([
      expect.stringContaining('Category is A'),
    ]);
  });

  it('should follow the ARIA mode the reader changes in settings', () => {
    renderChart();
    focusIn();
    expect(region().getAttribute('aria-live')).toBe('assertive');

    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: ',', code: 'Comma', keyCode: 188, ctrlKey: true });
      fireEvent.keyUp(document.activeElement ?? document.body, { key: ',', code: 'Comma', keyCode: 188, ctrlKey: true });
      jest.runOnlyPendingTimers();
    });
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: 'Polite' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save & Close Settings' }));
      jest.runOnlyPendingTimers();
    });

    expect(region().getAttribute('aria-live')).toBe('polite');
  });
});
