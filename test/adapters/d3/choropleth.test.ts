import type { ChoroplethTrace } from '@model/choropleth';
import type { ChoroplethPoint } from '@type/grammar';
import { bindD3Choropleth } from '@adapters/d3/binders/choropleth';
import { afterAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A GeoJSON feature of the shape `topojson.feature(...)` hands to
 * `d3.geoPath()`: an id at the top level, and everything the map joined onto
 * it — the place name, the rate, the centroid — inside `properties`.
 */
function feature(
  id: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'Feature',
    id,
    properties,
    geometry: { type: 'Polygon', coordinates: [] },
  };
}

/**
 * Three western states whose rate arrived, and one whose join missed — which
 * is the ordinary case on a real map, drawn in the "no data" colour.
 *
 * The rate is under `rate` rather than `value`, and the centroid inside
 * `properties`, so the defaults are exercised where a real feature carries
 * them rather than where a hand-built object would.
 */
const WASHINGTON = feature('53', { name: 'Washington', rate: 12.1, lon: -120.5, lat: 47.4 });
const OREGON = feature('41', { name: 'Oregon', rate: 16.4, lon: -120.6, lat: 43.9 });
const NEVADA = feature('32', { name: 'Nevada', rate: 38.9, lon: -116.6, lat: 39.3 });
const CALIFORNIA = feature('06', { name: 'California', lon: -119.4, lat: 37.2 });

/** The shaded states alone, in the order they are drawn. */
const SHADED = [WASHINGTON, OREGON, NEVADA];

/**
 * The whole map: the state with no value sits in the MIDDLE of the drawn
 * order, so a selector list that kept its path is off by one for everything
 * after it rather than merely one entry too long.
 */
const WEST = [WASHINGTON, CALIFORNIA, OREGON, NEVADA];

/**
 * Builds an SVG holding one `path.region` per feature, in the order given.
 */
function buildMapSvg(features: unknown[], id = 'map-svg'): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="${id}"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of features) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'region');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

/** The name on the feature bound to whatever a selector resolves to. */
function nameBehind(svg: SVGElement, selector: string): string | undefined {
  const matched = svg.ownerDocument.querySelectorAll(selector);
  expect(matched).toHaveLength(1);
  const datum = (matched[0] as unknown as { __data__: { properties: { name: string } } }).__data__;
  return datum.properties.name;
}

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

describe('bindD3Choropleth', () => {
  test('reads the region and its value out of the feature properties', () => {
    const svg = buildMapSvg(SHADED);

    const result = bindD3Choropleth(svg, {
      selector: 'path.region',
      title: 'Something per thousand',
      axes: { x: 'State', y: 'Rate' },
    });

    expect(result.layer.type).toBe(TraceType.CHOROPLETH);
    // A GeoJSON feature keeps only `type`, `id`, `geometry` and `properties`
    // at the top level, so a binder that looked at the feature alone would
    // find neither the name nor the rate.
    expect(result.layer.data).toEqual([
      { x: 'Washington', y: 12.1, lon: -120.5, lat: 47.4 },
      { x: 'Oregon', y: 16.4, lon: -120.6, lat: 43.9 },
      { x: 'Nevada', y: 38.9, lon: -116.6, lat: 39.3 },
    ]);
  });

  test('hands the whole feature to a function accessor', () => {
    // The usual join: the values arrive in their own table, keyed by the id
    // the feature carries at its top level.
    const rateByFips = new Map([['53', 1], ['41', 2], ['32', 3]]);
    const svg = buildMapSvg(SHADED);

    const result = bindD3Choropleth(svg, {
      selector: 'path.region',
      value: d => rateByFips.get(String((d as { id: string }).id)) ?? Number.NaN,
    });

    expect((result.layer.data as ChoroplethPoint[]).map(point => point.y))
      .toEqual([1, 2, 3]);
  });

  test('leaves a region with no value out, and its path out of the selectors', () => {
    const svg = buildMapSvg(WEST);

    const result = bindD3Choropleth(svg, { selector: 'path.region' });

    // California's rate never arrived. Announcing it as 0 would sonify it as
    // the lowest state on the map; announcing it at all would need a number
    // the chart does not contain.
    const data = result.layer.data as ChoroplethPoint[];
    expect(data.map(point => point.x)).toEqual(['Washington', 'Oregon', 'Nevada']);

    // `ChoroplethTrace` withdraws highlighting entirely when the resolved
    // element count differs from the declared region count, so a single
    // selector matching all four paths would leave the map unhighlightable.
    const selectors = result.layer.selectors as string[];
    expect(selectors).toHaveLength(3);
    expect(selectors.map(one => nameBehind(svg, one)))
      .toEqual(['Washington', 'Oregon', 'Nevada']);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Left 1 of the 4 regions/));
  });

  test('infers the value field from a region that has one', () => {
    // The "no data" region is drawn like any other and can perfectly well be
    // drawn first. A binder that sampled the first feature for its field
    // names would find no value key on it, fall back to the canonical
    // `value`, resolve nothing anywhere, and refuse the whole map on the
    // strength of one region.
    const svg = buildMapSvg([CALIFORNIA, WASHINGTON, OREGON]);

    const result = bindD3Choropleth(svg, { selector: 'path.region' });

    expect((result.layer.data as ChoroplethPoint[]).map(point => point.x))
      .toEqual(['Washington', 'Oregon']);
  });

  test('drops a centroid that is a projected coordinate', () => {
    // `d3.geoPath().centroid(d)` returns the centre of the DRAWN shape, in
    // pixels. Passed through, the arrows would follow the projection's paper
    // layout — and on a south-up or interrupted projection, announce north
    // as south.
    const svg = buildMapSvg([
      feature('53', { name: 'Washington', rate: 12.1, lon: 137.4, lat: 61.8 }),
      feature('41', { name: 'Oregon', rate: 16.4, lon: 480.2, lat: 320.9 }),
    ]);

    const result = bindD3Choropleth(svg, { selector: 'path.region' });

    const data = result.layer.data as ChoroplethPoint[];
    expect(data[1].lon).toBeUndefined();
    expect(data[1].lat).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/geoCentroid/));
  });

  test('counts the dropped centroids against the regions that carried a value', () => {
    // California is drawn but never reaches the centroid check — it has no
    // value, so it is out of the payload before the coordinates are read.
    // Counting it in the denominator would offer a total that no region in
    // the warning could have come from.
    const svg = buildMapSvg([
      WASHINGTON,
      CALIFORNIA,
      feature('41', { name: 'Oregon', rate: 16.4, lon: 480.2, lat: 320.9 }),
    ]);

    bindD3Choropleth(svg, { selector: 'path.region' });

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Dropped the centroid of 1 of the 2 regions/),
    );
  });

  test('drops the pair when only one half of the centroid resolves', () => {
    // A longitude alone places nothing, and `ChoroplethTrace` bands the map
    // only when every region carries both — so half a centroid is a field
    // that reads as data and decides nothing.
    const svg = buildMapSvg([
      feature('53', { name: 'Washington', rate: 12.1, lon: -120.5 }),
    ]);

    const result = bindD3Choropleth(svg, { selector: 'path.region' });

    expect(result.layer.data).toEqual([{ x: 'Washington', y: 12.1 }]);
  });

  test('says so when only some of the regions came out placed', () => {
    const svg = buildMapSvg([
      feature('53', { name: 'Washington', rate: 12.1, lon: -120.5, lat: 47.4 }),
      feature('41', { name: 'Oregon', rate: 16.4 }),
    ]);

    bindD3Choropleth(svg, { selector: 'path.region' });

    // The spatial reading is silently lost on a map that places most of its
    // regions and not the rest, and nothing else on the page says why.
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Only 1 of the 2 regions/));
  });

  test('reads the names an accessor points at rather than the ones it found', () => {
    const svg = buildMapSvg([
      feature('53', { name: 'Washington', NAME_1: 'WA', rate: 12.1 }),
    ]);

    const result = bindD3Choropleth(svg, { selector: 'path.region', region: 'NAME_1' });

    expect((result.layer.data as ChoroplethPoint[])[0].x).toBe('WA');
  });

  test('refuses to stand in for a region it cannot name', () => {
    // Every reading of a map is by name — the announcement, the borders, the
    // cluster the description names — so an ordinal would not degrade the
    // reading, it would replace it.
    // No name and no id: a feature keyed only by its FIPS id still announces
    // that, which is a poor name but a real one.
    const svg = buildMapSvg([
      { type: 'Feature', properties: { rate: 12.1 }, geometry: { type: 'Polygon' } },
    ]);

    expect(() => bindD3Choropleth(svg, { selector: 'path.region' }))
      .toThrow(/has no name/);
  });

  test('says where the value lives when no region carries one', () => {
    const svg = buildMapSvg([
      feature('53', { name: 'Washington' }),
      feature('41', { name: 'Oregon' }),
    ]);

    expect(() => bindD3Choropleth(svg, { selector: 'path.region' }))
      .toThrow(/carries a value/);
  });

  test('scopes a single region with one selector', () => {
    const svg = buildMapSvg([feature('53', { name: 'Washington', rate: 12.1 })]);

    const result = bindD3Choropleth(svg, { selector: 'path.region' });

    expect(result.layer.selectors).toBe('#map-svg path.region');
  });

  test('throws an actionable error when the selector matches no regions', () => {
    const svg = buildMapSvg(WEST);

    expect(() => bindD3Choropleth(svg, { selector: 'path.state' })).toThrow(/region/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a Figure that reads as a map', () => {
    const svg = buildMapSvg(WEST);
    const result = bindD3Choropleth(svg, {
      selector: 'path.region',
      title: 'Something per thousand',
      axes: { x: 'State', y: 'Rate' },
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.CHOROPLETH]);
    });
  });

  test('the highlighted path is the one the announcement named', () => {
    const svg = buildMapSvg(WEST);
    const result = bindD3Choropleth(svg, { selector: 'path.region' });

    withPageDocument(svg, () => {
      const trace = TraceFactory.create(result.layer) as ChoroplethTrace;
      // The first move is the initial entry, which lands rather than moves;
      // it lands at the west end of the southern band, which is Oregon — not
      // Washington, which the layer declared first.
      trace.moveOnce('FORWARD');

      const state = trace.state;
      if (state.empty || state.highlight.empty) {
        throw new Error('Expected a populated highlight state');
      }
      expect(state.text.main.value).toBe('Oregon');

      // The regions are banded by latitude while the selectors are in drawn
      // order, so the trace indexes the list by the region's declared
      // position — 1 for Oregon, the second state that carried a value.
      // California is drawn between them and carries none: a list that had
      // kept its path would light California while the reader was told
      // Oregon, and one that had emitted a bare selector would resolve four
      // paths for three regions and withdraw highlighting altogether.
      const highlighted = state.highlight.elements;
      const first = Array.isArray(highlighted) ? highlighted.flat()[0] : highlighted;
      expect(first?.getAttribute('data-maidr-choropleth-index')).toBe('1');
      expect(nameBehind(svg, `#map-svg path.region[data-maidr-choropleth-index="1"]:not([data-maidr-owned])`))
        .toBe('Oregon');
    });
  });
});
