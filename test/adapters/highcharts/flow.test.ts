import type { FlowPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** Links as Highcharts builds them from `data: [['Coal', 'Electricity', 34], …]`. */
const LINKS = [
  { from: 'Coal', to: 'Electricity', weight: 34 },
  { from: 'Gas', to: 'Electricity', weight: 21 },
  { from: 'Electricity', to: 'Homes', weight: 40 },
  { from: 'Electricity', to: 'Industry', weight: 15 },
];

describe('highcharts sankey-family series', () => {
  it('converts a sankey series into source/target/value flows', () => {
    const chart = fakeChart({
      title: 'Energy flow',
      type: 'sankey',
      renderToId: 'sankey-chart',
      series: [fakeSeries({ index: 0, type: 'sankey', name: 'Energy', data: LINKS })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SANKEY);
    expect(layer.title).toBe('Energy');
    // The nodes are derived from the edges by the model; the adapter never
    // reads `series.nodes`.
    expect(layer.data as FlowPoint[]).toEqual([
      { source: 'Coal', target: 'Electricity', value: 34 },
      { source: 'Gas', target: 'Electricity', value: 21 },
      { source: 'Electricity', target: 'Homes', value: 40 },
      { source: 'Electricity', target: 'Industry', value: 15 },
    ]);
    // Sankey draws its nodes into the same group as its links, so the link
    // class is what separates the ribbons out.
    expect(layer.selectors).toBe(
      '#sankey-chart .highcharts-series-group .highcharts-series-0 .highcharts-link',
    );
    expect(layer.axes?.x?.label).toBe('Node');
    expect(layer.axes?.y?.label).toBe('Weight');
  });

  it('reads a dependency wheel as a chord — the same graph bent into a circle', () => {
    const chart = fakeChart({
      type: 'dependencywheel',
      series: [fakeSeries({ index: 0, type: 'dependencywheel', data: LINKS })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.CHORD);
    expect((layer.data as FlowPoint[])[0]).toEqual({
      source: 'Coal',
      target: 'Electricity',
      value: 34,
    });
  });

  it('reads an arc diagram as a sankey laid along one axis', () => {
    const chart = fakeChart({
      type: 'arcdiagram',
      series: [fakeSeries({ index: 0, type: 'arcdiagram', data: LINKS })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SANKEY);
    expect(layer.data).toHaveLength(4);
  });

  it('drops a weightless link, which Highcharts draws no ribbon for', () => {
    const chart = fakeChart({
      type: 'sankey',
      series: [fakeSeries({
        index: 0,
        type: 'sankey',
        data: [
          { from: 'Coal', to: 'Electricity', weight: 34 },
          { from: 'Wind', to: 'Electricity', weight: 0 },
          { from: 'Electricity', to: 'Homes', weight: 40 },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as FlowPoint[];

    // Keeping the gap would slide the Homes ribbon's highlight onto the Coal
    // one, because Highcharts renders no path for a zero weight.
    expect(data).toEqual([
      { source: 'Coal', target: 'Electricity', value: 34 },
      { source: 'Electricity', target: 'Homes', value: 40 },
    ]);
  });
});
