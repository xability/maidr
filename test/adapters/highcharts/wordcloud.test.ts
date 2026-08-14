import type { WordCloudPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** Points as Highcharts builds them from `data: [{ name, weight }, …]`. */
const TERMS = [
  { name: 'lorem', weight: 3 },
  { name: 'ipsum', weight: 12 },
  { name: 'dolor', weight: 7 },
];

describe('highcharts wordcloud series', () => {
  it('converts a wordcloud series into terms and weights', () => {
    const chart = fakeChart({
      title: 'Lorem ipsum',
      type: 'wordcloud',
      renderToId: 'cloud-chart',
      series: [fakeSeries({ index: 0, type: 'wordcloud', name: 'Occurrences', data: TERMS })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.WORD_CLOUD);
    expect(layer.title).toBe('Occurrences');
    expect(layer.selectors).toBe(
      '#cloud-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
    // A cloud is bound to no axis either.
    expect(layer.axes?.x?.label).toBe('Term');
    expect(layer.axes?.y?.label).toBe('Weight');
  });

  it('emits the terms heaviest first, matching the order Highcharts draws them', () => {
    // Load-bearing: `WordcloudSeries#drawPoints` sorts a copy of its points by
    // descending weight before drawing, so document order is weight order —
    // and WordCloudTrace pairs the glyph at document position i with the term
    // authored at index i. Declared order here would announce one word and
    // highlight another.
    const chart = fakeChart({
      type: 'wordcloud',
      series: [fakeSeries({ index: 0, type: 'wordcloud', data: TERMS })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as WordCloudPoint[];

    expect(data).toEqual([
      { x: 'ipsum', y: 12 },
      { x: 'dolor', y: 7 },
      { x: 'lorem', y: 3 },
    ]);
  });

  it('keeps equally weighted terms in the order they were declared', () => {
    // Both sorts are stable, so ties resolve the same way on either side.
    const chart = fakeChart({
      type: 'wordcloud',
      series: [fakeSeries({
        index: 0,
        type: 'wordcloud',
        data: [
          { name: 'alpha', weight: 5 },
          { name: 'beta', weight: 9 },
          { name: 'gamma', weight: 5 },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as WordCloudPoint[];

    expect(data.map(term => term.x)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('falls back to `y` for a term whose weight is not in `point.weight`', () => {
    const chart = fakeChart({
      type: 'wordcloud',
      series: [fakeSeries({
        index: 0,
        type: 'wordcloud',
        data: [{ name: 'solo', y: 4 }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as WordCloudPoint[];

    expect(data).toEqual([{ x: 'solo', y: 4 }]);
  });

  it('drops a weightless term, which Highcharts places no glyph for', () => {
    const chart = fakeChart({
      type: 'wordcloud',
      series: [fakeSeries({
        index: 0,
        type: 'wordcloud',
        data: [{ name: 'kept', weight: 2 }, { name: 'dropped', y: null }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as WordCloudPoint[];

    expect(data).toEqual([{ x: 'kept', y: 2 }]);
  });
});
