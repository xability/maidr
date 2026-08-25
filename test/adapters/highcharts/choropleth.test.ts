import type { HighchartsPoint } from '@adapters/highcharts/types';
import type { ChoroplethPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeGraphic, fakeSeries } from './helpers';

/** A Highmaps region, as Highcharts resolves one after joining the map data. */
function region(overrides: Partial<HighchartsPoint>): Partial<HighchartsPoint> {
  return { graphic: fakeGraphic(), ...overrides };
}

/** The stamp a rendered region carries, or null when it was never stamped. */
function stampOf(point: HighchartsPoint): string | null {
  return point.graphic?.element.getAttribute('data-maidr-region-index') ?? null;
}

describe('highcharts map series', () => {
  it('reads a map series as a choropleth without any declaration', () => {
    const chart = fakeChart({
      title: 'Population density',
      renderToId: 'map-chart',
      series: [fakeSeries({
        index: 0,
        type: 'map',
        name: 'Density',
        data: [
          region({ x: 0, name: 'Nevada', value: 42.1 }),
          region({ x: 1, name: 'Utah', value: 15.4 }),
        ],
      })],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.CHOROPLETH);
    // A map series is bound to no axis a title could be read from.
    expect(layers[0].axes).toEqual({ x: { label: 'Region' }, y: { label: 'Value' } });
    expect(layers[0].data as ChoroplethPoint[]).toEqual([
      { x: 'Nevada', y: 42.1 },
      { x: 'Utah', y: 15.4 },
    ]);
    expect(layers[0].selectors).toEqual([
      '#map-chart .highcharts-series-group .highcharts-series-0 [data-maidr-region-index="0"]',
      '#map-chart .highcharts-series-group .highcharts-series-0 [data-maidr-region-index="1"]',
    ]);
  });

  it('stamps the announced regions rather than the drawn ones', () => {
    const points = [
      region({ x: 0, name: 'Nevada', value: 42.1 }),
      // Highcharts still draws a region with no value, in the null colour.
      region({ x: 1, name: 'Utah', value: undefined }),
      region({ x: 2, name: 'Idaho', value: 8.7 }),
    ];
    const series = fakeSeries({ index: 0, type: 'map', data: points });
    const chart = fakeChart({ series: [series] });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ChoroplethPoint[];

    expect(data.map(point => point.x)).toEqual(['Nevada', 'Idaho']);
    // Idaho is the second region MAIDR announces, so its shape carries index 1
    // — index 2, which is where it sits in the drawn order, would shade Utah's
    // shape for every announcement of Idaho.
    expect(stampOf(series.data[0])).toBe('0');
    expect(stampOf(series.data[1])).toBeNull();
    expect(stampOf(series.data[2])).toBe('1');
  });

  it('places the regions from the centroids the map data carries', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'map',
        data: [
          region({
            x: 0,
            name: 'Nevada',
            value: 42.1,
            properties: { 'hc-middle-lon': -116.6, 'hc-middle-lat': 39.3 },
          }),
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ChoroplethPoint[];

    expect(data[0]).toEqual({ x: 'Nevada', y: 42.1, lon: -116.6, lat: 39.3 });
  });

  it('places the regions through the map view when the map data carries none', () => {
    const chart = fakeChart({
      mapView: {
        projectedUnitsToLonLat: ({ x, y }) => ({ lon: x / 10, lat: y / 10 }),
      },
      series: [fakeSeries({
        index: 0,
        type: 'map',
        data: [region({
          x: 0,
          name: 'Nevada',
          value: 42.1,
          bounds: { x1: -1200, y1: 380, x2: -1132, y2: 406, midX: -1166, midY: 393 },
        })],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ChoroplethPoint[];

    expect(data[0]).toEqual({ x: 'Nevada', y: 42.1, lon: -116.6, lat: 39.3 });
  });

  it('places the regions from a map view that answers with a pair', () => {
    const chart = fakeChart({
      // Highcharts has spelled the return value both ways; losing every
      // centroid to the spelling would cost the whole spatial reading.
      mapView: { projectedUnitsToLonLat: ({ x, y }) => [x / 10, y / 10] },
      series: [fakeSeries({
        index: 0,
        type: 'map',
        data: [region({
          x: 0,
          name: 'Nevada',
          value: 42.1,
          bounds: { x1: -1200, y1: 380, x2: -1132, y2: 406, midX: -1166, midY: 393 },
        })],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ChoroplethPoint[];

    expect(data[0]).toEqual({ x: 'Nevada', y: 42.1, lon: -116.6, lat: 39.3 });
  });

  it('omits a centroid the map view did not answer in degrees', () => {
    const chart = fakeChart({
      // A pre-projected map has no geographic projection, and Highcharts hands
      // back its own units rather than nothing on some releases.
      mapView: { projectedUnitsToLonLat: ({ x, y }) => [x, y] },
      series: [fakeSeries({
        index: 0,
        type: 'map',
        data: [region({
          x: 0,
          name: 'Nevada',
          value: 42.1,
          bounds: { x1: 0, y1: 0, x2: 400, y2: 400, midX: 200, midY: 200 },
        })],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ChoroplethPoint[];

    // Announced as degrees, 200 east of Greenwich is a place that does not
    // exist and a compass direction the map never drew.
    expect(data[0]).toEqual({ x: 'Nevada', y: 42.1 });
  });

  it('reads the columns a declaration renames', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'map',
        options: {
          custom: {
            maidr: {
              type: TraceType.CHOROPLETH,
              region: 'state',
              value: 'density',
              lon: 'centreLon',
              lat: 'centreLat',
            },
          },
        },
        data: [
          region({
            x: 0,
            name: 'us-nv',
            value: 1,
            options: { state: 'Nevada', density: 42.1, centreLon: -116.6, centreLat: 39.3 },
          }),
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ChoroplethPoint[];

    // The joined key is what Highcharts put in `name`; the declaration is how
    // the reader hears the state instead.
    expect(data[0]).toEqual({ x: 'Nevada', y: 42.1, lon: -116.6, lat: 39.3 });
  });

  it('reads a mapbubble series as a choropleth', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'mapbubble',
        data: [region({ x: 0, name: 'Nevada', value: 42.1, z: 12 } as Partial<HighchartsPoint>)],
      })],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // This series was declined until #1186, on the grounds that announcing
    // its bubbles as shaded regions "would report a magnitude the chart draws
    // nowhere". That was wrong twice: the magnitude *is* drawn, as the
    // bubble's area, and the Chart.js adapter had meanwhile been reading
    // `chartjs-chart-geo`'s `bubbleMap` as a choropleth all along -- so two
    // adapters gave one chart two answers, and one of them was silence.
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.CHOROPLETH);
    // The **size** is announced, not the `value` the same point also carries.
    // A bubble joined to a map feature can hold both -- Highcharts colours it
    // by `value` and sizes it by `z` -- and the bubble is what the chart is
    // named for and what a sighted reader compares. It is also the field the
    // Chart.js adapter reads for `chartjs-chart-geo`'s `bubbleMap`
    // (`bubbleMap: 'size'`), so one chart gets one answer from both.
    expect(layers[0].data).toEqual([{ x: 'Nevada', y: 12 }]);
  });
});
