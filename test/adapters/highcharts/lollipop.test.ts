import type { BarPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

describe('highcharts lollipop series', () => {
  it('converts a lollipop series into a lollipop layer of category/value pairs', () => {
    const chart = fakeChart({
      title: 'Winter temperatures',
      type: 'lollipop',
      renderToId: 'lollipop-chart',
      series: [fakeSeries({
        index: 0,
        type: 'lollipop',
        name: 'Temperature',
        xAxis: fakeAxis({
          categories: ['Jan', 'Feb', 'Mar'],
          options: { title: { text: 'Month' } },
        }),
        yAxis: fakeAxis({ options: { title: { text: 'Degrees' } } }),
        data: categoryPoints([-3, -1, 4], ['Jan', 'Feb', 'Mar']),
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.title).toBe('Temperature');
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Jan', y: -3 },
      { x: 'Feb', y: -1 },
      { x: 'Mar', y: 4 },
    ]);
    expect(layer.axes?.x?.label).toBe('Month');
    expect(layer.axes?.y?.label).toBe('Degrees');
    // The stem carries no point class, so only the markers are highlighted —
    // and their hidden hit-detection twins stay filtered out.
    expect(layer.selectors).toBe(
      '#lollipop-chart .highcharts-series-group .highcharts-series-0 .highcharts-point:not([visibility="hidden"])',
    );
  });

  it('resolves the series type from the chart when the series omits it', () => {
    const chart = fakeChart({
      type: 'lollipop',
      series: [fakeSeries({ index: 0, type: '', data: categoryPoints([1, 2], ['a', 'b']) })],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.LOLLIPOP);
  });

  it('drops a valueless point, which Highcharts draws no marker for', () => {
    const chart = fakeChart({
      type: 'lollipop',
      series: [fakeSeries({
        index: 0,
        type: 'lollipop',
        data: [
          { x: 0, y: 5, category: 'a' },
          { x: 1, y: null, category: 'b' },
          { x: 2, y: 7, category: 'c' },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as BarPoint[];

    expect(data).toEqual([
      { x: 'a', y: 5 },
      { x: 'c', y: 7 },
    ]);
  });
});
