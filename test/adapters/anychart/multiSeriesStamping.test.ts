/**
 * How a chart with more than one series hands its marks out.
 *
 * `stampLineAttributes` and `stampScatterAttributes` collect every marker-sized
 * shape in the SVG geometrically — AnyChart 8.x gives them no class to aim at —
 * and then split them between the series by the layer each series draws its
 * marks into. The split is where the pairing between what is announced and
 * what is outlined is decided, and it fails silently: the announcements come
 * from the series' own rows and stay correct whatever the split does.
 *
 * The shapes of chart exercised here break the split in different directions:
 * a combined chart whose first series is not line-like at all, series of
 * unequal length, series whose marks share every x position, and a series
 * that draws no marks at all.
 */

import type {
  AnyChartInstance,
  AnyChartIterator,
  AnyChartMarkers,
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
function createSeries(
  seriesType: string,
  count: number,
  name: string,
  overrides: Partial<AnyChartSeries> = {},
): AnyChartSeries {
  const rows = Array.from({ length: count }, (_, i) => ({ x: `c${i}`, value: i + 1 }));
  return {
    id: () => 0,
    name: () => name,
    seriesType: () => seriesType,
    getIterator: () => createIterator(rows),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
    ...overrides,
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
 * rects a column series draws, `barHeight` tall: at the default the marker
 * filter rejects them on size, and a short bar is as small as a marker.
 *
 * jsdom implements no `getBBox`, so each shape is given the box the geometric
 * filter reads. AnyChart draws each line series' markers into a layer of its
 * own, so `layerSizes` splits the markers, in order, into one layer per series;
 * left out, they share one layer. The bars go into the first layer.
 */
function createRenderedChart(
  id: string,
  markerXs: number[],
  barWidths: number[] = [],
  layerSizes: number[] = [markerXs.length],
  barHeight = 200,
): { container: HTMLElement; markers: SVGElement[]; bars: SVGElement[] } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const layers = layerSizes.map((_, i) => {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = `ac_layer_${i + 1}`;
    svg.appendChild(layer);
    return layer;
  });
  const layer = layers[0];
  container.appendChild(svg);
  document.body.appendChild(container);

  const box = (element: Element, x: number, width: number, height: number): void => {
    Object.defineProperty(element, 'getBBox', {
      value: () => ({ x, y: 100, width, height }),
    });
  };

  const bars = barWidths.map((width, i) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.id = `ac_path_bar_${i}`;
    rect.setAttribute('fill', '#888888');
    box(rect, i * 100, width, barHeight);
    layer.appendChild(rect);
    return rect as unknown as SVGElement;
  });

  // The layer each marker goes into: the first `layerSizes[0]` into the first.
  const layerOf = layerSizes.flatMap((size, i) => Array.from({ length: size }, () => layers[i]));
  const markers = markerXs.map((x, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.id = `ac_path_marker_${i}`;
    path.setAttribute('fill', '#64b5f6');
    box(path, x, 6, 6);
    (layerOf[i] ?? layer).appendChild(path);
    return path as unknown as SVGElement;
  });

  return { container, markers, bars };
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

  it('leaves the short bars of a column series beside a line to the column', () => {
    // Measured on AnyChart 8.13: a column series' bars 30 px wide and 7 to 10
    // px tall pass the marker filter. They are drawn in a layer of their own
    // ahead of the line's markers, so the line took them for its markers,
    // outlined bars, and left its own markers unstamped.
    const { container, markers, bars } = createRenderedChart(
      'combo-short-bars',
      [15, 115, 215, 315],
      [30, 30, 30, 30],
      [0, 4],
      7,
    );
    const chart = createChart(
      [createSeries('column', 4, 'Units'), createSeries('line', 4, 'Margin')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, LINE_ATTR)).toEqual(['1-0', '1-1', '1-2', '1-3']);
    expect(stamps(bars, LINE_ATTR)).toEqual([null, null, null, null]);
    expect(stamps(bars, 'data-maidr-anychart-bar')).toEqual(['0-0', '0-1', '0-2', '0-3']);

    cleanUp(container);
  });

  it('gives each of two unequal line series its own marks', () => {
    // Three points then five, each series' markers in a layer of its own.
    const { container, markers } = createRenderedChart(
      'unequal',
      [10, 20, 30, 40, 50, 60, 70, 80],
      [],
      [3, 5],
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

  it('gives a series that draws no markers no layer, and the series after it its own', () => {
    // Measured on AnyChart 8.13: of three lines with the second hidden by
    // `enabled(false)`, the hidden one was stamped on the third line's
    // markers, and the third line found none. A series whose markers stay off
    // draws none either. The markers are listed out of x order within their
    // layers: the order they are drawn in decides nothing.
    const quiet: Array<Partial<AnyChartSeries>> = [
      { enabled: () => false },
      { markers: () => ({ enabled: () => false }) as unknown as AnyChartMarkers },
    ];
    for (const [variant, overrides] of quiet.entries()) {
      const { container, markers } = createRenderedChart(
        `quiet-${variant}`,
        [449, 141, 603, 295, 295, 603, 141, 449],
        [],
        [4, 4],
      );
      const chart = createChart(
        [createSeries('line', 4, 'A'), createSeries('line', 4, 'B', overrides), createSeries('line', 4, 'C')],
        container,
      );

      bindAnyChart(chart);

      expect(stamps(markers, LINE_ATTR))
        .toEqual(['0-2', '0-0', '0-3', '0-1', '2-1', '2-3', '2-0', '2-2']);

      cleanUp(container);
    }
  });

  it('gives each band of a stacked area the markers drawn in its own layer', () => {
    // Three bands over the same four years, as `examples/anychart/area.html`
    // draws them: every year has a marker from each band at the same x. Split
    // into runs of four along x, the first band took all three 2019 markers
    // and Desktop's 2020 one, so "Desktop, 2021" outlined Mobile's 2019
    // marker.
    const years = [141, 295, 449, 603];
    const { container, markers } = createRenderedChart(
      'stacked',
      [...years, ...years, ...years],
      [],
      [4, 4, 4],
    );
    const chart = createChart(
      [createSeries('area', 4, 'Desktop'), createSeries('area', 4, 'Mobile'), createSeries('area', 4, 'Tablet')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, LINE_ATTR)).toEqual([
      '0-0',
      '0-1',
      '0-2',
      '0-3',
      '1-0',
      '1-1',
      '1-2',
      '1-3',
      '2-0',
      '2-1',
      '2-2',
      '2-3',
    ]);

    cleanUp(container);
  });
});

describe('bindAnyChart (multi-series scatter stamping)', () => {
  it('gives each of two unequal scatter series its own points', () => {
    // Three points then five, each series' points in a layer of its own.
    const { container, markers } = createRenderedChart(
      'scatter-unequal',
      [10, 20, 30, 40, 50, 60, 70, 80],
      [],
      [3, 5],
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

  it('gives each of two scatter series measured at the same x values its own points', () => {
    // Split into runs of four along x, the first series took both series'
    // points at the first two x values, and the second took the last two.
    const { container, markers } = createRenderedChart(
      'scatter-shared-x',
      [10, 20, 30, 40, 10, 20, 30, 40],
      [],
      [4, 4],
    );
    const chart = createChart(
      [createSeries('marker', 4, 'Control'), createSeries('marker', 4, 'Treated')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, POINT_ATTR))
      .toEqual(['0-0', '0-1', '0-2', '0-3', '1-0', '1-1', '1-2', '1-3']);

    cleanUp(container);
  });

  it('stamps a marker series that says its markers are off, and skips a hidden one', () => {
    // Measured on AnyChart 8.13: a marker series' `markers().enabled()` is
    // false while it draws every point, so only `enabled()` says whether a
    // series is drawn. The hidden series in the middle draws nothing and
    // takes no layer.
    const markersOff = { markers: () => ({ enabled: () => false }) as unknown as AnyChartMarkers };
    const { container, markers } = createRenderedChart(
      'scatter-hidden',
      [10, 20, 30, 10, 20, 30],
      [],
      [3, 3],
    );
    const chart = createChart(
      [
        createSeries('marker', 3, 'A', markersOff),
        createSeries('marker', 3, 'B', { ...markersOff, enabled: () => false }),
        createSeries('marker', 3, 'C', markersOff),
      ],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, POINT_ATTR))
      .toEqual(['0-0', '0-1', '0-2', '2-0', '2-1', '2-2']);

    cleanUp(container);
  });
});
