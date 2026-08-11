import type { PiePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** Points as Highcharts builds them from `data: [{ name, y }, …]`. */
const BROWSERS = [
  { name: 'Chrome', y: 61.4 },
  { name: 'Safari', y: 24.5 },
  { name: 'Edge', y: 14.1 },
];

describe('highcharts pie series', () => {
  it('converts a pie series into a flat pie layer in slice order', () => {
    const chart = fakeChart({
      title: 'Browser share',
      type: 'pie',
      renderToId: 'pie-chart',
      series: [fakeSeries({ index: 0, type: 'pie', name: 'Browsers', data: BROWSERS })],
    });

    const result = highchartsToMaidr(chart, { id: 'test-pie' });
    const layer = result.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.title).toBe('Browsers');
    // Highcharts draws the wedges in data order, so no reordering to undo.
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Chrome', y: 61.4 },
      { x: 'Safari', y: 24.5 },
      { x: 'Edge', y: 14.1 },
    ]);
    expect(layer.selectors).toBe(
      '#pie-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
    // A pie is bound to no axis, so neither dimension is named after one.
    expect(layer.axes?.x?.label).toBe('Label');
    expect(layer.axes?.y?.label).toBe('Value');
    expect(layer.orientation).toBeUndefined();
  });

  it('resolves the series type from the chart when the series omits it', () => {
    const chart = fakeChart({
      type: 'pie',
      renderToId: 'chart-typed-pie',
      // No per-series `type`: `chart.type` is what makes this a pie, which is
      // how the Highcharts pie demos are written.
      series: [fakeSeries({ index: 0, type: '', name: 'Browsers', data: BROWSERS })],
    });

    const result = highchartsToMaidr(chart);

    expect(result.subplots[0][0].layers[0].type).toBe(TraceType.PIE);
  });

  it('drops a valueless point, which Highcharts draws no wedge for', () => {
    const chart = fakeChart({
      type: 'pie',
      renderToId: 'pie-with-gap',
      series: [fakeSeries({
        index: 0,
        type: 'pie',
        data: [{ name: 'Chrome', y: 61.4 }, { name: 'Unknown', y: null }, { name: 'Edge', y: 14.1 }],
      })],
    });

    const result = highchartsToMaidr(chart);
    const data = result.subplots[0][0].layers[0].data as PiePoint[];

    // Keeping the gap would leave three slices against two wedges, sliding
    // Edge's highlight onto Chrome's.
    expect(data).toEqual([
      { x: 'Chrome', y: 61.4 },
      { x: 'Edge', y: 14.1 },
    ]);
  });

  it('labels a slice by its index when the point carries no name', () => {
    const chart = fakeChart({
      type: 'pie',
      renderToId: 'pie-unnamed',
      // `data: [8, 3]` — Highcharts leaves such points nameless.
      series: [fakeSeries({ index: 0, type: 'pie', data: [{ y: 8 }, { y: 3 }] })],
    });

    const result = highchartsToMaidr(chart);
    const data = result.subplots[0][0].layers[0].data as PiePoint[];

    expect(data).toEqual([
      { x: 0, y: 8 },
      { x: 1, y: 3 },
    ]);
  });
});
