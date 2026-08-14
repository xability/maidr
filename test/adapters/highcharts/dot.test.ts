import type { BarPoint, ScatterPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

describe('highcharts category-axis scatter (dot plot)', () => {
  it('converts a scatter on a category axis into a dot layer keeping the labels', () => {
    // Regression: a ScatterPoint's `x` is strictly numeric, so this series
    // used to announce the bare tick INDEX and drop the label the chart
    // prints under each dot.
    const chart = fakeChart({
      title: 'Median pay',
      type: 'scatter',
      renderToId: 'dot-chart',
      series: [fakeSeries({
        index: 0,
        type: 'scatter',
        name: 'Median',
        xAxis: fakeAxis({ categories: ['Nurse', 'Teacher', 'Driver'] }),
        data: categoryPoints([61, 54, 42], ['Nurse', 'Teacher', 'Driver']),
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.title).toBe('Median');
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Nurse', y: 61 },
      { x: 'Teacher', y: 54 },
      { x: 'Driver', y: 42 },
    ]);
    // Dots are ordinary scatter markers: the hidden hit-detection twins have
    // to stay filtered out or every dot maps to two elements.
    expect(layer.selectors).toBe(
      '#dot-chart .highcharts-series-group .highcharts-series-0 .highcharts-point:not([visibility="hidden"])',
    );
  });

  it('leaves a scatter on numeric axes a scatter', () => {
    const chart = fakeChart({
      type: 'scatter',
      series: [fakeSeries({
        index: 0,
        type: 'scatter',
        name: 'Samples',
        data: [{ x: 1.5, y: 3 }, { x: 2.5, y: 4 }],
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 1.5, y: 3 },
      { x: 2.5, y: 4 },
    ]);
  });

  it('drops a valueless point, which Highcharts draws no marker for', () => {
    const chart = fakeChart({
      type: 'scatter',
      series: [fakeSeries({
        index: 0,
        type: 'scatter',
        xAxis: fakeAxis({ categories: ['a', 'b', 'c'] }),
        data: [
          { x: 0, y: 4, category: 'a' },
          { x: 1, y: null, category: 'b' },
          { x: 2, y: 6, category: 'c' },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as BarPoint[];

    expect(data).toEqual([
      { x: 'a', y: 4 },
      { x: 'c', y: 6 },
    ]);
  });
});
