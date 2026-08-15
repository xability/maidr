import type {
  AnyChartInstance,
  AnyChartIterator,
  AnyChartSeries,
} from '@adapters/anychart/types';
import type { ChoroplethPoint } from '@type/grammar';
import { anyChartToMaidr, bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
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

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One row of a choropleth series: the geo id it is matched on, and a value. */
interface RegionRow {
  id: string;
  value: number | null;
  /** The bounds AnyChart reports for the feature this row was matched to. */
  bounds?: Box;
  /** The name the map module's own point API answers with, when it does. */
  featureName?: string;
}

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

/**
 * A drawn choropleth series. `getPoint(i)` is the map module's own point API:
 * it answers with the bound feature's properties and its drawn bounds, which
 * is where a region's name and its highlight both come from.
 */
function createChoroplethSeries(rows: RegionRow[]): AnyChartSeries {
  return {
    id: () => 0,
    name: () => 'Population',
    seriesType: () => 'choropleth',
    getIterator: () => createIterator(rows.map(r => ({ id: r.id, value: r.value }))),
    getPoint: (index: number) => ({
      get: () => undefined,
      getIndex: () => index,
      exists: () => index < rows.length,
      getFeatureProp: () => {
        const name = rows[index]?.featureName;
        return name === undefined ? undefined : { name };
      },
      getFeatureBounds: () => rows[index]?.bounds,
    }),
    getStat: () => undefined,
  };
}

/** GeoJSON, the shape AnyChart's own `anychart.maps.*` files parse into. */
function geoJson(features: Array<[string, string]>): unknown {
  return {
    type: 'FeatureCollection',
    features: features.map(([id, name]) => ({
      // `middle-x` / `middle-y` are AnyChart's normalised projected centroids.
      // They are NOT degrees, and nothing may pass them through as such.
      properties: { id, name, 'middle-x': 0.42, 'middle-y': 0.61 },
    })),
  };
}

function createMapChart(
  rows: RegionRow[],
  extra: {
    container?: HTMLElement;
    geoData?: unknown;
    chartType?: string;
    series?: AnyChartSeries[];
  } = {},
): AnyChartInstance {
  const series = extra.series ?? [createChoroplethSeries(rows)];
  return {
    title: () => 'Population by state',
    container: () => extra.container ?? '',
    getType: () => extra.chartType ?? 'map',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    geoData: () => extra.geoData,
  } as unknown as AnyChartInstance;
}

/** A container holding a rendered map: one filled path per geo feature. */
function createRenderedMap(id: string, boxes: Box[]): {
  container: HTMLElement;
  paths: SVGElement[];
} {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);
  container.appendChild(svg);
  document.body.appendChild(container);

  const paths = boxes.map((box, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.id = `ac_path_${i}`;
    path.setAttribute('d', 'M 0 0 L 10 0 L 10 10 Z');
    path.setAttribute('fill', '#cccccc');
    Object.defineProperty(path, 'getBBox', {
      value: () => ({
        x: box.left,
        y: box.top,
        width: box.width,
        height: box.height,
      }),
    });
    layer.appendChild(path);
    return path as unknown as SVGElement;
  });

  return { container, paths };
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

describe('anyChartToMaidr (choropleth)', () => {
  it('reads a map series as a choropleth, named from the geodata', () => {
    const chart = createMapChart(
      [
        { id: 'US.NV', value: 42.1 },
        { id: 'US.UT', value: 17.9 },
      ],
      { geoData: geoJson([['US.NV', 'Nevada'], ['US.UT', 'Utah']]) },
    );

    const layer = anyChartToMaidr(chart)?.subplots[0][0].layers[0];

    expect(layer?.type).toBe(TraceType.CHOROPLETH);
    // The rows carry an id and a value; the NAME belongs to the geodata, and a
    // map announced by code is a map a listener cannot follow.
    expect(layer?.data as ChoroplethPoint[]).toEqual([
      { x: 'Nevada', y: 42.1 },
      { x: 'Utah', y: 17.9 },
    ]);
  });

  it('omits lon and lat rather than passing the projected centroids through', () => {
    const chart = createMapChart(
      [{ id: 'US.NV', value: 42.1 }],
      { geoData: geoJson([['US.NV', 'Nevada']]) },
    );

    const [region] = anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as ChoroplethPoint[];

    // AnyChart's `middle-x` / `middle-y` are normalised projected coordinates,
    // and the grammar's centroids are degrees. Announcing the first as the
    // second would tell a reader that one region lies north of another when
    // the map says nothing of the kind.
    expect(region.lon).toBeUndefined();
    expect(region.lat).toBeUndefined();
    expect(region.neighbors).toBeUndefined();
  });

  it('detects the series even when the chart names no type', () => {
    // `getType()` answers `''` on a build without it and on an undrawn chart,
    // so a map gated on the chart type would be dropped exactly then. The
    // series type is self-describing and is the whole detection.
    const chart = createMapChart(
      [{ id: 'US.NV', value: 42.1 }],
      { chartType: '', geoData: geoJson([['US.NV', 'Nevada']]) },
    );

    expect(anyChartToMaidr(chart)?.subplots[0][0].layers[0].type)
      .toBe(TraceType.CHOROPLETH);
  });

  it('prefers the feature the point is bound to over the geodata lookup', () => {
    const chart = createMapChart(
      [{ id: 'US.NV', value: 1, featureName: 'Nevada' }],
      // The geodata names the same id something else; the bound feature is the
      // one the chart actually drew.
      { geoData: geoJson([['US.NV', 'NV']]) },
    );

    const [region] = anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as ChoroplethPoint[];
    expect(region.x).toBe('Nevada');
  });

  it('keeps the id as the name when nothing else names the region', () => {
    const chart = createMapChart([{ id: 'US.NV', value: 1 }]);

    const [region] = anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as ChoroplethPoint[];
    // A poor name, but a true one: every alternative is a region the map does
    // not contain.
    expect(region.x).toBe('US.NV');
  });

  it('drops a region the map shades no colour for', () => {
    const chart = createMapChart(
      [
        { id: 'US.NV', value: 42.1 },
        { id: 'US.UT', value: null },
        { id: 'US.ID', value: 3 },
      ],
      { geoData: geoJson([['US.NV', 'Nevada'], ['US.UT', 'Utah'], ['US.ID', 'Idaho']]) },
    );

    const data = anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as ChoroplethPoint[];
    expect(data.map(r => r.x)).toEqual(['Nevada', 'Idaho']);
  });

  it('names the two dimensions a map has no axis to name', () => {
    const chart = createMapChart([{ id: 'US.NV', value: 1 }]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];
    expect(layer.axes?.x).toEqual({ label: 'Region' });
    expect(layer.axes?.y).toEqual({ label: 'Value' });
  });

  it('emits one exact-match selector per region, in data order', () => {
    const chart = createMapChart([
      { id: 'US.NV', value: 1 },
      { id: 'US.UT', value: 2 },
    ]);

    // Not a `^=` prefix selector: that resolves in DOCUMENT order, which on a
    // map is the geodata's order and not the data's.
    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].selectors).toEqual([
      '[data-maidr-anychart-region="0-0"]',
      '[data-maidr-anychart-region="0-1"]',
    ]);
  });
});

describe('bindAnyChart (choropleth stamping)', () => {
  it('stamps each region by its bounds, not by document order', () => {
    // The map paints every feature of its geodata — four here — in the
    // geodata's order, while the data names two of them in another order.
    // Counting shapes off would highlight Alabama for Nevada.
    const boxes: Box[] = [
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 50, top: 0, width: 12, height: 8 },
      { left: 90, top: 30, width: 20, height: 20 },
      { left: 10, top: 60, width: 5, height: 5 },
    ];
    const { container, paths } = createRenderedMap('map-bounds', boxes);
    const chart = createMapChart(
      [
        { id: 'US.ID', value: 3, bounds: boxes[2] },
        { id: 'US.NV', value: 42, bounds: boxes[0] },
      ],
      { container },
    );

    bindAnyChart(chart);

    expect(paths.map(p => p.getAttribute('data-maidr-anychart-region')))
      .toEqual(['0-1', null, '0-0', null]);

    cleanUp(container);
  });

  it('disables highlighting when a region matches more than one shape', () => {
    const box: Box = { left: 0, top: 0, width: 10, height: 10 };
    const { container, paths } = createRenderedMap('map-ambiguous', [box, box]);
    const chart = createMapChart([{ id: 'US.NV', value: 1, bounds: box }], {
      container,
    });
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    // A guess would put the announcement on one shape and the highlight on
    // another, with nothing in the DOM to say so.
    expect(paths.every(p => !p.hasAttribute('data-maidr-anychart-region')))
      .toBe(true);
    expect(warn.mock.calls.flat().join(' ')).toContain('Highlighting is disabled');

    cleanUp(container);
  });

  it('disables highlighting when the build reports no feature bounds', () => {
    const { container, paths } = createRenderedMap('map-unplaced', [
      { left: 0, top: 0, width: 10, height: 10 },
    ]);
    // No `bounds`: an older map build with no point API to ask.
    const chart = createMapChart([{ id: 'US.NV', value: 1 }], { container });

    bindAnyChart(chart);

    expect(paths[0].hasAttribute('data-maidr-anychart-region')).toBe(false);

    cleanUp(container);
  });

  it('runs the region stamper on a map, and no cartesian stamper', () => {
    const boxes: Box[] = [{ left: 0, top: 0, width: 10, height: 10 }];
    const { container, paths } = createRenderedMap('map-stampers', boxes);
    const chart = createMapChart([{ id: 'US.NV', value: 1, bounds: boxes[0] }], {
      container,
    });

    bindAnyChart(chart);

    // The bar stamper pairs shapes with data by counting DOM order, which on a
    // map pairs a row with whichever feature the geodata happened to declare
    // in that position.
    expect(paths[0].hasAttribute('data-maidr-anychart-bar')).toBe(false);
    expect(paths[0].getAttribute('data-maidr-anychart-region')).toBe('0-0');

    cleanUp(container);
  });
});
