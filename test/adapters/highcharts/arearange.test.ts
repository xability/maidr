import type { ErrorBarPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/**
 * A band with two bounds and nothing between them.
 *
 * `arearange` emitted **no layer at all** before #1047, because every point
 * shape in the grammar carrying an interval also required an estimate, and a
 * band has none. Measured on real Highcharts 11 plus `highcharts-more.js` in
 * Chromium; `areasplinerange` and the `polygon` shape mark were the other two
 * silent types, and `polygon` is still declined, having no statistical
 * reading at all.
 */
const CATEGORIES = ['Jan', 'Feb', 'Mar', 'Apr'];
const RANGES = [[5, 15], [30, 50], [12, 28], [22, 38]];

/**
 * A range chart of one series.
 * @param type Which of the two range series types to draw
 * @returns The chart
 */
function bandChart(type: 'arearange' | 'areasplinerange'): ReturnType<typeof fakeChart> {
  return fakeChart({
    title: 'Temperature range',
    renderToId: 'range-chart',
    series: [fakeSeries({
      index: 0,
      type,
      name: 'Range',
      xAxis: fakeAxis({ categories: CATEGORIES }),
      yAxis: fakeAxis({ options: { title: { text: 'Degrees' } } }),
      data: RANGES.map(([low, high], i) => ({
        x: i,
        category: CATEGORIES[i],
        low,
        high,
      })),
    })],
  });
}

describe('highcharts range series', () => {
  it.each(['arearange', 'areasplinerange'] as const)(
    'reads a %s as the band it draws',
    (type) => {
      const layers = highchartsToMaidr(bandChart(type)).subplots[0][0].layers;

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.ERROR_BAR);
      expect(layers[0].data as ErrorBarPoint[]).toEqual([
        { x: 'Jan', yMin: 5, yMax: 15 },
        { x: 'Feb', yMin: 30, yMax: 50 },
        { x: 'Mar', yMin: 12, yMax: 28 },
        { x: 'Apr', yMin: 22, yMax: 38 },
      ]);
    },
  );

  it('invents no estimate between the bounds', () => {
    // The point of #1047. `convertErrorBarSeries` falls back to the midpoint
    // for an *unlinked whip*, which is defensible there because an error bar
    // is drawn about a centre. A band is drawn about nothing, so `(low +
    // high) / 2` would be a number the chart never shows -- a reader told
    // "10" at a region spanning 5 to 15 has been told something false.
    const points = highchartsToMaidr(bandChart('arearange'))
      .subplots[0][0]
      .layers[0]
      .data as ErrorBarPoint[];

    for (const point of points) {
      expect(point.y).toBeUndefined();
    }
  });

  it('carries a one-sided sample rather than dropping it', () => {
    // The bounds are independently optional, and always were: a sample with
    // only an upper bound is a real thing to draw, and losing the sample
    // would slide every later highlight onto its neighbour.
    const chart = fakeChart({
      title: 'Partial',
      renderToId: 'partial-range-chart',
      series: [fakeSeries({
        index: 0,
        type: 'arearange',
        name: 'Range',
        xAxis: fakeAxis({ categories: ['a', 'b'] }),
        yAxis: fakeAxis({ options: { title: { text: 'v' } } }),
        data: [
          { x: 0, category: 'a', low: 1, high: 4 },
          { x: 1, category: 'b', high: 9 },
        ],
      })],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].data).toEqual([
      { x: 'a', yMin: 1, yMax: 4 },
      { x: 'b', yMax: 9 },
    ]);
  });
});
