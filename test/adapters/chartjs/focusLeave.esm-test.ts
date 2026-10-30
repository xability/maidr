/**
 * @jest-environment jsdom
 */

/**
 * The Chart.js highlight goes when the reader leaves the chart.
 *
 * MAIDR says nothing through `onNavigate` when focus leaves a chart, and the
 * plugin kept its box -- and Chart.js's own active point and tooltip -- on
 * the point the reader had left. On a page of two charts both were
 * highlighted while only one was being read. Every other adapter that draws
 * its highlight over a canvas clears it when focus leaves.
 *
 * An `esm-test` because the plugin mounts MAIDR's whole interface, whose chat
 * bubbles are ESM-only.
 */

import type { ChartJsActiveElement, ChartJsChart } from '@adapters/chartjs/types';
import { maidrPlugin } from '@adapters/chartjs/plugin';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react';

/**
 * A two-bar chart, its canvas in a sized box as Chart.js recommends, and a
 * button after it to leave to.
 *
 * @returns The chart, the record of what Chart.js was told to make active,
 * and the button after it
 */
function barChart(): {
  chart: ChartJsChart;
  active: jest.Mock<(elements: ChartJsActiveElement[]) => void>;
  elsewhere: HTMLButtonElement;
} {
  const box = document.createElement('div');
  const canvas = document.createElement('canvas');
  box.appendChild(canvas);
  const elsewhere = document.createElement('button');
  elsewhere.textContent = 'Elsewhere';
  document.body.append(box, elsewhere);

  const active = jest.fn<(elements: ChartJsActiveElement[]) => void>();
  const chart = {
    canvas,
    data: { labels: ['a', 'b'], datasets: [{ label: 'Sales', data: [1, 2] }] },
    options: {},
    config: { type: 'bar' },
    chartArea: { left: 0, top: 0, right: 100, bottom: 100 },
    // Where Chart.js drew each bar, which is what the overlay outlines.
    getDatasetMeta: () => ({
      type: 'bar',
      data: [
        { x: 25, y: 50, base: 100, width: 20, height: 50 },
        { x: 75, y: 20, base: 100, width: 20, height: 80 },
      ],
    }),
    setActiveElements: active,
    tooltip: { setActiveElements: () => {} },
    update: () => {},
  } as unknown as ChartJsChart;

  return { chart, active, elsewhere };
}

/** The boxes the overlay has drawn over the canvas. */
function highlights(): number {
  return document.querySelectorAll('[data-maidr-chartjs-highlight]').length;
}

/**
 * Presses a key where the reader's focus is, as the keyboard does.
 *
 * @param key - The key's name
 * @param code - The physical key, which is what hotkeys-js reads
 * @param keyCode - The key's legacy code
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
 * Mounts MAIDR on the chart, focuses it, and moves to a bar.
 *
 * @param chart - The chart to read
 */
async function readABar(chart: ChartJsChart): Promise<void> {
  await act(async () => {
    maidrPlugin.afterUpdate?.(chart, {}, {});
  });
  act(() => {
    document.querySelector<HTMLElement>('figure[id^="maidr-figure-"] > [tabindex="0"]')?.focus();
    jest.runOnlyPendingTimers();
  });
  press('ArrowRight', 'ArrowRight', 39);
}

// jsdom implements neither structuredClone nor the Web Audio API, both of
// which MAIDR's controller reaches for as it starts. Stubbed at that
// boundary, as the controller's own tests stub them.
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

beforeAll(() => {
  globalThis.structuredClone = (<T>(value: T): T => JSON.parse(JSON.stringify(value)) as T) as typeof structuredClone;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = function AudioContextStub(): Record<string, unknown> {
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

describe('the Chart.js highlight when focus moves', () => {
  it('is cleared when focus leaves the chart', async () => {
    const { chart, active, elsewhere } = barChart();
    await readABar(chart);
    expect(highlights()).toBe(1);

    act(() => {
      elsewhere.focus();
      jest.runOnlyPendingTimers();
    });

    expect(highlights()).toBe(0);
    expect(active).toHaveBeenLastCalledWith([]);
  });

  it('stays while focus moves to the chart\'s own braille field', async () => {
    const { chart } = barChart();
    await readABar(chart);

    press('b', 'KeyB', 66);

    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    expect(highlights()).toBe(1);
  });
});
