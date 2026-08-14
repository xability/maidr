import type { NetworkPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** Links as Highcharts builds them from `data: [['Ada', 'Grace'], …]`. */
const LINKS = [
  { from: 'Ada', to: 'Grace' },
  { from: 'Grace', to: 'Alan' },
  { from: 'Alan', to: 'Ada' },
];

describe('highcharts networkgraph series', () => {
  it('converts a networkgraph series into undirected source/target links', () => {
    const chart = fakeChart({
      title: 'Collaborations',
      type: 'networkgraph',
      renderToId: 'network-chart',
      series: [fakeSeries({ index: 0, type: 'networkgraph', name: 'People', data: LINKS })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.title).toBe('People');
    // Where the force solver dropped each node is a fact about its seed, so
    // no position is carried.
    expect(layer.data as NetworkPoint[]).toEqual([
      { source: 'Ada', target: 'Grace' },
      { source: 'Grace', target: 'Alan' },
      { source: 'Alan', target: 'Ada' },
    ]);
    // Highcharts gives a link no class of its own, so the marked nodes are
    // what gets excluded.
    expect(layer.selectors).toBe(
      '#network-chart .highcharts-series-group .highcharts-series-0 '
      + '.highcharts-point:not(.highcharts-node)',
    );
    expect(layer.axes?.x?.label).toBe('Node');
    expect(layer.axes?.y?.label).toBe('Links');
  });

  it('drops a link missing an end, which Highcharts renders no path for', () => {
    const chart = fakeChart({
      type: 'networkgraph',
      series: [fakeSeries({
        index: 0,
        type: 'networkgraph',
        data: [{ from: 'Ada', to: 'Grace' }, { from: 'Alan' }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as NetworkPoint[];

    expect(data).toEqual([{ source: 'Ada', target: 'Grace' }]);
  });
});
