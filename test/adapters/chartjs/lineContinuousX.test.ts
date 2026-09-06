/**
 * A line chart drawn against a linear or time x scale is authored as `{x, y}`
 * objects with no `data.labels`, so there is no label to name a point's
 * position with -- and the position is not the array index either. It is the
 * datum's own coordinate, which is what the reader is looking at.
 *
 * `survivalTime` already makes that choice for the survival branch; the
 * general line/area/step path had to make it too.
 */
import type { ChartJsChart, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';

/** A line chart as Chart.js leaves it after `update()`. */
function lineChart(
  datasets: Partial<ChartJsDataset>[],
  options: ChartJsOptions = {},
  labels?: (string | number)[],
): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: {
      ...(labels ? { labels } : {}),
      datasets: datasets as ChartJsDataset[],
    },
    options,
    config: { type: 'line' },
    getDatasetMeta: () => ({ data: [], type: 'line' }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** The chart's layers. */
function layersOf(chart: ChartJsChart): MaidrLayer[] {
  return extractChartData(chart).maidr.subplots[0][0].layers;
}

describe('chart.js line charts on a continuous x scale', () => {
  it('announces the datum\'s own x rather than its array position', () => {
    const chart = lineChart(
      [{ label: 'S', data: [{ x: 2020, y: 5 }, { x: 2021, y: 7 }] }],
      { scales: { x: { type: 'linear' } } },
    );

    const points = layersOf(chart)[0].data as LinePoint[][];

    expect(points[0].map(point => point.x)).toEqual([2020, 2021]);
  });

  it('keeps naming a category chart\'s points by their label', () => {
    const chart = lineChart(
      [{ label: 'S', data: [5, 7] }],
      { scales: { x: {} } },
      ['Jan', 'Feb'],
    );

    const points = layersOf(chart)[0].data as LinePoint[][];

    expect(points[0].map(point => point.x)).toEqual(['Jan', 'Feb']);
  });

  it('carries a date format when the continuous x scale plots instants', () => {
    const chart = lineChart(
      [{ label: 'S', data: [{ x: 1704067200000, y: 5 }, { x: 1704153600000, y: 7 }] }],
      { scales: { x: { type: 'time' } } },
    );

    const layer = layersOf(chart)[0];

    expect((layer.data as LinePoint[][])[0].map(point => point.x))
      .toEqual([1704067200000, 1704153600000]);
    expect(layer.axes?.x?.format).toEqual({ type: 'date' });
  });

  it('reads a stepped series on a linear scale the same way', () => {
    const chart = lineChart(
      [{ label: 'S', data: [{ x: 10, y: 1 }, { x: 20, y: 2 }], stepped: 'after' }],
      { scales: { x: { type: 'linear' } } },
    );

    const points = layersOf(chart)[0].data as LinePoint[][];

    expect(points[0].map(point => point.x)).toEqual([10, 20]);
  });

  it('leaves a horizontal line chart naming its categories', () => {
    // `indexAxis: 'y'` puts the categories on y, so a point's `x` is the
    // measurement, not a position to announce.
    const chart = lineChart(
      [{ label: 'S', data: [5, 7] }],
      { indexAxis: 'y', scales: { x: { type: 'linear' } } },
      ['Jan', 'Feb'],
    );

    const points = layersOf(chart)[0].data as LinePoint[][];

    expect(points[0].map(point => point.x)).toEqual(['Jan', 'Feb']);
  });
});
