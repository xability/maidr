/**
 * What the adapter does when AnyChart draws a bound chart again: a legend
 * click, a resize or a change of data.
 *
 * The adapter stamps a chart's marks when it binds the chart, and MAIDR reads
 * the chart's data and stamps when it builds its layers. A redraw can leave
 * both behind: a series shown after binding is drawn with marks nothing
 * stamped, a series hidden with its legend item is still read, and the marks
 * a rescale moves are outlined where they were. These cases fire the chart's
 * `chartdraw` listeners by hand, as AnyChart fires them at the end of a draw.
 */

import type { AnyChartInstance, AnyChartIterator } from '@adapters/anychart/types';
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
const FUNNEL_ATTR = 'data-maidr-anychart-funnel-stage';

function element(tag: string, attributes: Record<string, string>, parent: Element): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as unknown as SVGElement;
  for (const [name, value] of Object.entries(attributes))
    el.setAttribute(name, value);
  parent.appendChild(el);
  return el;
}

/**
 * A container holding a drawn chart's `<svg>`, 700 by 400 pixels on the page,
 * with the root layer and the chart group the marks are drawn into.
 */
function renderChart(id: string): { container: HTMLElement; svg: SVGElement; chartGroup: SVGElement } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGElement;
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 700, bottom: 400, width: 700, height: 400 }),
  });
  container.appendChild(svg);
  document.body.appendChild(container);
  const root = element('g', { id: 'ac_layer_root' }, svg);
  const chartGroup = element('g', { id: 'ac_chart_1' }, root);
  return { container, svg, chartGroup };
}

function iterate(rows: Array<Record<string, unknown>>): () => AnyChartIterator {
  return () => {
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
  };
}

/** A chart whose `chartdraw` listeners `redraw` calls, as AnyChart calls them after a draw. */
function redrawing(chart: AnyChartInstance): { chart: AnyChartInstance; redraw: () => void } {
  const listeners: Array<() => void> = [];
  const listening = {
    ...chart,
    listen: (type: string, listener: () => void) => {
      if (type === 'chartdraw')
        listeners.push(listener);
    },
  } as AnyChartInstance;
  return { chart: listening, redraw: () => listeners.forEach(listener => listener()) };
}

/** A funnel: a chart-level dataset with no series API. */
function createFunnel(container: HTMLElement): AnyChartInstance {
  const rows = [
    { name: 'Visited the site', value: 24000 },
    { name: 'Viewed a product', value: 9800 },
    { name: 'Added to cart', value: 2400 },
  ];
  return {
    title: () => 'Chart',
    container: () => container,
    getType: () => 'funnel',
    data: () => ({ getIterator: iterate(rows) }),
  } as unknown as AnyChartInstance;
}

/** A funnel's segments, drawn into a layer of their own. */
function drawSegments(layer: Element, count: number, from = 0): SVGElement[] {
  return Array.from({ length: count }, (_, i) =>
    element('path', { id: `ac_path_segment_${from + i}`, fill: '#1976d2', stroke: 'none', d: 'M 110 37 L 579 37 465 281 224 281 Z' }, layer));
}

/** MAIDR's copy of a mark, as its core inserts one while the reader is in the chart. */
function addMaidrCopy(mark: SVGElement): void {
  const copy = mark.cloneNode(true) as SVGElement;
  copy.setAttribute('visibility', 'hidden');
  copy.setAttribute('data-maidr-owned', 'true');
  mark.after(copy);
}

function stamps(elements: SVGElement[], attribute: string): Array<string | null> {
  return elements.map(el => el.getAttribute(attribute));
}

function cleanUp(container: HTMLElement): void {
  (container.closest<HTMLElement>('[data-maidr-anychart-host]') ?? container).remove();
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('bindAnyChart (a chart drawn again)', () => {
  it('stamps the new marks of a single-dataset chart drawn again', () => {
    // Only the bar, line and scatter stampers ran again after a draw, so a
    // funnel drawn with new segments kept none stamped.
    const { container, chartGroup } = renderChart('funnel-redrawn');
    const layer = element('g', { id: 'ac_layer_segments' }, chartGroup);
    const first = drawSegments(layer, 3);
    const { chart, redraw } = redrawing(createFunnel(container));
    bindAnyChart(chart);
    first.forEach(segment => segment.remove());
    const segments = drawSegments(layer, 3, 3);

    redraw();

    expect(stamps(segments, FUNNEL_ATTR)).toEqual(['0-0', '0-1', '0-2']);

    cleanUp(container);
  });

  it('stamps the drawing as it now stands, not as it was bound', () => {
    // A redraw that draws the stages in each other's shapes leaves each stamp
    // on a shape that is now another stage's.
    const { container, chartGroup } = renderChart('funnel-reordered');
    const layer = element('g', { id: 'ac_layer_segments' }, chartGroup);
    const [top, middle, bottom] = drawSegments(layer, 3);
    const { chart, redraw } = redrawing(createFunnel(container));
    bindAnyChart(chart);
    layer.insertBefore(bottom, top);

    redraw();

    expect(stamps([bottom, top, middle], FUNNEL_ATTR)).toEqual(['0-0', '0-1', '0-2']);

    cleanUp(container);
  });

  it('passes over the copies MAIDR keeps of the marks while the reader is in the chart', () => {
    // A copy carries its mark's stamp and stands beside it. Counted, the
    // funnel held six segments for three stages, and nothing was stamped.
    const { container, chartGroup } = renderChart('funnel-copies');
    const layer = element('g', { id: 'ac_layer_segments' }, chartGroup);
    const segments = drawSegments(layer, 3);
    const { chart, redraw } = redrawing(createFunnel(container));
    bindAnyChart(chart);
    segments.forEach(addMaidrCopy);
    const warn = jest.mocked(console.warn);
    warn.mockClear();

    redraw();

    expect(stamps(segments, FUNNEL_ATTR)).toEqual(['0-0', '0-1', '0-2']);
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });
});
