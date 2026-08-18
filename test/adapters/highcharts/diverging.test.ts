import type { SegmentedPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { Orientation, TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const BANDS = ['0-9', '10-19', '20-29'];

/** The Highcharts population pyramid: two stacked bars, one side negated. */
function pyramidChart(
  men: number[],
  women: number[],
): ReturnType<typeof fakeChart> {
  const xAxis = fakeAxis({ categories: BANDS });
  const yAxis = fakeAxis({ options: { title: { text: 'Population' } } });
  const side = (name: string, values: number[], index: number): ReturnType<typeof fakeSeries> =>
    fakeSeries({
      index,
      type: 'bar',
      name,
      xAxis,
      yAxis,
      options: { stacking: 'normal' },
      data: values.map((y, i) => ({ x: i, y, category: BANDS[i] })),
    });

  return fakeChart({
    title: 'Population pyramid',
    renderToId: 'diverging-chart',
    type: 'bar',
    series: [side('Men', men, 0), side('Women', women, 1)],
  });
}

describe('highcharts diverging bar charts', () => {
  it('reads two back-to-back stacked series as a diverging layer', () => {
    const chart = pyramidChart([-2100, -1900, -1750], [2000, 1850, 1700]);

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // The sign survives: it is what tells the trace which side a bar points
    // to, and it is what the trace deliberately does not announce.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [
        { x: -2100, y: '0-9', z: 'Men' },
        { x: -1900, y: '10-19', z: 'Men' },
        { x: -1750, y: '20-29', z: 'Men' },
      ],
      [
        { x: 2000, y: '0-9', z: 'Women' },
        { x: 1850, y: '10-19', z: 'Women' },
        { x: 1700, y: '20-29', z: 'Women' },
      ],
    ]);
    // Highcharts lays one series group out after another, which is row-major
    // — the opposite of what `SegmentedTrace` assumes for `<rect>` marks.
    expect(layer.domMapping).toEqual({ order: 'row' });
    // Named per cell rather than left to that mapping. A grid is honoured
    // before the mapping is consulted at all, so this is the stronger claim of
    // the two; the hint stays for a producer that still needs it (#1002).
    const group = '#diverging-chart .highcharts-series-group';
    expect(layer.selectors).toEqual([
      [1, 2, 3].map(bar =>
        `${group} .highcharts-series-0 .highcharts-point:nth-child(${bar})`),
      [1, 2, 3].map(bar =>
        `${group} .highcharts-series-1 .highcharts-point:nth-child(${bar})`),
    ]);
  });

  it('leaves a genuine stack alone when both sides grow the same way', () => {
    const chart = pyramidChart([2100, 1900, 1750], [2000, 1850, 1700]);

    // Segments that accumulate on one side of the baseline are a stack, and
    // reading them as two sides would name a winner out of their sum.
    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.STACKED);
  });

  it('leaves a series that crosses the baseline alone', () => {
    const chart = pyramidChart([-2100, 1900, -1750], [2000, 1850, 1700]);

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.STACKED);
  });

  it('does not fire on three stacked series', () => {
    const chart = pyramidChart([-2100, -1900, -1750], [2000, 1850, 1700]);
    chart.series.push(fakeSeries({
      index: 2,
      type: 'bar',
      name: 'Other',
      xAxis: chart.series[0].xAxis,
      yAxis: chart.series[0].yAxis,
      options: { stacking: 'normal' },
      data: [{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 30 }],
    }));

    // "X ahead" is a comparison between exactly two sides.
    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.STACKED);
  });

  it('does not fire on an unstacked pair', () => {
    const chart = pyramidChart([-2100, -1900, -1750], [2000, 1850, 1700]);
    for (const series of chart.series) {
      series.options.stacking = undefined;
    }

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.DODGED);
  });
});
