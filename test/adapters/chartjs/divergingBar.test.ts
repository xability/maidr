import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal stacked bar chart for the extractor to read.
 * @param datasets The datasets the chart carries
 * @param options Chart options; defaults to the population-pyramid recipe
 * @returns A chart object shaped the way the extractor expects
 */
function barChart(
  datasets: ChartJsDataset[],
  options: ChartJsOptions = { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } } },
): ChartJsChart {
  const data: ChartJsData = { labels: ['0-14', '15-64', '65+'], datasets };
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type: 'bar' },
    getDatasetMeta: () => ({ data: [], type: 'bar' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The layers a chart produces, in emission order. */
function layersOf(chart: ChartJsChart): MaidrLayer[] {
  return extractChartData(chart).maidr.subplots[0][0].layers;
}

/** The pyramid's two sides: one series negated, one not. */
const men: ChartJsDataset = { label: 'Men', data: [-30, -50, -20] };
const women: ChartJsDataset = { label: 'Women', data: [28, 52, 26] };

describe('chart.js diverging bar detection', () => {
  it('reads a sign-split stacked chart as a diverging bar', () => {
    const layers = layersOf(barChart([men, women]));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.DIVERGING);
  });

  it('carries the sign through rather than normalising it', () => {
    // The sign is the side the bar points, and the trace reads it: pitching
    // the magnitude and announcing the side is the whole difference between
    // this and a stacked bar.
    const points = layersOf(barChart([men, women]))[0].data as SegmentedPoint[][];

    expect(points[0][1]).toEqual({ x: -50, y: '15-64', z: 'Men' });
    expect(points[1][1]).toEqual({ x: 52, y: '15-64', z: 'Women' });
  });

  it('leaves an all-positive stacked chart a stacked bar', () => {
    expect(layersOf(barChart([women, { label: 'Other', data: [1, 2, 3] }]))[0].type)
      .toBe(TraceType.STACKED);
  });

  it('leaves a series that crosses the baseline a stacked bar', () => {
    // A stacked chart that merely contains a negative value is not two sides
    // of anything, and naming a left and a right would invent them.
    const mixed: ChartJsDataset = { label: 'Net', data: [-5, 10, -2] };

    expect(layersOf(barChart([mixed, women]))[0].type).toBe(TraceType.STACKED);
  });

  it('leaves an unstacked sign split a dodged bar', () => {
    // Back to back is what stacking draws; side by side is a comparison of
    // two series that happen to be signed.
    const chart = barChart([men, women], { indexAxis: 'y' });

    expect(layersOf(chart)[0].type).toBe(TraceType.DODGED);
  });

  it('treats zero as belonging to neither side', () => {
    // A category a side does not reach is written as 0 on both wings.
    const chart = barChart([
      { label: 'Men', data: [-30, 0, -20] },
      { label: 'Women', data: [0, 52, 26] },
    ]);

    expect(layersOf(chart)[0].type).toBe(TraceType.DIVERGING);
  });

  it('routes highlighting by MAIDR row = dataset, col = category', () => {
    const chart = barChart([men, women]);
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 1, 2))
      .toEqual([{ datasetIndex: 1, index: 2 }]);
  });
});
