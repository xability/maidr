/**
 * How a chart with more than one series hands its marks out.
 *
 * `stampLineAttributes` and `stampScatterAttributes` collect every marker-sized
 * shape in the SVG geometrically — AnyChart 8.x gives them no class to aim at —
 * and then split that one flat list between the series. The split is where the
 * pairing between what is announced and what is outlined is decided, and it
 * fails silently: the announcements come from the series' own rows and stay
 * correct whatever the split does.
 *
 * Two shapes of chart are exercised here, because they break the split in
 * different directions: a combined chart whose first series is not line-like
 * at all, and two line series of unequal length.
 */

import type {
  AnyChartInstance,
  AnyChartIterator,
  AnyChartSeries,
} from '@adapters/anychart/types';
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
const LINE_ATTR = 'data-maidr-anychart-line-point';
const POINT_ATTR = 'data-maidr-anychart-point';

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

/** A drawn series of `count` points, of the given AnyChart type. */
function createSeries(seriesType: string, count: number, name: string): AnyChartSeries {
  const rows = Array.from({ length: count }, (_, i) => ({ x: `c${i}`, value: i + 1 }));
  return {
    id: () => 0,
    name: () => name,
    seriesType: () => seriesType,
    getIterator: () => createIterator(rows),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
}

function createChart(series: AnyChartSeries[], container: HTMLElement): AnyChartInstance {
  return {
    title: () => 'Combined',
    container: () => container,
    getType: () => '',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    xScale: () => ({ getType: () => 'ordinal', inverted: () => false }),
    yScale: () => ({ inverted: () => false }),
  } as unknown as AnyChartInstance;
}

/**
 * A rendered chart: one marker-sized shape per entry in `markerXs`, plus the
 * optional oversized rects a column series draws, which the marker filter
 * must reject on size.
 *
 * jsdom implements no `getBBox`, so each shape is given the box the geometric
 * filter reads. The markers are appended in a scrambled order on purpose: the
 * stampers sort their candidates by x, so DOM order must not decide anything.
 */
function createRenderedChart(
  id: string,
  markerXs: number[],
  barWidths: number[] = [],
): { container: HTMLElement; markers: SVGElement[] } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);
  container.appendChild(svg);
  document.body.appendChild(container);

  const box = (element: Element, x: number, width: number, height: number): void => {
    Object.defineProperty(element, 'getBBox', {
      value: () => ({ x, y: 100, width, height }),
    });
  };

  barWidths.forEach((width, i) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.id = `ac_path_bar_${i}`;
    rect.setAttribute('fill', '#888888');
    box(rect, i * 100, width, 200);
    layer.appendChild(rect);
  });

  const markers = markerXs.map((x, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.id = `ac_path_marker_${i}`;
    path.setAttribute('fill', '#64b5f6');
    box(path, x, 6, 6);
    layer.appendChild(path);
    return path as unknown as SVGElement;
  });

  return { container, markers };
}

/** The stamp each marker carries, in the order the markers were listed. */
function stamps(markers: SVGElement[], attribute: string): (string | null)[] {
  return markers.map(marker => marker.getAttribute(attribute));
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('bindAnyChart (multi-series line stamping)', () => {
  it('stamps a line overlay drawn beside a column series', () => {
    // `anychart.column(); chart.column(bars); chart.line(points)` — the line is
    // series 1, and the columns are rejected by the marker filter on size, so
    // the whole candidate list belongs to the line. Offsetting by the series'
    // own index skips past every candidate there is and stamps nothing, and
    // the emitted `[…-line-point^="1-"]` selector then resolves to no element:
    // the series announces correctly and never highlights.
    const { container, markers } = createRenderedChart('combo', [10, 40, 70, 100], [60, 60, 60, 60]);
    const chart = createChart(
      [createSeries('column', 4, 'Revenue'), createSeries('line', 4, 'Margin')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, LINE_ATTR)).toEqual(['1-0', '1-1', '1-2', '1-3']);

    cleanUp(container);
  });

  it('gives each of two unequal line series its own marks', () => {
    // Three points then five. The second series must start where the first
    // stopped; striding by its own length instead starts it two marks late,
    // so its first point is announced against another series' mark and its
    // last two marks are never reachable at all.
    const { container, markers } = createRenderedChart(
      'unequal',
      [10, 20, 30, 40, 50, 60, 70, 80],
    );
    const chart = createChart(
      [createSeries('line', 3, 'A'), createSeries('line', 5, 'B')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, LINE_ATTR))
      .toEqual(['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '1-3', '1-4']);

    cleanUp(container);
  });
});

describe('bindAnyChart (multi-series scatter stamping)', () => {
  it('gives each of two unequal scatter series its own points', () => {
    const { container, markers } = createRenderedChart(
      'scatter-unequal',
      [10, 20, 30, 40, 50, 60, 70, 80],
    );
    const chart = createChart(
      [createSeries('marker', 3, 'A'), createSeries('marker', 5, 'B')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, POINT_ATTR))
      .toEqual(['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '1-3', '1-4']);

    cleanUp(container);
  });
});
