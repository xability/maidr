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
 * unequal length, series whose marks share every x position, a series that
 * draws no marks at all, a line or area beside a marker series, whose
 * layers AnyChart writes in z-index order rather than series order, and a
 * series a legend click shows after the chart was bound.
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

describe('bindAnyChart (a line or area beside a marker series)', () => {
  // Measured on AnyChart 8.13: layers are written in z-index order. A marker
  // or area series is drawn at 30 and a line at 31, plus 0.00001 for each
  // series added before it, and a line or area draws its markers 0.000012
  // above itself.
  const at = (zIndex: number): Partial<AnyChartSeries> => ({ zIndex: () => zIndex });
  const withMarkersAt = (zIndex: number, markersZIndex: number): Partial<AnyChartSeries> => ({
    zIndex: () => zIndex,
    markers: () => ({ enabled: () => true, zIndex: () => markersZIndex }) as unknown as AnyChartMarkers,
  });
  const ofSeries = (s: number): string[] => [0, 1, 2, 3].map(i => `${s}-${i}`);

  it('gives a line or an area and a marker series each their own marks', () => {
    // The marker series' points are drawn first on each of these charts, and
    // the line or area took them for its markers.
    const charts: Array<[string, AnyChartSeries[]]> = [
      ['line-then-marker', [
        createSeries('line', 4, 'Trend', withMarkersAt(31, 31.000012)),
        createSeries('marker', 4, 'Measured', at(30.00001)),
      ]],
      ['marker-then-line', [
        createSeries('marker', 4, 'Measured', at(30)),
        createSeries('line', 4, 'Trend', withMarkersAt(31.00001, 31.000022)),
      ]],
      ['area-then-marker', [
        createSeries('area', 4, 'Visits', withMarkersAt(30, 30.000012)),
        createSeries('marker', 4, 'Measured', at(30.00001)),
      ]],
    ];
    for (const [id, series] of charts) {
      const { container, markers } = createRenderedChart(id, [10, 20, 30, 40, 10, 20, 30, 40], [], [4, 4]);
      const points = markers.slice(0, 4);
      const lineMarkers = markers.slice(4);
      const line = series.findIndex(s => s.seriesType() !== 'marker');

      bindAnyChart(createChart(series, container));

      expect(stamps(lineMarkers, LINE_ATTR)).toEqual(ofSeries(line));
      expect(stamps(points, POINT_ATTR)).toEqual(ofSeries(1 - line));
      expect(stamps(points, LINE_ATTR)).toEqual([null, null, null, null]);
      expect(stamps(lineMarkers, POINT_ATTR)).toEqual([null, null, null, null]);

      cleanUp(container);
    }
  });

  it('follows a z-index that raises a marker series above a line', () => {
    // At `zIndex(40)` the marker series is drawn after the line's markers,
    // and it took them for its points.
    const { container, markers } = createRenderedChart(
      'marker-raised',
      [10, 20, 30, 40, 10, 20, 30, 40],
      [],
      [4, 4],
    );
    const chart = createChart(
      [
        createSeries('line', 4, 'Trend', withMarkersAt(31, 31.000012)),
        createSeries('marker', 4, 'Measured', at(40)),
      ],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(markers, LINE_ATTR)).toEqual([...ofSeries(0), null, null, null, null]);
    expect(stamps(markers, POINT_ATTR)).toEqual([null, null, null, null, ...ofSeries(1)]);

    cleanUp(container);
  });
});

/**
 * A chart that calls its `chartdraw` listeners when `redraw` is called, as
 * AnyChart does on each draw, with an SVG 700 by 400 pixels on the page
 * until `setSize` says otherwise.
 */
function createRedrawingChart(
  series: AnyChartSeries[],
  container: HTMLElement,
): { chart: AnyChartInstance; redraw: () => void; setSize: (width: number, height: number) => void } {
  const listeners: Array<() => void> = [];
  const chart = {
    ...createChart(series, container),
    listen: (type: string, listener: () => void) => {
      if (type === 'chartdraw')
        listeners.push(listener);
    },
  } as AnyChartInstance;
  let size = { width: 700, height: 400 };
  const svg = container.querySelector('svg') as SVGElement;
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, ...size }),
  });
  return {
    chart,
    redraw: () => listeners.forEach(listener => listener()),
    setSize: (width, height) => {
      size = { width, height };
    },
  };
}

/** New shapes drawn into `layer`, each `width` by `height`, one at each of `xs`. */
function drawShapes(layer: Element, tag: 'path' | 'rect', xs: number[], width: number, height: number): SVGElement[] {
  return xs.map((x) => {
    const shape = document.createElementNS(SVG_NS, tag);
    shape.setAttribute('fill', '#64b5f6');
    Object.defineProperty(shape, 'getBBox', { value: () => ({ x, y: 100, width, height }) });
    layer.appendChild(shape);
    return shape as unknown as SVGElement;
  });
}

/**
 * MAIDR's copy of a mark, as its core inserts one while the reader is in the
 * chart: hidden, owned, with the mark's stamp, straight after the mark.
 */
function addMaidrCopy(mark: SVGElement): void {
  const copy = mark.cloneNode(true) as SVGElement;
  copy.setAttribute('visibility', 'hidden');
  copy.setAttribute('data-maidr-owned', 'true');
  const box = (mark as unknown as SVGGraphicsElement).getBBox();
  Object.defineProperty(copy, 'getBBox', { value: () => box });
  mark.after(copy);
}

describe('bindAnyChart (a series a legend hides or shows)', () => {
  const ofSeries = (s: number): string[] => [0, 1, 2, 3].map(i => `${s}-${i}`);
  const at = (zIndex: number, markersZIndex?: number): Partial<AnyChartSeries> => ({
    zIndex: () => zIndex,
    ...(markersZIndex === undefined
      ? {}
      : { markers: () => ({ enabled: () => true, zIndex: () => markersZIndex }) as unknown as AnyChartMarkers }),
  });

  it('gives a column series hidden when the chart is bound no bars', () => {
    // With North hidden by `enabled(false)`, only South's bars are drawn.
    // Counted, North took them, and South's highlight outlined nothing.
    const { container, bars } = createRenderedChart('column-hidden', [], [30, 30, 30, 30]);
    const chart = createChart(
      [createSeries('column', 4, 'North', { enabled: () => false }), createSeries('column', 4, 'South')],
      container,
    );

    bindAnyChart(chart);

    expect(stamps(bars, 'data-maidr-anychart-bar')).toEqual(ofSeries(1));

    cleanUp(container);
  });

  it('stamps the markers of a line shown after the chart was bound', () => {
    // Measured on AnyChart 8.13: a line hidden when the chart is bound draws
    // no markers, and shown with a legend click it draws new ones, in a layer
    // between the marker series' points and the other line's markers.
    // Stamped only when the chart was bound, they never were, and MAIDR could
    // never outline them. MAIDR's copies of the marker series' points, there
    // while the reader is in the chart, are passed over.
    let alphaShown = false;
    const { container, markers } = createRenderedChart('line-shown', [10, 20, 30, 40, 10, 20, 30, 40], [], [4, 4]);
    const points = markers.slice(0, 4);
    const gamma = markers.slice(4);
    const { chart, redraw } = createRedrawingChart(
      [
        createSeries('line', 4, 'Alpha', { ...at(31, 31.000012), enabled: () => alphaShown }),
        createSeries('marker', 4, 'Beta', at(30.00001)),
        createSeries('line', 4, 'Gamma', at(31.00002, 31.000032)),
      ],
      container,
    );
    bindAnyChart(chart);
    points.forEach(addMaidrCopy);
    alphaShown = true;
    const alphaLayer = document.createElementNS(SVG_NS, 'g');
    alphaLayer.id = 'ac_layer_alpha';
    gamma[0].parentElement?.before(alphaLayer);
    const alpha = drawShapes(alphaLayer, 'path', [10, 20, 30, 40], 6, 6);
    const warn = jest.mocked(console.warn);
    warn.mockClear();

    redraw();

    expect(stamps(alpha, LINE_ATTR)).toEqual(ofSeries(0));
    expect(stamps(points, POINT_ATTR)).toEqual(ofSeries(1));
    expect(stamps(gamma, LINE_ATTR)).toEqual(ofSeries(2));
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });

  it('stamps the bars of a column series shown after the chart was bound', () => {
    // South is hidden when the chart is bound and shown after, with MAIDR's
    // copies of North's bars in the chart. Counted with the copies, the bars
    // North had already been given took South's turn as well.
    let southShown = false;
    const { container, bars } = createRenderedChart('column-shown', [], [30, 30, 30, 30]);
    const { chart, redraw } = createRedrawingChart(
      [createSeries('column', 4, 'North'), createSeries('column', 4, 'South', { enabled: () => southShown })],
      container,
    );
    bindAnyChart(chart);
    bars.forEach(addMaidrCopy);
    southShown = true;
    const layer = bars[0].parentElement as Element;
    const south = drawShapes(layer, 'rect', [40, 140, 240, 340], 30, 200);

    redraw();

    expect(stamps(bars, 'data-maidr-anychart-bar')).toEqual(ofSeries(0));
    expect(stamps(south, 'data-maidr-anychart-bar')).toEqual(ofSeries(1));

    cleanUp(container);
  });

  it('leaves a chart drawn while it has no size for the next draw', () => {
    // AnyChart also draws the chart while its SVG has no size. In Chromium no
    // shape can be measured then, and stamping warned for every series of
    // every example.
    let alphaShown = false;
    const { container, markers } = createRenderedChart('no-size', [10, 20, 30, 40]);
    const { chart, redraw, setSize } = createRedrawingChart(
      [
        createSeries('line', 4, 'Alpha', { ...at(31, 31.000012), enabled: () => alphaShown }),
        createSeries('line', 4, 'Gamma', at(31.00001, 31.000022)),
      ],
      container,
    );
    bindAnyChart(chart);
    alphaShown = true;
    const alphaLayer = document.createElementNS(SVG_NS, 'g');
    markers[0].parentElement?.before(alphaLayer);
    const alpha = drawShapes(alphaLayer, 'path', [10, 20, 30, 40], 6, 6);
    const warn = jest.mocked(console.warn);
    warn.mockClear();

    setSize(0, 0);
    redraw();
    const whileSizeless = stamps(alpha, LINE_ATTR);
    setSize(700, 400);
    redraw();

    expect(whileSizeless).toEqual([null, null, null, null]);
    expect(stamps(alpha, LINE_ATTR)).toEqual(ofSeries(0));
    expect(stamps(markers, LINE_ATTR)).toEqual(ofSeries(1));
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });
});
