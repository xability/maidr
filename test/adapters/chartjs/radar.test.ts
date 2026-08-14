import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal radar-family chart for the extractor to read.
 * @param type The Chart.js controller name — 'radar' or 'polarArea'
 * @param datasets The datasets the chart carries
 * @param options Chart options, for the radial scale and plugin overrides
 * @returns A chart object shaped the way the extractor expects
 */
function radarChart(
  type: string,
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { labels: ['Speed', 'Power', 'Range'], datasets };
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The layers a chart produces, in emission order. */
function layersOf(chart: ChartJsChart): MaidrLayer[] {
  return extractChartData(chart).maidr.subplots[0][0].layers;
}

/** Resolve a MAIDR navigation position the way the plugin's nav bridge does. */
function resolverFor(chart: ChartJsChart): (row: number, col: number) => unknown[] {
  const { maidr, layerDatasetIndices } = extractChartData(chart);
  const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
  const maps = computeTargetMaps(chart, layers, layerDatasetIndices);
  return (row, col) =>
    resolveActiveTargets(layers, maps, layerDatasetIndices, '0', row, col);
}

describe('chart.js radar and polar area extraction', () => {
  it('reads a radar as one layer with a row per series and a column per spoke', () => {
    const layers = layersOf(radarChart('radar', [
      { label: 'Model A', data: [10, 20, 30] },
      { label: 'Model B', data: [15, 5, 25] },
    ]));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.RADAR);
    const points = layers[0].data as LinePoint[][];
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual([
      { x: 'Speed', y: 10, z: 'Model A' },
      { x: 'Power', y: 20, z: 'Model A' },
      { x: 'Range', y: 30, z: 'Model A' },
    ]);
    expect(points[1][1]).toEqual({ x: 'Power', y: 5, z: 'Model B' });
  });

  it('reads a polar area as its own type on the same payload', () => {
    // POLAR_AREA and RADAR share a trace: the two differ in the mark, not in
    // what a reader navigates, so only the declared type changes.
    const layers = layersOf(radarChart('polarArea', [{ label: 'Share', data: [1, 2, 3] }]));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.POLAR_AREA);
    expect(layers[0].data).toHaveLength(1);
  });

  it('keeps a filled radar dataset a radar', () => {
    // A radar dataset is very commonly `fill: true`; routing it through the
    // line extractor would bucket it as an area band instead.
    expect(layersOf(radarChart('radar', [{ label: 'Model A', data: [1, 2, 3], fill: true }]))[0].type)
      .toBe(TraceType.RADAR);
  });

  it('names the positions rather than announcing absent x and y axes', () => {
    // A radar has no x or y scale, so the extractor's `'X'`/`'Y'` fallback
    // would name axes the chart does not have.
    const axes = layersOf(radarChart('radar', [{ data: [1, 2, 3] }]))[0].axes;

    expect(axes?.x?.label).toBe('Category');
    expect(axes?.y?.label).toBe('Value');
  });

  it('reads the value axis label off the radial scale', () => {
    const chart = radarChart('radar', [{ data: [1, 2, 3] }], {
      scales: { r: { title: { text: 'Score' } } },
    });

    expect(layersOf(chart)[0].axes?.y?.label).toBe('Score');
  });

  it('lets the plugin axes override the radial title', () => {
    const chart = radarChart('radar', [{ data: [1, 2, 3] }], {
      scales: { r: { title: { text: 'Score' } } },
    });

    const layers = extractChartData(chart, { axes: { x: 'Attribute', y: 'Rating' } })
      .maidr
      .subplots[0][0]
      .layers;

    expect(layers[0].axes?.x?.label).toBe('Attribute');
    expect(layers[0].axes?.y?.label).toBe('Rating');
  });

  it('skips gap markers rather than sonifying them as zeros', () => {
    const points = layersOf(radarChart('radar', [{ label: 'A', data: [10, null, 30] }]))[0]
      .data as LinePoint[][];

    expect(points[0]).toHaveLength(2);
    expect(points[0][1]).toEqual({ x: 'Range', y: 30, z: 'A' });
  });

  it('falls back to a positional series name when a dataset has no label', () => {
    const points = layersOf(radarChart('radar', [{ data: [1, 2, 3] }]))[0].data as LinePoint[][];

    expect(points[0][0].z).toBe('Series 1');
  });

  describe('highlighting', () => {
    it('routes each series row to its own dataset', () => {
      const chart = radarChart('radar', [
        { label: 'Model A', data: [10, 20, 30] },
        { label: 'Model B', data: [15, 5, 25] },
      ]);

      const resolve = resolverFor(chart);

      expect(resolve(1, 2)).toEqual([{ datasetIndex: 1, index: 2 }]);
    });

    it('maps a column back past a skipped gap', () => {
      const chart = radarChart('radar', [{ label: 'A', data: [10, null, 30] }]);

      const resolve = resolverFor(chart);

      // Column 1 is the second spoke that survived extraction, which Chart.js
      // still draws at element index 2.
      expect(resolve(0, 1)).toEqual([{ datasetIndex: 0, index: 2 }]);
    });

    it('highlights a polar area wedge by slice index', () => {
      const chart = radarChart('polarArea', [{ label: 'Share', data: [1, 2, 3] }]);

      const resolve = resolverFor(chart);

      expect(resolve(0, 2)).toEqual([{ datasetIndex: 0, index: 2 }]);
    });
  });
});
