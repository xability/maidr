import type { DumbbellData } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const COUNTRIES = ['Norway', 'Japan', 'Chad'];

/** Life expectancy in 1990 against 2020 — the canonical dumbbell. */
const ROWS = [
  { low: 76.5, high: 83.2 },
  { low: 78.9, high: 84.6 },
  { low: 46.2, high: 54.2 },
];

function lifeExpectancyChart(): ReturnType<typeof fakeChart> {
  return fakeChart({
    title: 'Life expectancy',
    renderToId: 'dumbbell-chart',
    type: 'dumbbell',
    series: [fakeSeries({
      index: 0,
      type: 'dumbbell',
      name: 'Life expectancy',
      xAxis: fakeAxis({ categories: COUNTRIES }),
      yAxis: fakeAxis({ options: { title: { text: 'Years' } } }),
      data: ROWS.map((row, i) => ({ x: i, category: COUNTRIES[i], ...row })),
    })],
  });
}

describe('highcharts dumbbell series', () => {
  it('reads the low end as the start of the pair', () => {
    const layer = highchartsToMaidr(lifeExpectancyChart()).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DUMBBELL);
    expect(layer.title).toBe('Life expectancy');
    // The change between the ends is deliberately absent: `DumbbellTrace`
    // derives it, so an authored one would be a second source of truth.
    expect(layer.data as DumbbellData).toEqual({
      points: [
        { x: 'Norway', start: 76.5, end: 83.2 },
        { x: 'Japan', start: 78.9, end: 84.6 },
        { x: 'Chad', start: 46.2, end: 54.2 },
      ],
    });
    // One connector per row, not one element per dot — the two dots would
    // return twice as many elements as there are rows.
    expect(layer.selectors).toBe(
      '#dumbbell-chart .highcharts-series-group .highcharts-series-0 path.highcharts-lollipop-stem',
    );
    expect(layer.axes?.y?.label).toBe('Years');
  });

  it('names the two ends when the caller supplies names', () => {
    const layer = highchartsToMaidr(lifeExpectancyChart(), {
      dumbbellLabels: { start: '1990', end: '2020' },
    }).subplots[0][0].layers[0];

    // Highcharts names neither end, so without this a reader is told which dot
    // they are on but not which year it is.
    const data = layer.data as DumbbellData;
    expect(data.startLabel).toBe('1990');
    expect(data.endLabel).toBe('2020');
  });

  it('drops a row missing either end', () => {
    const chart = fakeChart({
      type: 'dumbbell',
      series: [fakeSeries({
        index: 0,
        type: 'dumbbell',
        xAxis: fakeAxis({ categories: COUNTRIES }),
        data: [
          { x: 0, category: 'Norway', low: 76.5, high: 83.2 },
          { x: 1, category: 'Japan', low: 78.9 },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as DumbbellData;

    // Neither `start` nor `end` has anywhere to be absent.
    expect(data.points).toEqual([{ x: 'Norway', start: 76.5, end: 83.2 }]);
  });
});
