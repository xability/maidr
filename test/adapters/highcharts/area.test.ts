import type { LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeChart, fakeSeries } from './helpers';

/** Points as Highcharts builds them for a percent stack: shares alongside values. */
function percentPoints(
  values: number[],
  percentages: number[],
  categories: string[],
): { x: number; y: number; category: string; percentage: number }[] {
  return values.map((y, i) => ({
    x: i,
    y,
    category: categories[i],
    percentage: percentages[i],
  }));
}

describe('highcharts area series', () => {
  it('converts an area series into an area layer rather than a line one', () => {
    const chart = fakeChart({
      title: 'Rainfall',
      type: 'area',
      renderToId: 'area-chart',
      series: [fakeSeries({
        index: 0,
        type: 'area',
        name: 'Tokyo',
        data: categoryPoints([49, 71, 106], ['Jan', 'Feb', 'Mar']),
      })],
    });

    const result = highchartsToMaidr(chart, { id: 'test-area' });
    const layer = result.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.title).toBe('Tokyo');
    expect(layer.data as LinePoint[][]).toEqual([[
      { x: 'Jan', y: 49, z: 'Tokyo' },
      { x: 'Feb', y: 71, z: 'Tokyo' },
      { x: 'Mar', y: 106, z: 'Tokyo' },
    ]]);
    // An area still draws the `highcharts-graph` path its top edge traces,
    // which is what AreaTrace inherits LineTrace's path parsing for.
    expect(layer.selectors).toEqual([
      '#area-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
    ]);
  });

  it('reads an areaspline as an area too', () => {
    const chart = fakeChart({
      type: 'areaspline',
      series: [fakeSeries({ index: 0, type: 'areaspline', data: categoryPoints([1, 2], ['a', 'b']) })],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.AREA);
  });

  it('merges unstacked bands into one layer, one row per series', () => {
    const chart = fakeChart({
      type: 'area',
      series: [
        fakeSeries({ index: 0, type: 'area', name: 'Tokyo', data: categoryPoints([1, 2], ['a', 'b']) }),
        fakeSeries({ index: 1, type: 'area', name: 'Berlin', data: categoryPoints([3, 4], ['a', 'b']) }),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.AREA);
    expect(layers[0].id).toBe('0-1');
    expect(layers[0].title).toBe('Tokyo, Berlin');
    expect(layers[0].data).toHaveLength(2);
  });

  it('keeps an area layer separate from the line layer it used to be fused into', () => {
    // Regression: `area`/`areaspline` used to sit in the adapter's line-type
    // set, so a mixed chart announced its filled bands as lines.
    const chart = fakeChart({
      type: 'line',
      series: [
        fakeSeries({ index: 0, type: 'line', name: 'Trend', data: categoryPoints([1, 2], ['a', 'b']) }),
        fakeSeries({ index: 1, type: 'area', name: 'Band', data: categoryPoints([3, 4], ['a', 'b']) }),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers.map(layer => [layer.type, layer.title])).toEqual([
      [TraceType.AREA, 'Band'],
      [TraceType.LINE, 'Trend'],
    ]);
  });

  describe('stacking', () => {
    it('reads series-level `stacking: normal` as a stacked area layer', () => {
      const chart = fakeChart({
        type: 'area',
        series: [
          fakeSeries({
            index: 0,
            type: 'area',
            name: 'Asia',
            options: { stacking: 'normal' },
            data: categoryPoints([502, 635], ['1750', '1800']),
          }),
          fakeSeries({
            index: 1,
            type: 'area',
            name: 'Africa',
            options: { stacking: 'normal' },
            data: categoryPoints([106, 107], ['1750', '1800']),
          }),
        ],
      });

      const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.STACKED_AREA);
      // Each band carries its OWN height, never the accumulated top edge:
      // AreaTrace sums the rows itself to announce the running total.
      expect(layer.data as LinePoint[][]).toEqual([
        [{ x: '1750', y: 502, z: 'Asia' }, { x: '1800', y: 635, z: 'Asia' }],
        [{ x: '1750', y: 106, z: 'Africa' }, { x: '1800', y: 107, z: 'Africa' }],
      ]);
    });

    it('reads chart-level `plotOptions.area.stacking` the same way', () => {
      const chart = fakeChart({
        type: 'area',
        plotOptions: { area: { stacking: 'normal' } },
        series: [
          fakeSeries({ index: 0, type: 'area', name: 'A', data: categoryPoints([1, 2], ['a', 'b']) }),
          fakeSeries({ index: 1, type: 'area', name: 'B', data: categoryPoints([3, 4], ['a', 'b']) }),
        ],
      });

      expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.STACKED_AREA);
    });

    it('reads `plotOptions.areaspline.stacking` for spline bands', () => {
      const chart = fakeChart({
        type: 'areaspline',
        plotOptions: { areaspline: { stacking: 'percent' } },
        series: [
          fakeSeries({ index: 0, type: 'areaspline', name: 'A', data: percentPoints([1, 2], [25, 40], ['a', 'b']) }),
          fakeSeries({ index: 1, type: 'areaspline', name: 'B', data: percentPoints([3, 3], [75, 60], ['a', 'b']) }),
        ],
      });

      expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.NORMALIZED_AREA);
    });

    it('carries each band\'s share, not its raw value, on a percent stack', () => {
      const chart = fakeChart({
        type: 'area',
        plotOptions: { series: { stacking: 'percent' } },
        series: [
          fakeSeries({ index: 0, type: 'area', name: 'A', data: percentPoints([1, 2], [25, 40], ['a', 'b']) }),
          fakeSeries({ index: 1, type: 'area', name: 'B', data: percentPoints([3, 3], [75, 60], ['a', 'b']) }),
        ],
      });

      const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.NORMALIZED_AREA);
      // The percentage is what the chart draws, so it is what is sonified.
      expect(layer.data as LinePoint[][]).toEqual([
        [{ x: 'a', y: 25, z: 'A' }, { x: 'b', y: 40, z: 'A' }],
        [{ x: 'a', y: 75, z: 'B' }, { x: 'b', y: 60, z: 'B' }],
      ]);
    });

    it('keeps a lone stacked band a plain area, having nothing to stack on', () => {
      const chart = fakeChart({
        type: 'area',
        plotOptions: { area: { stacking: 'normal' } },
        series: [fakeSeries({ index: 0, type: 'area', name: 'Only', data: categoryPoints([1, 2], ['a', 'b']) })],
      });

      expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.AREA);
    });

    it('leaves ragged bands ragged so a late starter contributes no phantom sample', () => {
      // AreaTrace keys its column totals by x value, so a band that begins
      // late simply has no entry at the earlier columns. Padding it with
      // zeros would announce a sample the chart never drew.
      const chart = fakeChart({
        type: 'area',
        series: [
          fakeSeries({
            index: 0,
            type: 'area',
            name: 'Early',
            options: { stacking: 'normal' },
            data: categoryPoints([1, 2, 3], ['a', 'b', 'c']),
          }),
          fakeSeries({
            index: 1,
            type: 'area',
            name: 'Late',
            options: { stacking: 'normal' },
            data: [{ x: 2, y: 9, category: 'c' }],
          }),
        ],
      });

      const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as LinePoint[][];

      expect(data[0]).toHaveLength(3);
      expect(data[1]).toEqual([{ x: 'c', y: 9, z: 'Late' }]);
    });
  });

  it('reads a stepped area as an area, since the fill is what it draws', () => {
    // A layer carries one trace type. Announcing a stepped area as a step
    // layer would drop a stacked one's totals entirely, so the fill wins.
    const chart = fakeChart({
      type: 'area',
      series: [fakeSeries({
        index: 0,
        type: 'area',
        name: 'Stage',
        options: { step: 'left' },
        data: categoryPoints([1, 1, 2], ['a', 'b', 'c']),
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.stepDirection).toBeUndefined();
  });
});
