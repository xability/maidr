import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { DumbbellData, MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Build a minimal floating-bar chart for the extractor to read.
 * @param labels The category labels — the dumbbell's rows
 * @param datasets The datasets the chart carries
 * @param options Chart options, for `indexAxis` and the scales
 * @returns A chart object shaped the way the extractor expects
 */
function barChart(
  labels: (string | number)[],
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { labels, datasets };
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
function layersOf(chart: ChartJsChart, pluginOptions?: MaidrPluginOptions): MaidrLayer[] {
  return extractChartData(chart, pluginOptions).maidr.subplots[0][0].layers;
}

/** A dumbbell drawn the ordinary way: categories down the page. */
const horizontal: ChartJsOptions = { indexAxis: 'y' };

/** The declaration that makes a floating bar chart a paired comparison. */
const declared: MaidrPluginOptions = { traceType: TraceType.DUMBBELL };

describe('chart.js dumbbell extraction', () => {
  it('reads a declared floating bar chart as a dumbbell', () => {
    const chart = barChart(
      ['Japan', 'Spain', 'Chad'],
      [{ data: [[79, 84], [77, 83], [50, 55]] }],
      horizontal,
    );

    const layers = layersOf(chart, declared);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.DUMBBELL);
    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
    // A single object carrying the rows, not a bare array: the names of the
    // two ends belong to the chart rather than to any one row.
    expect((layers[0].data as DumbbellData).points).toEqual([
      { x: 'Japan', start: 79, end: 84 },
      { x: 'Spain', start: 77, end: 83 },
      { x: 'Chad', start: 50, end: 55 },
    ]);
  });

  it('stays a gantt when the page does not declare otherwise', () => {
    // One interval per category on a horizontal axis is the figure a
    // one-lane-per-task schedule draws, down to the datum. Reading it as a
    // dumbbell unasked would rename every gantt in the wild.
    const chart = barChart(['Japan', 'Spain'], [{ data: [[79, 84], [77, 83]] }], horizontal);

    expect(layersOf(chart)[0].type).toBe(TraceType.GANTT);
  });

  it('names the two ends when the page says what they are', () => {
    const chart = barChart(['Japan'], [{ data: [[79, 84]] }], horizontal);

    const named = { ...declared, startLabel: '1990', endLabel: '2020' };
    const data = layersOf(chart, named)[0].data as DumbbellData;

    expect(data.startLabel).toBe('1990');
    expect(data.endLabel).toBe('2020');
  });

  it('leaves the ends unnamed rather than guessing', () => {
    const chart = barChart(['Japan'], [{ data: [[79, 84]] }], horizontal);

    const data = layersOf(chart, declared)[0].data as DumbbellData;

    expect(data.startLabel).toBeUndefined();
    expect(data.endLabel).toBeUndefined();
  });

  it('skips a row with nothing to compare', () => {
    // Unlike a gantt lane, an unpaired row has no comparison to announce, and
    // the trace's grid is a plain rows-by-ends rectangle.
    const chart = barChart(
      ['Japan', 'Unknown', 'Chad'],
      [{ data: [[79, 84], null, [50, 55]] }],
      horizontal,
    );

    const data = layersOf(chart, declared)[0].data as DumbbellData;

    expect(data.points.map(point => point.x)).toEqual(['Japan', 'Chad']);
  });

  it('highlights the connector whichever end the cursor is on', () => {
    const chart = barChart(
      ['Japan', 'Spain'],
      [{ data: [[79, 84], [77, 83]] }],
      horizontal,
    );
    const { maidr, layerDatasetIndices } = extractChartData(chart, declared);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);
    const resolve = (row: number, col: number): unknown[] =>
      resolveActiveTargets(layers, maps, layerDatasetIndices, '0', row, col);

    // MAIDR row = which end of the pair; both are drawn by the one bar that
    // connects them, so the row does not move the highlight.
    expect(resolve(0, 1)).toEqual([{ datasetIndex: 0, index: 1 }]);
    expect(resolve(1, 1)).toEqual([{ datasetIndex: 0, index: 1 }]);
  });

  it('keeps a highlight aligned across a skipped row', () => {
    const chart = barChart(
      ['Japan', 'Unknown', 'Chad'],
      [{ data: [[79, 84], null, [50, 55]] }],
      horizontal,
    );
    const { maidr, layerDatasetIndices } = extractChartData(chart, declared);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 0, 1))
      .toEqual([{ datasetIndex: 0, index: 2 }]);
  });
});
