import type { LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const SPOKES = ['Sales', 'Marketing', 'Development', 'Support'];

describe('highcharts polar charts', () => {
  it('reads a polar line chart as a radar rather than as a line', () => {
    const xAxis = fakeAxis({ categories: SPOKES });
    const chart = fakeChart({
      title: 'Budget vs spending',
      renderToId: 'radar-chart',
      polar: true,
      series: [
        fakeSeries({
          index: 0,
          type: 'line',
          name: 'Allocated',
          xAxis,
          yAxis: fakeAxis({ options: { title: { text: 'USD' } } }),
          data: [43000, 19000, 60000, 35000].map((y, i) => ({ x: i, y, category: SPOKES[i] })),
        }),
        fakeSeries({
          index: 1,
          type: 'line',
          name: 'Actual',
          xAxis,
          data: [50000, 39000, 42000, 31000].map((y, i) => ({ x: i, y, category: SPOKES[i] })),
        }),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // Both outlines share the spokes, so they are one layer with a row each.
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.RADAR);
    expect(layers[0].title).toBe('Allocated, Actual');
    expect((layers[0].data as LinePoint[][])[0]).toEqual([
      { x: 'Sales', y: 43000, z: 'Allocated' },
      { x: 'Marketing', y: 19000, z: 'Allocated' },
      { x: 'Development', y: 60000, z: 'Allocated' },
      { x: 'Support', y: 35000, z: 'Allocated' },
    ]);
    // A radar's outline is still a `path.highcharts-graph`, closed with a
    // repeat of its first vertex that `LineTrace` trims.
    expect(layers[0].selectors).toEqual([
      '#radar-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
      '#radar-chart .highcharts-series-group .highcharts-series-1 path.highcharts-graph',
    ]);
  });

  it('folds a polar area series into the same radar layer', () => {
    const xAxis = fakeAxis({ categories: SPOKES });
    const chart = fakeChart({
      polar: true,
      series: [
        fakeSeries({ index: 0, type: 'line', xAxis, data: [{ x: 0, y: 1 }] }),
        fakeSeries({ index: 1, type: 'area', xAxis, data: [{ x: 0, y: 2 }] }),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // A filled outline around the spokes is one more outline, not a band with
    // a baseline to stack on, so the area bucket does not exist here.
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.RADAR);
    expect(layers[0].data).toHaveLength(2);
  });

  it('reads polar columns as a polar area with one selector per series', () => {
    const chart = fakeChart({
      renderToId: 'windrose-chart',
      polar: true,
      type: 'column',
      series: [fakeSeries({
        index: 0,
        type: 'column',
        name: 'Frequency',
        xAxis: fakeAxis({ categories: ['N', 'E', 'S', 'W'] }),
        data: [1.2, 3.4, 2.1, 0.8].map((y, i) => ({ x: i, y, category: ['N', 'E', 'S', 'W'][i] })),
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    // Without the polar branch the wedges would have gone to `convertBarGroup`
    // and been announced as an ordinary bar chart.
    expect(layer.type).toBe(TraceType.POLAR_AREA);
    expect((layer.data as LinePoint[][])[0]).toHaveLength(4);
    // One arc per spoke carries the point class, so `LineTrace` highlights the
    // wedges directly instead of parsing a path.
    expect(layer.selectors).toEqual([
      '#windrose-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    ]);
  });

  it('leaves a cartesian line chart alone', () => {
    const chart = fakeChart({
      series: [fakeSeries({ index: 0, type: 'line', data: [{ x: 0, y: 1 }] })],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.LINE);
  });
});
