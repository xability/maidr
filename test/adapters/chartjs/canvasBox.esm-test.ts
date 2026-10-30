/**
 * @jest-environment jsdom
 */

/**
 * The box a page gives its canvas keeps room below it for MAIDR's fields.
 *
 * Chart.js asks for a parent dedicated to the canvas, and pages give it a
 * fixed height. MAIDR mounts its figure inside that box, the chart keeping the
 * box's size and the text, braille and review fields going below it, so the
 * fields overflowed the box and were drawn over whatever came next: on
 * `examples/chartjs/radar.html` the radar's announcement was printed over the
 * polar chart's title. The box keeps its height, because Chart.js resizes the
 * chart to whatever the box measures, and its bottom margin grows by however
 * far MAIDR's figure runs past it.
 *
 * jsdom lays nothing out and has no `ResizeObserver`, so layout is stubbed at
 * that boundary: the test sets where the box and the figure end, and runs the
 * observer by hand.
 *
 * An `esm-test` because the plugin mounts MAIDR's whole interface, whose chat
 * bubbles are ESM-only.
 */

import type { ChartJsChart } from '@adapters/chartjs/types';
import { maidrPlugin } from '@adapters/chartjs/plugin';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act } from '@testing-library/react';

/** The observers the plugin made, so a test can run them as layout would. */
const observers: { run: () => void; disconnected: boolean }[] = [];

/** A `ResizeObserver` whose callback the test runs. */
class ResizeObserverStub {
  private readonly record: { run: () => void; disconnected: boolean };

  constructor(callback: () => void) {
    this.record = { run: callback, disconnected: false };
    observers.push(this.record);
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {
    this.record.disconnected = true;
  }
}

/**
 * Sets where an element's bottom edge is, as layout would.
 *
 * @param element - The element
 * @param bottom - Its bottom edge, in pixels from the top of the page
 */
function bottomAt(element: Element, bottom: number): void {
  element.getBoundingClientRect = () => ({ bottom }) as DOMRect;
}

/**
 * A two-bar chart drawn on a canvas inside `parent`.
 *
 * @param parent - Where the page put the canvas
 * @returns The chart
 */
function barChartIn(parent: HTMLElement): ChartJsChart {
  const canvas = document.createElement('canvas');
  parent.appendChild(canvas);
  return {
    canvas,
    data: { labels: ['a', 'b'], datasets: [{ label: 'Sales', data: [1, 2] }] },
    options: {},
    config: { type: 'bar' },
    getDatasetMeta: () => ({ type: 'bar', data: [] }),
    setActiveElements: () => {},
    update: () => {},
  } as unknown as ChartJsChart;
}

beforeEach(() => {
  observers.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  document.body.innerHTML = '';
});

describe('the box a page gives its Chart.js canvas', () => {
  it('keeps room below it for MAIDR\'s fields, and gets its own margin back after', async () => {
    const box = document.createElement('div');
    box.style.height = '400px';
    document.body.appendChild(box);
    const chart = barChartIn(box);
    await act(async () => {
      maidrPlugin.afterUpdate?.(chart, {}, {});
    });
    const figure = box.querySelector('figure') as HTMLElement;
    bottomAt(box, 400);

    // The text line runs 34 px past the box; braille adds 100 more.
    bottomAt(figure, 434);
    observers.forEach(observer => observer.run());
    const withText = box.style.marginBottom;
    bottomAt(figure, 534);
    observers.forEach(observer => observer.run());
    const withBraille = box.style.marginBottom;
    act(() => {
      maidrPlugin.beforeDestroy?.(chart, {}, {});
    });

    // The height Chart.js sizes the chart from is never touched.
    expect(box.style.height).toBe('400px');
    expect(withText).toBe('34px');
    expect(withBraille).toBe('134px');
    expect(box.style.marginBottom).toBe('');
    expect(observers.every(observer => observer.disconnected)).toBe(true);
  });

  it('leaves a parent that holds more than the canvas as the page laid it out', async () => {
    const section = document.createElement('section');
    section.appendChild(document.createElement('h2'));
    document.body.appendChild(section);
    const chart = barChartIn(section);

    await act(async () => {
      maidrPlugin.afterUpdate?.(chart, {}, {});
    });

    expect(observers).toHaveLength(0);
    expect(section.style.marginBottom).toBe('');
  });
});
