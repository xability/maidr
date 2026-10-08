import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { MaidrLayer, PrCurvePoint } from '@type/grammar';
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
  options: ChartJsOptions = { scales: { x: { type: 'linear' } } },
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

/** One classifier's curve, its rows carrying the threshold they were scored at. */
const LOGISTIC: ChartJsDataset = {
  label: 'Logistic',
  data: [
    { x: 0, y: 1 },
    { x: 0.6, y: 0.8, threshold: 0.5 },
    { x: 1, y: 0.3, threshold: 0 },
  ],
};

describe('chart.js precision-recall declaration', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads a dataset declaring pr_curve as a precision-recall curve', () => {
    const chart = lineChart([{ ...LOGISTIC, maidr: { type: TraceType.PR_CURVE } }]);

    const layers = layersOf(chart);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PR_CURVE);
    expect(layers[0].data as PrCurvePoint[][]).toEqual([[
      { x: 0, y: 1, z: 'Logistic' },
      { x: 0.6, y: 0.8, z: 'Logistic', threshold: 0.5 },
      { x: 1, y: 0.3, z: 'Logistic', threshold: 0 },
    ]]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays a line when nothing declares it', () => {
    expect(layersOf(lineChart([LOGISTIC]))[0].type).toBe(TraceType.LINE);
  });

  it('reaches the same reading through the chart-wide trace type', () => {
    const layers = layersOf(lineChart([LOGISTIC]), { traceType: TraceType.PR_CURVE });

    expect(layers[0].type).toBe(TraceType.PR_CURVE);
    expect((layers[0].data as PrCurvePoint[][])[0][1].threshold).toBe(0.5);
  });

  it('gives each curve the prevalence and average precision of its own block only', () => {
    const chart = lineChart([
      { ...LOGISTIC, maidr: { type: TraceType.PR_CURVE, prevalence: 0.3, ap: 0.71, title: 'Spam filter' } },
      { label: 'Forest', data: [{ x: 0, y: 1 }, { x: 1, y: 0.3 }] },
    ]);

    const [layer] = layersOf(chart);
    const data = layer.data as PrCurvePoint[][];

    expect(layer.title).toBe('Spam filter');
    expect(data[0][0]).toEqual({ x: 0, y: 1, z: 'Logistic', prevalence: 0.3, ap: 0.71 });
    // The second classifier said nothing about the data it was scored on.
    expect(data[1][0]).toEqual({ x: 0, y: 1, z: 'Forest' });
  });

  it('reads the threshold from the field the block names, and says so when no row has it', () => {
    const chart = lineChart([
      { label: 'A', data: [{ x: 0.5, y: 0.9, cut: 0.7 }], maidr: { type: TraceType.PR_CURVE, threshold: 'cut' } },
      { label: 'B', data: [{ x: 0.5, y: 0.9 }], maidr: { type: TraceType.PR_CURVE, threshold: 'cutof' } },
    ]);

    const data = layersOf(chart)[0].data as PrCurvePoint[][];

    expect(data[0][0].threshold).toBe(0.7);
    expect(data[1][0].threshold).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "cutof" for threshold'));
  });

  it('refuses a prevalence written as a percentage rather than rescaling it', () => {
    const chart = lineChart([{ ...LOGISTIC, maidr: { type: TraceType.PR_CURVE, prevalence: 30 } }]);

    const data = layersOf(chart)[0].data as PrCurvePoint[][];

    expect(data[0][0].prevalence).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expected a number from 0 to 1'));
  });

  it('reads recall from the category labels when the curve is drawn against them', () => {
    const chart = lineChart(
      [{ label: 'C', data: [1, 0.8, null, 0.3], maidr: { type: TraceType.PR_CURVE } }],
      {},
      ['0', '0.5', '0.75', 'all'],
    );

    const data = layersOf(chart)[0].data as PrCurvePoint[][];

    // A gap and a label naming no recall are both skipped.
    expect(data[0].map(point => point.x)).toEqual([0, 0.5]);
  });

  it('outlines the element each announced point was drawn from, skipping what was not read', () => {
    const chart = lineChart(
      [
        { label: 'C', data: [1, 0.8, null, 0.3, 0.2], maidr: { type: TraceType.PR_CURVE } },
        { label: 'D', data: [0.9, 0.7, 0.6, 0.5, 0.4] },
      ],
      {},
      ['0', '0.5', '0.75', 'all', '1'],
    );
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    // Row 0 read datum 0, 1 and 4; its third announced point is element 4.
    const third = resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 0, 2);
    const secondCurve = resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 1, 2);

    expect(third).toEqual([{ datasetIndex: 0, index: 4 }]);
    expect(secondCurve).toEqual([{ datasetIndex: 1, index: 2 }]);
  });

  it('refuses a pr_curve block on a scatter dataset', () => {
    const chart = {
      ...lineChart([{ ...LOGISTIC, maidr: { type: TraceType.PR_CURVE } }]),
      config: { type: 'scatter' },
    };

    const layers = layersOf(chart);

    expect(layers[0].type).toBe(TraceType.SCATTER);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a line dataset'));
  });
});
