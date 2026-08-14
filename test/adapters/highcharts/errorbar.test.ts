import type { ErrorBarPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['Jan', 'Feb', 'Mar'];

/** The Highcharts pattern: a column series with an error bar linked over it. */
function rainfallChart(errorBarData: { low: number; high: number }[]): {
  column: ReturnType<typeof fakeSeries>;
  errorBar: ReturnType<typeof fakeSeries>;
} {
  const xAxis = fakeAxis({ categories: CATEGORIES });
  const column = fakeSeries({
    index: 0,
    type: 'column',
    name: 'Rainfall',
    xAxis,
    yAxis: fakeAxis({ options: { title: { text: 'mm' } } }),
    data: [49.9, 71.5, 106.4].map((y, i) => ({ x: i, y, category: CATEGORIES[i] })),
  });
  const errorBar = fakeSeries({
    index: 1,
    type: 'errorbar',
    name: 'Rainfall error',
    xAxis,
    yAxis: fakeAxis({ options: { title: { text: 'mm' } } }),
    linkedParent: column,
    options: { linkedTo: ':previous' },
    data: errorBarData.map((bounds, i) => ({ x: i, category: CATEGORIES[i], ...bounds })),
  });
  return { column, errorBar };
}

describe('highcharts errorbar series', () => {
  it('zips the interval onto the estimate from the series it is linked to', () => {
    const { column, errorBar } = rainfallChart([
      { low: 48, high: 51 },
      { low: 68, high: 73 },
      { low: 92, high: 110 },
    ]);
    const chart = fakeChart({
      title: 'Rainfall',
      renderToId: 'errorbar-chart',
      series: [column, errorBar],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // The column carries the estimate and the whip the interval, so the two
    // series are one layer rather than two.
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.ERROR_BAR);
    expect(layers[0].data as ErrorBarPoint[]).toEqual([
      { x: 'Jan', y: 49.9, yMin: 48, yMax: 51 },
      { x: 'Feb', y: 71.5, yMin: 68, yMax: 73 },
      { x: 'Mar', y: 106.4, yMin: 92, yMax: 110 },
    ]);
    // The whip is a box plot group without the quartiles, so the group is the
    // one element inside the series carrying the point class.
    expect(layers[0].selectors).toBe(
      '#errorbar-chart .highcharts-series-group .highcharts-series-1 g.highcharts-point',
    );
    expect(layers[0].axes?.y?.label).toBe('mm');
  });

  it('resolves a parent named by id rather than by position', () => {
    const xAxis = fakeAxis({ categories: CATEGORIES });
    const scatter = fakeSeries({
      index: 0,
      type: 'scatter',
      name: 'Mean',
      xAxis,
      options: { id: 'means' },
      data: [{ x: 0, y: 10, category: 'Jan' }],
    });
    const chart = fakeChart({
      series: [
        scatter,
        fakeSeries({
          index: 1,
          type: 'errorbar',
          xAxis,
          options: { linkedTo: 'means' },
          data: [{ x: 0, category: 'Jan', low: 8, high: 12 }],
        }),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect((layers[0].data as ErrorBarPoint[])[0]).toEqual({
      x: 'Jan',
      y: 10,
      yMin: 8,
      yMax: 12,
    });
  });

  it('takes the midpoint of the interval when nothing is linked', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'errorbar',
        xAxis: fakeAxis({ categories: CATEGORIES }),
        data: [{ x: 0, category: 'Jan', low: 8, high: 12 }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ErrorBarPoint[];

    // An unlinked series draws its estimate at the centre of the whip, so
    // that is the honest reading of where the chart put it.
    expect(data).toEqual([{ x: 'Jan', y: 10, yMin: 8, yMax: 12 }]);
  });

  it('keeps the parent layer when the error bar does not cover every sample', () => {
    const { column, errorBar } = rainfallChart([{ low: 48, high: 51 }]);
    const chart = fakeChart({ series: [column, errorBar] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // Dropping the column here would leave February and March unannounced.
    expect(layers.map(layer => layer.type)).toEqual([
      TraceType.BAR,
      TraceType.ERROR_BAR,
    ]);
  });

  it('drops a sample Highcharts drew no whip for', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'errorbar',
        xAxis: fakeAxis({ categories: CATEGORIES }),
        data: [
          { x: 0, category: 'Jan', low: 8, high: 12 },
          // `pointValKey` is `high`, so a point without one is never placed.
          { x: 1, category: 'Feb', low: 20 },
          { x: 2, category: 'Mar', low: 30, high: 34 },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ErrorBarPoint[];

    expect(data.map(point => point.x)).toEqual(['Jan', 'Mar']);
  });

  it('carries a one-sided interval rather than dropping the estimate', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'errorbar',
        xAxis: fakeAxis({ categories: CATEGORIES }),
        data: [{ x: 0, category: 'Jan', high: 12 }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ErrorBarPoint[];

    expect(data).toEqual([{ x: 'Jan', y: 12, yMax: 12 }]);
  });
});
