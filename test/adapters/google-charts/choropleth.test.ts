import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A regions table: the place, then the value it is shaded by. */
const REGIONS: [string, number][] = [
  ['Germany', 200],
  ['United States', 300],
  ['Brazil', 400],
];

/** A markers table drawn from coordinates: latitude, longitude, name, value. */
const MARKERS: [number, number, string, number][] = [
  [37.77, -122.42, 'San Francisco', 4],
  [40.71, -74.01, 'New York', 9],
  [41.88, -87.63, 'Chicago', 6],
];

function makeRegionsDataTable(): GoogleDataTable {
  const labels = ['Country', 'Popularity'];
  return {
    getNumberOfRows: () => REGIONS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => REGIONS[r][c],
    getFormattedValue: (r, c) => String(REGIONS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

function makeMarkersDataTable(): GoogleDataTable {
  const labels = ['Lat', 'Long', 'City', 'Rating'];
  return {
    getNumberOfRows: () => MARKERS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => MARKERS[r][c],
    getFormattedValue: (r, c) => String(MARKERS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 2 ? 'string' : 'number'),
  };
}

/**
 * The geochart package exposes no layout interface, so the adapter must never
 * ask for one — this fake fails loudly if it does.
 */
const GEO_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a GeoChart has no chart layout interface');
  },
};

/**
 * Builds a rendered map. Google paints every region of the resolution, not
 * only the rows it was given, which is why there are more paths than data.
 */
function makeGeoContainer(): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="geo"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('geo') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let region = 0; region < 40; region++) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${region},0 L10,10 Z`);
    svg.appendChild(path);
  }

  return container;
}

describe('createMaidrFromGoogleChart with a GeoChart', () => {
  it('reads a regions table as the region list the data supports', () => {
    const container = makeGeoContainer();

    const maidr = createMaidrFromGoogleChart(
      GEO_CHART,
      makeRegionsDataTable(),
      container,
      { chartType: 'GeoChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.CHOROPLETH);
    // No centroids: Google resolves a region name inside its own geo data and
    // exposes no position for it, and inventing one would put regions in
    // directions from each other that the map does not.
    expect(layer.data).toEqual([
      { x: 'Germany', y: 200 },
      { x: 'United States', y: 300 },
      { x: 'Brazil', y: 400 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Country' }, y: { label: 'Popularity' } });
  });

  it('takes the centroids a coordinate marker table carries', () => {
    const container = makeGeoContainer();

    const maidr = createMaidrFromGoogleChart(
      GEO_CHART,
      makeMarkersDataTable(),
      container,
      { chartType: 'GeoChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    // With a longitude and a latitude the arrows walk the map itself: up is
    // north and left is west, which is the whole reason this is a type of its
    // own rather than a bar chart whose categories are places.
    expect(layer.data).toEqual([
      { x: 'San Francisco', y: 4, lat: 37.77, lon: -122.42 },
      { x: 'New York', y: 9, lat: 40.71, lon: -74.01 },
      { x: 'Chicago', y: 6, lat: 41.88, lon: -87.63 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'City' }, y: { label: 'Rating' } });
  });

  it('names an unnamed marker by the coordinates that identify it', () => {
    const rows: [number, number, number][] = [[37.77, -122.42, 4]];
    const dt: GoogleDataTable = {
      getNumberOfRows: () => rows.length,
      getNumberOfColumns: () => 3,
      getValue: (r, c) => rows[r][c],
      getFormattedValue: (r, c) => String(rows[r][c]),
      getColumnLabel: () => '',
      getColumnType: () => 'number',
    };

    const maidr = createMaidrFromGoogleChart(
      GEO_CHART,
      dt,
      makeGeoContainer(),
      { chartType: 'GeoChart' },
    );

    expect(maidr.subplots[0][0].layers[0].data).toEqual([
      { x: '37.77, -122.42', y: 4, lat: 37.77, lon: -122.42 },
    ]);
  });

  it('leaves the drawn regions unmarked rather than highlighting the wrong one', () => {
    const container = makeGeoContainer();

    const maidr = createMaidrFromGoogleChart(
      GEO_CHART,
      makeRegionsDataTable(),
      container,
      { chartType: 'GeoChart' },
    );

    // Google draws its region paths in its own geographic order and gives them
    // no class or id, so even a chart whose counts happened to agree would map
    // row 0 onto some other country.
    expect(maidr.subplots[0][0].layers[0].selectors).toBeUndefined();
  });
});
