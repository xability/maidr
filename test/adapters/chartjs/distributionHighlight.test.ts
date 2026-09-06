/**
 * Box, violin and parallel coordinates had no branch in the highlight
 * resolver, so they fell through to the bar/line default -- which reads the
 * MAIDR row as a dataset and the column as an element index.
 *
 * Neither is what those traces mean by the pair. A box plot's row is the box
 * and its column the section along it, so moving across the sections of one
 * box outlined a different box each time; a parallel plot's row is the
 * observation and its column the axis, which is the transpose of the elements
 * that draw them. With several datasets in the chart both resolve to indices
 * that exist, so a mark the reader was never told about lights up -- the
 * failure the SANKEY and NETWORK branches decline in order to avoid (#814).
 */
import type { ChartJsActiveElement, ChartJsChart, ChartJsDataValue, ChartJsParsedValue } from '@adapters/chartjs/types';
import type { MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';

/** The parse the boxplot plugin leaves for one box. */
function boxParse(median: number): ChartJsParsedValue {
  return {
    x: 0,
    outliers: [],
    whiskerMin: median - 4,
    whiskerMax: median + 4,
    min: median - 4,
    max: median + 4,
    median,
    q1: median - 2,
    q3: median + 2,
    y: median,
  };
}

/** The same parse with the density curve a violin adds. */
function violinParse(median: number): ChartJsParsedValue {
  return {
    ...boxParse(median),
    coords: [
      { v: median - 4, estimate: 0.1 },
      { v: median, estimate: 0.4 },
      { v: median + 4, estimate: 0.1 },
    ],
  };
}

/** A distribution chart as the boxplot plugin leaves it after `update()`. */
function distributionChart(
  type: 'boxplot' | 'violin',
  parsed: ChartJsParsedValue[][],
  options: { labels?: string[]; indexAxis?: 'x' | 'y' } = {},
): ChartJsChart {
  const { labels = ['A', 'B', 'C'], indexAxis } = options;
  const datasets = parsed.map((one, index) => ({
    label: `S${index + 1}`,
    data: one.map(() => [] as unknown as ChartJsDataValue),
  }));

  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels, datasets },
    options: { plugins: {}, ...(indexAxis ? { indexAxis } : {}), scales: { x: {}, y: {} } },
    config: { type },
    getDatasetMeta: (index: number) => ({ data: [], type, _parsed: parsed[index] ?? [] }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** A parallel coordinates chart: one dataset per axis, one entry per observation. */
function pcpChart(axes: { label: string; data: ChartJsDataValue[]; hidden?: boolean }[]): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: {
      labels: ['car A', 'car B', 'car C'],
      datasets: axes.map(axis => ({ label: axis.label, data: axis.data })),
    },
    options: { plugins: {}, scales: { x: { type: 'pcp' } } },
    config: { type: 'pcp' },
    isDatasetVisible: (index: number) => axes[index]?.hidden !== true,
    getDatasetMeta: (index: number) => ({
      data: [],
      type: 'pcp',
      vScale: { id: axes[index]?.label },
    }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** Extract a chart and precompute everything the plugin's nav bridge uses. */
function setup(chart: ChartJsChart): {
  layers: MaidrLayer[];
  resolve: (layerId: string, row: number, col: number) => ChartJsActiveElement[];
} {
  const { maidr, layerDatasetIndices } = extractChartData(chart);
  const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
  const maps = computeTargetMaps(chart, layers, layerDatasetIndices);
  return {
    layers,
    resolve: (layerId, row, col) =>
      resolveActiveTargets(layers, maps, layerDatasetIndices, layerId, row, col),
  };
}

describe('chart.js distribution highlight resolution', () => {
  it('keeps one box outlined while the reader walks its sections', () => {
    const chart = distributionChart('boxplot', [[boxParse(10), boxParse(20), boxParse(30)]]);

    const { resolve } = setup(chart);

    // Row is the box, col the section along it -- which does not change the
    // mark, the way a candlestick's OHLC field does not.
    expect(resolve('0', 0, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
    expect(resolve('0', 0, 3)).toEqual([{ datasetIndex: 0, index: 0 }]);
    expect(resolve('0', 2, 1)).toEqual([{ datasetIndex: 0, index: 2 }]);
  });

  it('routes a grouped box plot\'s later boxes to the dataset that drew them', () => {
    const chart = distributionChart('boxplot', [
      [boxParse(10), boxParse(20)],
      [boxParse(30), boxParse(40)],
    ]);

    const { resolve } = setup(chart);

    expect(resolve('0', 0, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
    expect(resolve('0', 2, 0)).toEqual([{ datasetIndex: 1, index: 0 }]);
    expect(resolve('0', 3, 0)).toEqual([{ datasetIndex: 1, index: 1 }]);
  });

  it('un-reverses a horizontal box plot, whose model reads bottom-up', () => {
    const chart = distributionChart(
      'boxplot',
      [[boxParse(10), boxParse(20), boxParse(30)]],
      { indexAxis: 'y' },
    );

    const { resolve } = setup(chart);

    expect(resolve('0', 0, 0)).toEqual([{ datasetIndex: 0, index: 2 }]);
    expect(resolve('0', 2, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
  });

  it('outlines nothing for a box the chart never drew', () => {
    const chart = distributionChart('boxplot', [[boxParse(10)]]);

    const { resolve } = setup(chart);

    expect(resolve('0', 5, 0)).toEqual([]);
  });

  it('outlines the violin itself from both of a violin chart\'s layers', () => {
    const chart = distributionChart('violin', [[violinParse(10), violinParse(20)]]);

    const { layers, resolve } = setup(chart);

    expect(layers.map(layer => layer.type)).toEqual(['violin_box', 'violin_kde']);
    expect(resolve('0', 1, 0)).toEqual([{ datasetIndex: 0, index: 1 }]);
    // The kde layer's col walks the density curve, which is one violin's
    // shape and not a mark of its own.
    expect(resolve('1', 1, 2)).toEqual([{ datasetIndex: 0, index: 1 }]);
  });

  it('reads a parallel plot\'s row as the observation and its col as the axis', () => {
    const chart = pcpChart([
      { label: 'mpg', data: [21, 15, 33] },
      { label: 'hp', data: [110, 245, 65] },
      { label: 'wt', data: [2.6, 3.6, 1.8] },
    ]);

    const { resolve } = setup(chart);

    // Observation 2 on axis 0 is drawn by dataset 0's third element, not by
    // dataset 2's first.
    expect(resolve('0', 2, 0)).toEqual([{ datasetIndex: 0, index: 2 }]);
    expect(resolve('0', 0, 2)).toEqual([{ datasetIndex: 2, index: 0 }]);
  });

  it('skips a hidden axis when routing a parallel plot\'s columns', () => {
    const chart = pcpChart([
      { label: 'mpg', data: [21, 15, 33], hidden: true },
      { label: 'hp', data: [110, 245, 65] },
      { label: 'wt', data: [2.6, 3.6, 1.8] },
    ]);

    const { resolve } = setup(chart);

    expect(resolve('0', 0, 0)).toEqual([{ datasetIndex: 1, index: 0 }]);
    expect(resolve('0', 0, 1)).toEqual([{ datasetIndex: 2, index: 0 }]);
  });

  it('keeps a parallel plot\'s rows on the observations that read', () => {
    // An observation with no reading on any axis is dropped from the payload,
    // so the MAIDR row is not the dataset position.
    const chart = pcpChart([
      { label: 'mpg', data: [21, null, 33] },
      { label: 'hp', data: [110, null, 65] },
    ]);

    const { resolve } = setup(chart);

    expect(resolve('0', 1, 0)).toEqual([{ datasetIndex: 0, index: 2 }]);
  });
});
