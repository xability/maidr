import type { BarPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** Points as Highcharts builds them from `data: [['Website visits', 15654], …]`. */
const STAGES = [
  { name: 'Website visits', y: 15654 },
  { name: 'Downloads', y: 4064 },
  { name: 'Requested price list', y: 1987 },
  { name: 'Finalized', y: 846 },
];

describe('highcharts funnel series', () => {
  it('converts a funnel series into stage/count pairs in declared order', () => {
    const chart = fakeChart({
      title: 'Sales funnel',
      type: 'funnel',
      renderToId: 'funnel-chart',
      series: [fakeSeries({ index: 0, type: 'funnel', name: 'Unique users', data: STAGES })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(layer.title).toBe('Unique users');
    // Declared order is stage order; the retention between adjacent stages is
    // arithmetic FunnelTrace does itself.
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Website visits', y: 15654 },
      { x: 'Downloads', y: 4064 },
      { x: 'Requested price list', y: 1987 },
      { x: 'Finalized', y: 846 },
    ]);
    expect(layer.selectors).toBe(
      '#funnel-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
    // A funnel series is bound to no axis, so neither dimension is named
    // after one.
    expect(layer.axes?.x?.label).toBe('Stage');
    expect(layer.axes?.y?.label).toBe('Count');
  });

  it('reads a pyramid as a funnel — the same stages, drawn flipped', () => {
    const chart = fakeChart({
      type: 'pyramid',
      series: [fakeSeries({ index: 0, type: 'pyramid', data: STAGES })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.FUNNEL);
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 'Website visits', y: 15654 });
  });

  it('drops a valueless stage, which Highcharts draws no segment for', () => {
    const chart = fakeChart({
      type: 'funnel',
      series: [fakeSeries({
        index: 0,
        type: 'funnel',
        data: [{ name: 'Visits', y: 100 }, { name: 'Unknown', y: null }, { name: 'Sales', y: 10 }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as BarPoint[];

    // Keeping the gap would slide Sales' highlight onto the Visits segment.
    expect(data).toEqual([
      { x: 'Visits', y: 100 },
      { x: 'Sales', y: 10 },
    ]);
  });
});
