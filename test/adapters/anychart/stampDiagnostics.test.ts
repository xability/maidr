/**
 * What the stampers say on a bind, and how often.
 *
 * The box and scatter stampers shipped with the diagnostics they were
 * developed against — a per-series summary written on every render, a per-box
 * line under it, and a scatter line that reports the candidate count whether or
 * not it matches. They cost four selector scans per series and four more per
 * box, and they write into the exact console a developer would be reading to
 * find a real stamping failure: a twenty-box chart buries one genuine warning
 * under sixty that say nothing is wrong.
 */

import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@adapters/anychart/types';
import { bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

let warn: jest.SpiedFunction<typeof console.warn>;

function createIterator(rows: Array<Record<string, unknown>>): AnyChartIterator {
  let index = -1;
  return {
    advance: () => ++index < rows.length,
    get: (field: string) => rows[index]?.[field],
    getIndex: () => index,
    getRowsCount: () => rows.length,
    reset: () => {
      index = -1;
    },
  };
}

function createSeries(seriesType: string, rows: Array<Record<string, unknown>>): AnyChartSeries {
  return {
    id: () => 0,
    name: () => seriesType,
    seriesType: () => seriesType,
    getIterator: () => createIterator(rows),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
}

/** A container holding a rendered chart, with one marker-sized shape per x. */
function createRendered(id: string, markerXs: number[] = []): HTMLElement {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);
  container.appendChild(svg);
  document.body.appendChild(container);

  markerXs.forEach((x, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.id = `ac_path_${i}`;
    path.setAttribute('fill', '#64b5f6');
    Object.defineProperty(path, 'getBBox', {
      value: () => ({ x, y: 100, width: 6, height: 6 }),
    });
    layer.appendChild(path);
  });

  return container;
}

function createChart(series: AnyChartSeries[], container: HTMLElement): AnyChartInstance {
  return {
    title: () => 'Chart',
    container: () => container,
    getType: () => '',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
  } as unknown as AnyChartInstance;
}

/** Everything written to the console during a bind, as plain strings. */
function messages(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('what binding a scatter chart reports', () => {
  it('says nothing when it found a candidate for every point', () => {
    const container = createRendered('scatter-clean', [10, 20, 30]);
    const chart = createChart(
      [createSeries('marker', [{ x: 1, value: 1 }, { x: 2, value: 2 }, { x: 3, value: 3 }])],
      container,
    );

    bindAnyChart(chart);

    expect(messages()).toEqual([]);

    cleanUp(container);
  });

  it('still reports a shortfall it cannot stamp round', () => {
    const container = createRendered('scatter-short', [10]);
    const chart = createChart(
      [createSeries('marker', [{ x: 1, value: 1 }, { x: 2, value: 2 }])],
      container,
    );

    bindAnyChart(chart);

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('Expected 2 scatter marker shapes');

    cleanUp(container);
  });
});

describe('what binding a box chart reports', () => {
  it('reports the one failure once, without a summary of it', () => {
    // jsdom resolves no computed `fill` for an SVG presentation attribute, so
    // the IQR filter finds nothing here — which is the failure worth one line.
    // The temporary diagnostics added three more saying the same thing.
    const container = createRendered('box-none');
    const chart = createChart(
      [createSeries('box', [{ x: 'A', lowest: 1, q1: 2, median: 3, q3: 4, highest: 5 }])],
      container,
    );

    bindAnyChart(chart);

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('Expected 1 IQR shapes');

    cleanUp(container);
  });
});
