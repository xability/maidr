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

import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@adapters/anychart/types';
import type { LinePoint, Maidr } from '@type/grammar';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { anyChartToMaidr, bindAnyChart } from '@adapters/anychart/converters';
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
const LINE_ATTR = 'data-maidr-anychart-line-point';

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
function addMaidrCopy(mark: SVGElement): SVGElement {
  const copy = mark.cloneNode(true) as SVGElement;
  copy.setAttribute('visibility', 'hidden');
  copy.setAttribute('data-maidr-owned', 'true');
  mark.after(copy);
  return copy;
}

/** A line chart of two series, whose `enabled()` the caller decides. */
function createLineChart(
  container: HTMLElement,
  drawn: (index: number) => boolean,
): AnyChartInstance {
  const series = ['Alpha', 'Beta'].map((name, s): AnyChartSeries => ({
    id: () => s,
    name: () => name,
    seriesType: () => 'line',
    enabled: () => drawn(s),
    zIndex: () => 31 + s * 0.00001,
    getIterator: iterate([0, 1, 2].map(i => ({ x: `Q${i + 1}`, value: (s + 1) * 10 + i }))),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  }));
  return {
    title: () => 'Sales',
    container: () => container,
    getType: () => 'line',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    xScale: () => ({ getType: () => 'ordinal', inverted: () => false }),
    yScale: () => ({ inverted: () => false }),
  } as unknown as AnyChartInstance;
}

/** A line's three markers, in a layer of their own. */
function drawMarkers(chartGroup: SVGElement, id: string): SVGElement[] {
  const layer = element('g', { id }, chartGroup);
  return [100, 300, 500].map((x) => {
    const marker = element('path', { fill: '#1976d2', d: `M ${x} 100 L ${x + 6} 106` }, layer);
    Object.defineProperty(marker, 'getBBox', { value: () => ({ x, y: 100, width: 6, height: 6 }) });
    return marker;
  });
}

/** The host `<div>` the adapter wraps a bound chart's container in. */
function hostOf(container: HTMLElement): HTMLElement {
  return container.closest<HTMLElement>('[data-maidr-anychart-host]') ?? container;
}

/** Stand a MAIDR figure around the chart's host, as mounting MAIDR on it does. */
function mount(container: HTMLElement, id: string): void {
  const host = hostOf(container);
  const figure = document.createElement('div');
  figure.id = `maidr-figure-${id}`;
  host.parentNode?.insertBefore(figure, host);
  figure.appendChild(host);
}

function stamps(elements: SVGElement[], attribute: string): Array<string | null> {
  return elements.map(el => el.getAttribute(attribute));
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[id^="maidr-figure-"]') ?? hostOf(container)).remove();
}

let setData: jest.Mock<(maidr: Maidr) => boolean>;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setData = jest.fn((_maidr: Maidr) => true);
  Object.assign(globalThis, { maidrLive: { setData } });
});
afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { maidrLive?: unknown }).maidrLive;
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

  it('takes the stamps off MAIDR\'s copies, so that a layer\'s selector matches its marks alone', () => {
    // The copy MAIDR draws as the outline of the mark the reader is on kept
    // its stamp. When MAIDR took in the redrawn chart, the layer's selector
    // found one mark more than the layer has points, and the layer lost its
    // highlight.
    const { container, chartGroup } = renderChart('funnel-outline');
    const layer = element('g', { id: 'ac_layer_segments' }, chartGroup);
    const segments = drawSegments(layer, 3);
    const { chart, redraw } = redrawing(createFunnel(container));
    bindAnyChart(chart);
    const outline = addMaidrCopy(segments[1]);

    redraw();

    expect(outline.getAttribute(FUNNEL_ATTR)).toBeNull();
    expect(container.querySelectorAll(`[${FUNNEL_ATTR}]`)).toHaveLength(3);

    cleanUp(container);
  });

  it('binds a chart live, so that MAIDR applies a redraw while the reader is in it', () => {
    const { container, chartGroup } = renderChart('line-live');
    drawMarkers(chartGroup, 'ac_layer_alpha');
    drawMarkers(chartGroup, 'ac_layer_beta');

    const maidr = bindAnyChart(createLineChart(container, () => true));

    expect(maidr?.live).toBe(true);
    expect(JSON.parse(hostOf(container).getAttribute('maidr-data') ?? '{}').live).toBe(true);

    cleanUp(container);
  });

  it('hands MAIDR the chart again, without a series its legend item hid', () => {
    // MAIDR kept reading the hidden series, and kept the outlines it had made
    // where the redraw no longer drew them.
    const shown = [true, true];
    const { container, chartGroup } = renderChart('line-legend');
    drawMarkers(chartGroup, 'ac_layer_alpha');
    const beta = drawMarkers(chartGroup, 'ac_layer_beta');
    const { chart, redraw } = redrawing(createLineChart(container, s => shown[s]));
    const bound = bindAnyChart(chart);
    mount(container, bound?.id ?? '');
    shown[1] = false;
    beta[0].parentElement?.remove();

    redraw();

    expect(setData).toHaveBeenCalledTimes(1);
    const handed = setData.mock.calls[0][0];
    expect(handed.id).toBe(bound?.id);
    expect(handed.live).toBe(true);
    const layers = handed.subplots[0][0].layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].selectors).toContain(`[${LINE_ATTR}^="0-"]`);

    cleanUp(container);
  });

  it('hands a redraw that changed no data over while the reader is in the chart', () => {
    // A resize moves the marks the reader's outline stands on.
    const { container, chartGroup } = renderChart('line-resized-in');
    drawMarkers(chartGroup, 'ac_layer_alpha');
    drawMarkers(chartGroup, 'ac_layer_beta');
    const { chart, redraw } = redrawing(createLineChart(container, () => true));
    const bound = bindAnyChart(chart);
    mount(container, bound?.id ?? '');
    const plot = document.createElement('div');
    plot.tabIndex = 0;
    document.getElementById(`maidr-figure-${bound?.id}`)?.appendChild(plot);
    plot.focus();

    redraw();

    expect(setData).toHaveBeenCalledTimes(1);

    cleanUp(container);
  });

  it('hands a redraw that changed no data over to no one while the reader is away', () => {
    // Every update counts as new data, and MAIDR puts a reader who comes
    // back after new data at the start rather than where they left off.
    const { container, chartGroup } = renderChart('line-resized-away');
    drawMarkers(chartGroup, 'ac_layer_alpha');
    drawMarkers(chartGroup, 'ac_layer_beta');
    const { chart, redraw } = redrawing(createLineChart(container, () => true));
    const bound = bindAnyChart(chart);
    mount(container, bound?.id ?? '');

    redraw();

    expect(setData).not.toHaveBeenCalled();

    cleanUp(container);
  });

  it('hands nothing over before MAIDR is mounted on the chart', () => {
    const { container, chartGroup } = renderChart('line-unmounted');
    drawMarkers(chartGroup, 'ac_layer_alpha');
    drawMarkers(chartGroup, 'ac_layer_beta');
    const { chart, redraw } = redrawing(createLineChart(container, () => true));
    bindAnyChart(chart);

    redraw();

    expect(setData).not.toHaveBeenCalled();

    cleanUp(container);
  });
});

describe('anyChartToMaidr (a hidden series)', () => {
  it('leaves out a series hidden with enabled(false)', () => {
    // Read anyway, its points were announced, and none of them was drawn.
    const { container } = renderChart('line-hidden');

    const maidr = anyChartToMaidr(createLineChart(container, s => s === 0));

    const layers = maidr?.subplots[0][0].layers ?? [];
    expect(layers).toHaveLength(1);
    // Alpha's points, the series drawn, under its index on the chart.
    expect(layers[0].id).toBe('0');
    expect((layers[0].data as LinePoint[][])[0].map(point => point.y)).toEqual([10, 11, 12]);

    cleanUp(container);
  });
});

describe('the stamps a redraw takes off', () => {
  it('include every attribute a stamper writes on a mark', () => {
    // A stamper added without its attribute in MARK_STAMP_ATTRS would leave
    // its stamps on the marks a redraw gives to other points.
    const source = readFileSync(path.join(__dirname, '../../../src/adapters/anychart/converters.ts'), 'utf8');
    const cleared = new Set(/const MARK_STAMP_ATTRS = \[([^\]]*)\]/.exec(source)?.[1].match(/\b[A-Z_]+_ATTR\b/g) ?? []);
    const written = new Set(Array.from(source.matchAll(/\.setAttribute\(\s*([A-Z_]+_ATTR)\b/g), match => match[1]));
    // The panel token is the SVG's, not a mark's, and a whisker's halves are
    // taken out whole.
    const notMarkStamps = new Set(['PANEL_ATTR', 'SPLIT_FROM_ATTR']);

    expect(written.size).toBeGreaterThan(10);
    expect([...written].filter(name => !cleared.has(name) && !notMarkStamps.has(name))).toEqual([]);
  });
});
