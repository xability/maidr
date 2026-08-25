import type { HighchartsPoint } from '@adapters/highcharts/types';
import type { ChoroplethPoint, ScatterPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeGraphic, fakeSeries } from './helpers';

/**
 * Highmaps' two marker series drew data and emitted no layer (#1186).
 *
 * `convertSeries` dispatches on the series type, and both fell to its
 * `default:` — so a chart whose only series was one of them attached MAIDR
 * and gave the reader nothing to navigate. That is the shape of #1138.
 *
 * They are siblings and they read differently, and the difference is one
 * field. Measured on Highcharts 13.0.1 under jsdom:
 *
 *     mappoint    {name: 'London', lat: 51.5, lon: -0.13}        + x = index
 *     mapbubble   {name: 'London', lat: 51.5, lon: -0.13, z: 9}  no x, no y
 *
 * A map bubble is a named place with a magnitude and a position, which is
 * `ChoroplethPoint` exactly. A map point has no magnitude at all, and the
 * only ways to give it one are to invent a constant or to promote its index
 * — so it reads as a scatter of the degrees it does state, with the place on
 * `ScatterPoint.label`.
 */

/** A marker as Highcharts resolves one, drawn and therefore stampable. */
function marker(overrides: Partial<HighchartsPoint>): Partial<HighchartsPoint> {
  return { graphic: fakeGraphic(), ...overrides };
}

/** The layers a one-series chart of markers produces. */
function layersOf(type: string, data: Partial<HighchartsPoint>[]) {
  const chart = fakeChart({
    renderToId: 'map-chart',
    series: [fakeSeries({ index: 0, type, name: 'Cities', data })],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers;
}

const PLACED = [
  marker({ x: 0, name: 'London', lat: 51.5, lon: -0.13 }),
  marker({ x: 1, name: 'Paris', lat: 48.9, lon: 2.35 }),
  marker({ x: 2, name: 'Oslo', lat: 59.9, lon: 10.75 }),
];

describe('highcharts mappoint series', () => {
  it('reads the markers rather than registering nothing', () => {
    const layers = layersOf('mappoint', PLACED);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.SCATTER);
    expect(layers[0].title).toBe('Cities');
  });

  it('puts the degrees on the axes and the place on the point', () => {
    const data = layersOf('mappoint', PLACED)[0].data as ScatterPoint[];

    // Longitude on x and latitude on y, which is the way round every map is
    // drawn: east runs along the page and north up it.
    expect(data).toEqual([
      { x: -0.13, y: 51.5, label: 'London' },
      { x: 2.35, y: 48.9, label: 'Paris' },
      { x: 10.75, y: 59.9, label: 'Oslo' },
    ]);
  });

  it('names the axes for what the numbers are', () => {
    // A `mappoint` is bound to no axis a title could be read from, and "X"
    // against "Values" would describe a scatter of two unnamed quantities
    // rather than a position on the globe.
    expect(layersOf('mappoint', PLACED)[0].axes).toEqual({
      x: { label: 'Longitude' },
      y: { label: 'Latitude' },
    });
  });

  it('reaches the drawn markers with its selector', () => {
    expect(layersOf('mappoint', PLACED)[0].selectors).toBe(
      '#map-chart .highcharts-series-group .highcharts-series-0 '
      + '.highcharts-point:not([visibility="hidden"])',
    );
  });

  it('drops a marker that states only one of the two coordinates', () => {
    const data = layersOf('mappoint', [
      marker({ x: 0, name: 'London', lat: 51.5, lon: -0.13 }),
      // Half a coordinate places nothing. Read as a longitude of zero this
      // would put Paris on the prime meridian, which is a position the chart
      // never drew rather than a missing one.
      marker({ x: 1, name: 'Paris', lat: 48.9 }),
    ])[0].data as ScatterPoint[];

    expect(data.map(point => point.label)).toEqual(['London']);
  });

  it('declines a series placed in projected units, and says so', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // A `mappoint` can also be placed by `x`/`y` in the map view's projected
    // units, which are not degrees. Announcing them under a Longitude and a
    // Latitude label would state a position the chart does not claim.
    const layers = layersOf('mappoint', [
      marker({ x: 10, y: 20, name: 'A' }),
      marker({ x: 30, y: 40, name: 'B' }),
    ]);

    expect(layers).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('placed no marker by `lat`/`lon`'),
    );
    warn.mockRestore();
  });

  it('drops a marker whose coordinates could not be degrees', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // The bound is the one test that separates degrees from the projected
    // units the same two fields could be carrying, and it is per axis: a
    // latitude of 120 is impossible while a longitude of 120 is Siberia. A
    // pair checked against one bound for both would let the first through
    // and put the marker off the globe.
    const layers = layersOf('mappoint', [
      marker({ x: 0, name: 'Impossible', lat: 120, lon: 20 }),
      marker({ x: 1, name: 'Also impossible', lat: 40, lon: 200 }),
    ]);

    expect(layers).toHaveLength(0);
    warn.mockRestore();
  });

  it('keeps a longitude past 90, which is a real place', () => {
    // The other half of the same check: 100 degrees east is Bangkok, and a
    // longitude bound of 90 would drop half the planet.
    const data = layersOf('mappoint', [
      marker({ x: 0, name: 'Bangkok', lat: 13.8, lon: 100.5 }),
    ])[0].data as ScatterPoint[];

    expect(data).toEqual([{ x: 100.5, y: 13.8, label: 'Bangkok' }]);
  });

  it('announces an unnamed marker by its position alone', () => {
    const data = layersOf('mappoint', [
      marker({ x: 0, lat: 51.5, lon: -0.13 }),
    ])[0].data as ScatterPoint[];

    // `mapRegionName` falls back to the bare x, which is the marker's index
    // in the series — a number that names nothing. Better no label than one
    // that reads "0".
    expect(data[0]).toEqual({ x: -0.13, y: 51.5 });
  });
});

describe('highcharts mapbubble series', () => {
  const SIZED = [
    marker({ name: 'London', lat: 51.5, lon: -0.13, z: 9 }),
    marker({ name: 'Paris', lat: 48.9, lon: 2.35, z: 4 }),
  ];

  it('reads the bubbles as a choropleth of placed regions', () => {
    const layers = layersOf('mapbubble', SIZED);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.CHOROPLETH);
    expect(layers[0].data as ChoroplethPoint[]).toEqual([
      { x: 'London', y: 9, lon: -0.13, lat: 51.5 },
      { x: 'Paris', y: 4, lon: 2.35, lat: 48.9 },
    ]);
  });

  it('takes the coordinates the marker states rather than a centroid', () => {
    // `mapCentroid` reads `properties['hc-middle-lon']` or projects `bounds`,
    // and a bubble joined to no map feature has neither — so without reading
    // the marker's own `lat`/`lon` every point would arrive unplaced and the
    // spatial walk would fall back to declared order.
    const data = layersOf('mapbubble', SIZED)[0].data as ChoroplethPoint[];

    expect(data.every(point => point.lon !== undefined)).toBe(true);
    expect(data.every(point => point.lat !== undefined)).toBe(true);
  });

  it('announces the bubble size, not the position it was placed at', () => {
    // The defect this ordering exists for. A bubble placed in the map view's
    // projected units carries `y` as a **position**; read through the plain
    // `value ?? y` chain it announced 20 where the chart sizes the bubble by
    // 3 — a coordinate presented as a measurement.
    const data = layersOf('mapbubble', [
      marker({ x: 10, y: 20, name: 'A', z: 3 }),
    ])[0].data as ChoroplethPoint[];

    expect(data).toEqual([{ x: 'A', y: 3 }]);
  });

  it('leaves a plain map series reading its own value', () => {
    // The regression the `sizeIsValue` flag guards: `map` regions state
    // `value`, and a `z` reaching the front of that chain for every map
    // series would replace it wherever one happened to carry both.
    const data = layersOf('map', [
      marker({ x: 0, name: 'Nevada', value: 42.1, z: 12 }),
    ])[0].data as ChoroplethPoint[];

    expect(data).toEqual([{ x: 'Nevada', y: 42.1 }]);
  });
});
