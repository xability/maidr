import type { ChartJsChart, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { MaidrLayer, PercentileBandPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * A minimal line chart, as the extractor reads one.
 * @param datasets The datasets the chart carries
 * @param labels The category labels
 * @param options Chart options, for the scales
 * @returns A chart object shaped the way the extractor expects
 */
function lineChart(
  datasets: ChartJsDataset[],
  labels: (string | number)[] = ['a', 'b', 'c'],
  options: ChartJsOptions = {},
): ChartJsChart {
  return {
    canvas: { id: 'fan' } as unknown as HTMLCanvasElement,
    data: { labels, datasets },
    options,
    config: { type: 'line' },
    getDatasetMeta: () => ({ data: [], type: 'line' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

const XS = [0, 1, 2];
const BANDS = [
  { series: 'p95', lower: 0.05, upper: 0.95 },
  { series: 'p75', lower: 0.25, upper: 0.75 },
];

/** A fan whose bands are each a line filled to the one before it. */
function fan(medianBlock: unknown = { type: TraceType.PERCENTILE_BAND, bands: BANDS }): ChartJsDataset[] {
  return [
    { label: 'p5', data: XS.map(x => x - 2), fill: false },
    { label: 'p95', data: XS.map(x => x + 2), fill: '-1' },
    { label: 'p25', data: XS.map(x => x - 1), fill: false },
    { label: 'p75', data: XS.map(x => x + 1), fill: '-1' },
    { label: 'median', data: XS, maidr: medianBlock as ChartJsDataset['maidr'] },
  ];
}

function extract(chart: ChartJsChart): { layers: MaidrLayer[]; indices: ReadonlyMap<string, number[]> } {
  const { maidr, layerDatasetIndices } = extractChartData(chart);
  return { layers: maidr.subplots[0][0].layers, indices: layerDatasetIndices };
}

describe('chart.js percentile band declaration', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads a median and the filled line pairs it names as one fan chart', () => {
    const { layers } = extract(lineChart(fan()));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PERCENTILE_BAND);
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
    expect(warn).not.toHaveBeenCalled();
  });

  it('outlines each quantile as the point its own dataset draws there', () => {
    const chart = lineChart(fan());
    const { layers, indices } = extract(chart);
    const maps = computeTargetMaps(chart, layers, indices);

    const at = [0, 1, 2, 3, 4].map(row =>
      resolveActiveTargets(layers, maps, indices, layers[0].id, row, 2));

    // Lowest level first: p5, p25, the median, p75, p95.
    expect(at).toEqual([
      [{ datasetIndex: 0, index: 2 }],
      [{ datasetIndex: 2, index: 2 }],
      [{ datasetIndex: 4, index: 2 }],
      [{ datasetIndex: 3, index: 2 }],
      [{ datasetIndex: 1, index: 2 }],
    ]);
  });

  it('reads which edge is which from the values, whichever one fills', () => {
    const datasets = fan();
    // The high edge filled down to the low one by absolute index this time.
    datasets[0] = { label: 'p95', data: XS.map(x => x + 2), fill: 1 };
    datasets[1] = { label: 'p5', data: XS.map(x => x - 2), fill: false };

    const { layers } = extract(lineChart(datasets));
    const quantiles = (layers[0].data as PercentileBandPoint[])[0].quantiles;

    expect(quantiles.find(q => q.level === 0.05)?.value).toBe(-2);
    expect(quantiles.find(q => q.level === 0.95)?.value).toBe(2);
  });

  it('matches a band drawn as points to the median by x, leaving a gap where it draws none', () => {
    const chart = lineChart([
      { label: 'p5', data: [1, 2].map(x => ({ x, y: x - 2 })), fill: false },
      { label: 'p95', data: [1, 2].map(x => ({ x, y: x + 2 })), fill: '-1' },
      {
        label: 'median',
        data: XS.map(x => ({ x, y: x })),
        maidr: { type: TraceType.PERCENTILE_BAND, bands: [BANDS[0]] },
      },
    ], [], { scales: { x: { type: 'linear' } } });
    const { layers, indices } = extract(chart);
    const maps = computeTargetMaps(chart, layers, indices);

    expect((layers[0].data as PercentileBandPoint[])[0]).toEqual({
      x: 0,
      quantiles: [{ level: 0.05, value: null }, { level: 0.5, value: 0 }, { level: 0.95, value: null }],
    });
    expect(resolveActiveTargets(layers, maps, indices, layers[0].id, 0, 0)).toEqual([]);
    expect(resolveActiveTargets(layers, maps, indices, layers[0].id, 0, 1))
      .toEqual([{ datasetIndex: 0, index: 0 }]);
  });

  it('keeps the datasets it does not absorb as their own layers', () => {
    const { layers } = extract(lineChart([...fan(), { label: 'history', data: [5, 5, 5] }]));

    expect(layers.map(layer => layer.type)).toEqual([TraceType.PERCENTILE_BAND, TraceType.LINE]);
  });

  it('refuses a band that fills to no other dataset, and keeps the rest', () => {
    const datasets = fan();
    datasets[1] = { ...datasets[1], fill: 'origin' };

    const { layers } = extract(lineChart(datasets));
    const band = layers.find(layer => layer.type === TraceType.PERCENTILE_BAND);

    expect((band?.data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.25, 0.5, 0.75]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names dataset "p95" as a band, which fills to no other dataset'));
  });

  it('refuses a pair whose edges cross', () => {
    const datasets = fan();
    datasets[1] = { label: 'p95', data: [3, -3, 4], fill: '-1' };

    extract(lineChart(datasets));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('whose two edges cross'));
  });

  it('reports a band naming no dataset', () => {
    extract(lineChart(fan({ type: TraceType.PERCENTILE_BAND, bands: [{ series: 'p99', lower: 0.01, upper: 0.99 }] })));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names dataset "p99" as a band, which this chart does not have'));
  });

  it('says so when the chart-wide trace type asks for a fan with nothing naming its bands', () => {
    const { maidr } = extractChartData(lineChart([{ label: 'median', data: XS }]), {
      traceType: TraceType.PERCENTILE_BAND,
    });

    expect(maidr.subplots[0][0].layers[0].type).toBe(TraceType.LINE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names no bands'));
  });
});
