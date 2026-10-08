/**
 * @jest-environment jsdom
 */

import type { ApexChartsAdapterOptions } from '@adapters/apexcharts';
import type { PercentileBandPoint } from '@type/grammar';
import { apexchartsToMaidr } from '@adapters/apexcharts';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { fakeChart, svg } from './helpers';

/**
 * A fan chart as ApexCharts 7.6.0 draws one: two `rangeArea` series and a
 * `line` median in one combo chart. The globals are the ones measured in
 * Chromium for that chart -- `series` holds each range's high value, and
 * `seriesRangeStart` / `seriesRangeEnd` its low and high -- and the paths are
 * the ones it drew: one `path.apexcharts-rangeArea` per range series and one
 * `path.apexcharts-line` for the median, each in its own series group.
 */

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

const OUTER_D = 'M 0 86.116 L 276.6 43.058 L 553.2 0M 0 86.116 L 0 258.348 L 276.6 215.29 L 553.2 172.232 L 553.2 0';
const INNER_D = 'M 0 129.174 L 276.6 86.116 L 553.2 43.058M 0 129.174 L 0 215.29 L 276.6 172.232 L 553.2 129.174 L 553.2 43.058';
const MEDIAN_D = 'M 0 172.232 L 276.6 129.174 L 553.2 86.116';

function fanChart(medianType = 'line') {
  return fakeChart({
    type: 'rangeArea',
    series: [
      { name: 'p5-p95', type: 'rangeArea', values: [2, 3, 4], x: [1, 2, 3] },
      { name: 'p25-p75', type: 'rangeArea', values: [1, 2, 3], x: [1, 2, 3] },
      { name: 'Median', type: medianType, values: [0, 1, 2], x: [1, 2, 3] },
    ],
    labels: [1, 2, 3],
    categoryLabels: ['a', 'b', 'c'],
    isXNumeric: true,
    globals: {
      seriesRangeStart: [[-2, -1, 0], [-1, 0, 1], [0, 1, 2]],
      seriesRangeEnd: [[2, 3, 4], [1, 2, 3], [0, 1, 2]],
    },
    draw: (dom) => {
      svg('path', { 'class': 'apexcharts-rangeArea', 'd': OUTER_D, 'fill-rule': 'evenodd' }, dom.series(0, 'apexcharts-rangeArea-series'));
      svg('path', { 'class': 'apexcharts-rangeArea', 'd': INNER_D, 'fill-rule': 'evenodd' }, dom.series(1, 'apexcharts-rangeArea-series'));
      svg('path', { class: 'apexcharts-line', d: MEDIAN_D, fill: 'none' }, dom.series(2, 'apexcharts-line-series'));
    },
  });
}

const BANDS: ApexChartsAdapterOptions['percentileBands'] = [{
  median: 'Median',
  bands: [
    { series: 'p5-p95', lower: 0.05, upper: 0.95 },
    { series: 'p25-p75', lower: 0.25, upper: 0.75 },
  ],
}];

describe('apexcharts percentile band', () => {
  it('reads a declared fan from its rangeArea edges and its median line', () => {
    const layers = apexchartsToMaidr(fanChart(), { percentileBands: BANDS }).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PERCENTILE_BAND);
    expect(layers[0].title).toBe('Median');
    expect((layers[0].data as PercentileBandPoint[])[1]).toEqual({
      x: 'b',
      quantiles: [
        { level: 0.05, value: -1 },
        { level: 0.25, value: 0 },
        { level: 0.5, value: 1 },
        { level: 0.75, value: 2 },
        { level: 0.95, value: 3 },
      ],
    });
  });

  it('outlines each band\'s filled path, outermost first, then the median\'s line', () => {
    const chart = fanChart();
    const maidr = apexchartsToMaidr(chart, { percentileBands: BANDS });

    const figure = new Figure(maidr);
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    const trace = figure.subplots[0][0].traces[0][0] as unknown as {
      highlightValues: SVGElement[][][] | null;
    };
    const outlined = trace.highlightValues?.map(row => (row[0] as unknown as SVGElement[])[0].getAttribute('d'));

    // Levels 0.05, 0.25, 0.5, 0.75 and 0.95.
    expect(outlined).toEqual([OUTER_D, INNER_D, MEDIAN_D, INNER_D, OUTER_D]);
  });

  it('skips a rangeArea no fan names, as before', () => {
    const layers = apexchartsToMaidr(fanChart()).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([TraceType.LINE]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('drawn as "rangeArea"'));
  });

  it('leaves out a band that is not a rangeArea, keeping the rest', () => {
    const layers = apexchartsToMaidr(fanChart(), {
      percentileBands: [{
        median: 'Median',
        bands: [
          { series: 'p5-p95', lower: 0.05, upper: 0.95 },
          { series: 'Missing', lower: 0.25, upper: 0.75 },
        ],
      }],
    }).subplots[0][0].layers;

    const fan = layers.find(layer => layer.type === TraceType.PERCENTILE_BAND);
    expect((fan?.data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.05, 0.5, 0.95]);
    expect(fan?.selectors).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Missing" as a band of "Median"'));
  });

  it('reads the series as before when the median is not a line', () => {
    const layers = apexchartsToMaidr(fanChart('area'), { percentileBands: BANDS }).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([TraceType.AREA]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "Median" as the median, which is drawn as "area"'));
  });
});
