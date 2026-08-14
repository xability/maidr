import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal line chart for the extractor to read.
 * @param datasets The datasets the chart carries
 * @param options Chart options, for scale stacking and reversal
 * @returns A chart object shaped the way the extractor expects
 */
function lineChart(
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { labels: ['Q1', 'Q2', 'Q3', 'Q4'], datasets };
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type: 'line' },
    getDatasetMeta: () => ({ data: [], type: 'line' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The layers a chart produces, in emission order. */
function layersOf(chart: ChartJsChart): MaidrLayer[] {
  return extractChartData(chart).maidr.subplots[0][0].layers;
}

const stackedScales: ChartJsOptions = { scales: { x: {}, y: { stacked: true } } };
const rankScales: ChartJsOptions = { scales: { x: {}, y: { reverse: true } } };

/** A filled band, which is what a stacked area chart is made of. */
function band(label: string, data: number[]): ChartJsDataset {
  return { label, data, fill: 'origin' };
}

describe('chart.js normalized area detection', () => {
  it('reads bands whose categories all total 100 as a normalized area', () => {
    const chart = lineChart([
      band('Mobile', [60, 55, 50, 45]),
      band('Desktop', [40, 45, 50, 55]),
    ], stackedScales);

    const layers = layersOf(chart);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.NORMALIZED_AREA);
    // The payload is a stacked area's; only the reading changes.
    expect(layers[0].data).toHaveLength(2);
  });

  it('reads unit shares the same way', () => {
    const chart = lineChart([
      band('Mobile', [0.6, 0.55, 0.5, 0.45]),
      band('Desktop', [0.4, 0.45, 0.5, 0.55]),
    ], stackedScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.NORMALIZED_AREA);
  });

  it('tolerates shares rounded for display', () => {
    // Percentages rounded to whole numbers routinely miss 100 by a fraction,
    // and a chart is not less normalized for having been rounded.
    const chart = lineChart([
      band('Mobile', [60, 55, 50, 45]),
      band('Desktop', [40, 45, 50, 55.2]),
    ], stackedScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.NORMALIZED_AREA);
  });

  it('leaves bands with varying totals a stacked area', () => {
    const chart = lineChart([
      band('Mobile', [60, 55, 50, 45]),
      band('Desktop', [40, 60, 80, 100]),
    ], stackedScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.STACKED_AREA);
  });

  it('leaves a single band a stacked area even at a constant 100', () => {
    // One band is not a share of anything.
    const chart = lineChart([band('Only', [100, 100, 100, 100])], stackedScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.STACKED_AREA);
  });

  it('leaves unstacked bands an area', () => {
    const chart = lineChart([
      band('Mobile', [60, 55, 50, 45]),
      band('Desktop', [40, 45, 50, 55]),
    ]);

    expect(layersOf(chart)[0].type).toBe(TraceType.AREA);
  });

  it('routes a normalized band row to its own dataset', () => {
    const chart = lineChart([
      band('Mobile', [60, 55, 50, 45]),
      band('Desktop', [40, 45, 50, 55]),
    ], stackedScales);
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 1, 3))
      .toEqual([{ datasetIndex: 1, index: 3 }]);
  });
});

describe('chart.js bump chart detection', () => {
  /** Three competitors, each period a permutation of 1..3. */
  const table: ChartJsDataset[] = [
    { label: 'Arsenal', data: [1, 2, 2, 1] },
    { label: 'Chelsea', data: [2, 1, 3, 3] },
    { label: 'Spurs', data: [3, 3, 1, 2] },
  ];

  it('reads a reversed rank axis with permuted values as a bump chart', () => {
    const layers = layersOf(lineChart(table, rankScales));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.BUMP);
    // A multi-line payload, unchanged: the ranks are the y values.
    const points = layers[0].data as LinePoint[][];
    expect(points).toHaveLength(3);
    expect(points[2][2]).toEqual({ x: 'Q3', y: 1, z: 'Spurs' });
  });

  it('leaves a reversed axis alone when the values are not ranks', () => {
    // A reversed axis is common enough on its own; the permutation test is
    // what makes the reading safe.
    const chart = lineChart([
      { label: 'A', data: [10, 20, 30, 40] },
      { label: 'B', data: [15, 25, 35, 45] },
    ], rankScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.LINE);
  });

  it('leaves ranks on an un-reversed axis a line', () => {
    // Without the reversal the chart draws rank 1 at the bottom, which is not
    // a bump chart however the numbers look.
    expect(layersOf(lineChart(table))[0].type).toBe(TraceType.LINE);
  });

  it('rejects a period where two competitors hold the same rank', () => {
    const tied: ChartJsDataset[] = [
      { label: 'A', data: [1, 1, 1, 1] },
      { label: 'B', data: [1, 2, 2, 2] },
      { label: 'C', data: [3, 3, 3, 3] },
    ];

    expect(layersOf(lineChart(tied, rankScales))[0].type).toBe(TraceType.LINE);
  });

  it('rejects ranks outside the field of competitors', () => {
    const chart = lineChart([
      { label: 'A', data: [1, 1, 1, 1] },
      { label: 'B', data: [5, 5, 5, 5] },
    ], rankScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.LINE);
  });

  it('leaves a single reversed series a line', () => {
    const chart = lineChart([{ label: 'Solo', data: [1, 1, 1, 1] }], rankScales);

    expect(layersOf(chart)[0].type).toBe(TraceType.LINE);
  });

  it('routes a competitor row to its own dataset', () => {
    const chart = lineChart(table, rankScales);
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 2, 1))
      .toEqual([{ datasetIndex: 2, index: 1 }]);
  });
});
