/**
 * @jest-environment jsdom
 */

/**
 * What returning to the tab does to a reader's place in the chart.
 *
 * This is an `esm-test` because rendering `Maidr` mounts the whole app, and
 * the chat bubbles in it import `react-markdown` — ESM-only, and unloadable
 * from the CommonJS project.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { Maidr } from '../../../src/maidr-component';

const DATA: MaidrData = {
  id: 'visibility-bar',
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
 * Renders the chart and activates it, the way a focus-in does.
 *
 * The controller is built on focus-in behind a zero-delay timer, so the timer
 * is run before the assertions.
 */
function activateChart(): void {
  render(
    <Maidr data={DATA}>
      <svg />
    </Maidr>,
  );

  const figure = screen.getByRole('img').parentElement as HTMLElement;
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
  return document.querySelector('#maidr-figure-visibility-bar')?.textContent ?? '';
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

describe('returning to the tab', () => {
  it('should leave the reader where they were, still announcing', () => {
    // Coming back from another tab used to dispose the controller and build a
    // new one: the cursor went back to the first point, every slice was reset
    // (text, braille, chat, any open dialog) and nothing was announced,
    // because focus had never left and so no focus-in followed.
    activateChart();
    const before = announcedText();

    expect(before).not.toBe('');

    act(() => {
      fireEvent(document, new Event('visibilitychange'));
      jest.runOnlyPendingTimers();
    });

    expect(announcedText()).toBe(before);
  });
});
