import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { MaidrLayer, SurvivalPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal line chart for the extractor to read.
 * @param datasets The datasets the chart carries
 * @param options Chart options, for the scales
 * @param labels The category labels, when the curve is drawn against them
 * @returns A chart object shaped the way the extractor expects
 */
function lineChart(
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
  labels: (string | number)[] = [],
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
function layersOf(chart: ChartJsChart, pluginOptions?: MaidrPluginOptions): MaidrLayer[] {
  return extractChartData(chart, pluginOptions).maidr.subplots[0][0].layers;
}

/** The declaration that makes a staircase a Kaplan-Meier curve. */
const declared: MaidrPluginOptions = { traceType: TraceType.SURVIVAL };

/** A curve plotted against elapsed time, as Chart.js draws one. */
const timeAxis: ChartJsOptions = { scales: { x: { type: 'linear' } } };

describe('chart.js survival extraction', () => {
  it('reads a declared stepped line as a survival curve', () => {
    const chart = lineChart([{
      label: 'Treatment',
      data: [{ x: 0, y: 1 }, { x: 6, y: 0.82 }, { x: 12, y: 0.61 }],
      stepped: 'after',
    }], timeAxis);

    const layers = layersOf(chart, declared);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.SURVIVAL);
    // 'after' jumps at the current x and holds the new value across.
    expect(layers[0].stepDirection).toBe('vh');
    expect(layers[0].data as SurvivalPoint[][]).toEqual([[
      { x: 0, y: 1, z: 'Treatment' },
      { x: 6, y: 0.82, z: 'Treatment' },
      { x: 12, y: 0.61, z: 'Treatment' },
    ]]);
  });

  it('stays a step chart when the page does not declare otherwise', () => {
    // Nothing in a Chart.js config tells a survival curve from any other
    // staircase, so the automatic reading is the one it can defend.
    const chart = lineChart([{ data: [1, 0.8, 0.6], stepped: 'after' }]);

    expect(layersOf(chart)[0].type).toBe(TraceType.STEP);
  });

  it('reads the censoring marks the page rides on its points', () => {
    // Chart.js ignores properties it does not know, so a censored time is
    // written on the datum itself and arrives intact.
    const chart = lineChart([{
      data: [
        { x: 0, y: 1 },
        { x: 4, y: 0.9, censored: true },
        { x: 9, y: 0.7 },
      ],
      stepped: 'after',
    }], timeAxis);

    const arms = layersOf(chart, declared)[0].data as SurvivalPoint[][];

    expect(arms[0].map(point => point.censored)).toEqual([undefined, true, undefined]);
  });

  it('reads a confidence band written on the points', () => {
    const chart = lineChart([{
      data: [{ x: 0, y: 1, yMin: 1, yMax: 1 }, { x: 6, y: 0.8, yMin: 0.7, yMax: 0.9 }],
      stepped: 'after',
    }], timeAxis);

    const arms = layersOf(chart, declared)[0].data as SurvivalPoint[][];

    expect(arms[0][1]).toEqual({ x: 6, y: 0.8, z: 'Arm 1', yMin: 0.7, yMax: 0.9 });
  });

  it('gathers every arm into one layer', () => {
    // The arms of a survival figure belong together whatever each dataset
    // declares — they are the comparison the chart is drawn to make.
    const chart = lineChart([
      { label: 'Treatment', data: [{ x: 0, y: 1 }, { x: 6, y: 0.9 }], stepped: 'after' },
      { label: 'Control', data: [{ x: 0, y: 1 }, { x: 6, y: 0.7 }] },
    ], timeAxis);

    const layers = layersOf(chart, declared);

    expect(layers).toHaveLength(1);
    expect((layers[0].data as SurvivalPoint[][])).toHaveLength(2);
  });

  it('reads a curve drawn against category labels', () => {
    const chart = lineChart(
      [{ label: 'Arm A', data: [1, 0.8], stepped: 'after' }],
      {},
      ['0', '6'],
    );

    const arms = layersOf(chart, declared)[0].data as SurvivalPoint[][];

    expect(arms[0].map(point => point.x)).toEqual(['0', '6']);
  });

  it('maps an arm and a time onto the point drawing it', () => {
    const chart = lineChart([
      { label: 'Treatment', data: [{ x: 0, y: 1 }, { x: 6, y: 0.9 }], stepped: 'after' },
      { label: 'Control', data: [{ x: 0, y: 1 }, { x: 6, y: 0.7 }], stepped: 'after' },
    ], timeAxis);
    const { maidr, layerDatasetIndices } = extractChartData(chart, declared);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    // One row per arm, one column per time along it.
    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 1, 1))
      .toEqual([{ datasetIndex: 1, index: 1 }]);
  });
});
