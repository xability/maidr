import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Build a minimal line chart for the extractor to read.
 * @param labels The category labels
 * @param datasets The datasets the chart carries
 * @param options Chart options, for `showLine` and the scales
 * @returns A chart object shaped the way the extractor expects
 */
function lineChart(
  labels: (string | number)[],
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { labels, datasets };
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

describe('chart.js dot plot extraction', () => {
  it('reads a line chart drawn without its line as a dot plot', () => {
    const chart = lineChart(
      ['Chrome', 'Safari', 'Edge'],
      [{ label: 'Share', data: [64, 19, 5], showLine: false }],
    );

    const layers = layersOf(chart);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.DOT);
    // A value per category, the shape `BarTrace` reads — not the nested rows
    // the line path emits.
    expect(layers[0].data as BarPoint[]).toEqual([
      { x: 'Chrome', y: 64 },
      { x: 'Safari', y: 19 },
      { x: 'Edge', y: 5 },
    ]);
  });

  it('reads the chart-wide default when the dataset does not say', () => {
    const chart = lineChart(
      ['A', 'B'],
      [{ data: [1, 2] }],
      { showLine: false },
    );

    expect(layersOf(chart)[0].type).toBe(TraceType.DOT);
  });

  it('lets a dataset switch its line back on', () => {
    // A dataset's own setting wins over the chart's, the way `stepped` does,
    // and one joined series means the chart is not a dot plot.
    const chart = lineChart(
      ['A', 'B'],
      [{ data: [1, 2], showLine: true }, { data: [3, 4] }],
      { showLine: false },
    );

    expect(layersOf(chart)[0].type).toBe(TraceType.LINE);
  });

  it('leaves an ordinary line chart a line', () => {
    const chart = lineChart(['A', 'B'], [{ data: [1, 2] }]);

    expect(layersOf(chart)[0].type).toBe(TraceType.LINE);
  });

  it('does not read unjoined points on a continuum as a dot plot', () => {
    // Points with the line switched off along a linear axis is a scatter
    // drawn by the line controller: two measured coordinates, not a value per
    // named category.
    const chart = lineChart(
      [],
      [{ data: [{ x: 1, y: 2 }, { x: 3, y: 4 }], showLine: false }],
      { scales: { x: { type: 'linear' } } },
    );

    expect(layersOf(chart)[0].type).not.toBe(TraceType.DOT);
  });

  it('keeps a horizontal dot plot horizontal', () => {
    const chart = lineChart(
      ['Chrome', 'Safari'],
      [{ data: [64, 19], showLine: false }],
      { indexAxis: 'y' },
    );

    const layer = layersOf(chart)[0];

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 64, y: 'Chrome' },
      { x: 19, y: 'Safari' },
    ]);
  });

  it('gives each series its own layer', () => {
    const chart = lineChart(
      ['Chrome', 'Safari'],
      [
        { label: '2020', data: [60, 25], showLine: false },
        { label: '2024', data: [64, 19], showLine: false },
      ],
    );

    const layers = layersOf(chart);

    expect(layers.map(layer => layer.type)).toEqual([TraceType.DOT, TraceType.DOT]);
    expect(layers.map(layer => layer.title)).toEqual(['2020', '2024']);
  });

  it('routes each series highlight to its own dataset', () => {
    const chart = lineChart(
      ['Chrome', 'Safari'],
      [
        { label: '2020', data: [60, 25], showLine: false },
        { label: '2024', data: [64, 19], showLine: false },
      ],
    );
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '1', 0, 1))
      .toEqual([{ datasetIndex: 1, index: 1 }]);
  });

  it('keeps a highlight aligned across a gap', () => {
    const chart = lineChart(
      ['A', 'B', 'C'],
      [{ data: [1, null, 3], showLine: false }],
    );
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    // The gap is skipped in the payload, so MAIDR's second column is the
    // chart's third element.
    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 0, 1))
      .toEqual([{ datasetIndex: 0, index: 2 }]);
  });
});
