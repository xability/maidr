import type { ChartJsChart, ChartJsData, ChartJsOptions } from '@adapters/chartjs/types';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';

function createChart(type: string, data: ChartJsData, options?: ChartJsOptions): ChartJsChart {
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options: options ?? {},
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** Extract a chart and precompute everything the plugin's nav bridge uses. */
function setup(chart: ChartJsChart): {
  layers: ReturnType<typeof extractChartData>['maidr']['subplots'][number][number]['layers'];
  resolve: (layerId: string, row: number, col: number) => { datasetIndex: number; index: number }[];
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

const stackedScales: ChartJsOptions = {
  scales: {
    x: {},
    y: { stack: 'demo' },
    y2: { stack: 'demo' },
  },
};

describe('chart.js highlight target resolution', () => {
  describe('single-panel charts (legacy behavior preserved)', () => {
    it('maps bar navigation to dataset 0, skipping gap markers', () => {
      const chart = createChart('bar', {
        labels: ['A', 'B', 'C'],
        datasets: [{ label: 'Sales', data: [1, null, 3] }],
      });

      const { resolve } = setup(chart);

      // col 1 is the second FINITE point, i.e. original element index 2.
      expect(resolve('0', 0, 1)).toEqual([{ datasetIndex: 0, index: 2 }]);
    });

    it('maps multi-line rows to their dataset indices', () => {
      const chart = createChart('line', {
        labels: ['A', 'B'],
        datasets: [
          { label: 'L1', data: [1, 2] },
          { label: 'L2', data: [3, 4] },
        ],
      });

      const { resolve } = setup(chart);

      expect(resolve('0', 1, 0)).toEqual([{ datasetIndex: 1, index: 0 }]);
    });

    it('routes scatter layers to their own dataset (formerly parseInt(layer.id))', () => {
      const chart = createChart('scatter', {
        datasets: [
          { label: 'S1', data: [{ x: 1, y: 1 }] },
          { label: 'S2', data: [{ x: 2, y: 2 }, { x: 2, y: 3 }] },
        ],
      });

      const { resolve } = setup(chart);

      // Layer '1' is dataset 1; its col 0 X-bucket holds both x=2 points.
      expect(resolve('1', 0, 0)).toEqual([
        { datasetIndex: 1, index: 0 },
        { datasetIndex: 1, index: 1 },
      ]);
    });

    it('routes segmented bars by MAIDR row = dataset index', () => {
      const chart = createChart('bar', {
        labels: ['A', 'B'],
        datasets: [
          { label: 'G1', data: [1, 2] },
          { label: 'G2', data: [3, 4] },
        ],
      });

      const { resolve } = setup(chart);

      expect(resolve('0', 1, 1)).toEqual([{ datasetIndex: 1, index: 1 }]);
    });
  });

  describe('axis-stacked panel charts', () => {
    it('routes each panel\'s line layer to the panel\'s original dataset', () => {
      const chart = createChart('line', {
        labels: ['A', 'B', 'C'],
        datasets: [
          { label: 'Price', data: [10, 20, 30] },
          { label: 'Volume', data: [1, null, 3], yAxisID: 'y2' },
        ],
      }, stackedScales);

      const { resolve } = setup(chart);

      // Bottom-first rows: panel 0 is the y2 (Volume) band = Chart.js
      // dataset 1; panel 1 is the y (Price) band = dataset 0.
      expect(resolve('0_0', 0, 0)).toEqual([{ datasetIndex: 1, index: 0 }]);
      // Gap skipping still maps through to the original element index.
      expect(resolve('0_0', 0, 1)).toEqual([{ datasetIndex: 1, index: 2 }]);
      // The Price panel stays on dataset 0.
      expect(resolve('1_0', 0, 2)).toEqual([{ datasetIndex: 0, index: 2 }]);
    });

    it('routes scatter panel layers to the original dataset, not the panel-local one', () => {
      const chart = createChart('scatter', {
        datasets: [
          { label: 'S1', data: [{ x: 1, y: 1 }] },
          { label: 'S2', data: [{ x: 2, y: 2 }], yAxisID: 'y2' },
          { label: 'S3', data: [{ x: 3, y: 3 }, { x: 3, y: 4 }], yAxisID: 'y2' },
        ],
      }, stackedScales);

      const { resolve } = setup(chart);

      // Bottom-first rows: panel 0 is the y2 band (S2, S3), panel 1 is y (S1).
      expect(resolve('0_0', 0, 0)).toEqual([{ datasetIndex: 1, index: 0 }]);
      expect(resolve('1_0', 0, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
      // Second layer of the y2 panel = dataset 2; its bucket has two shared-X points.
      expect(resolve('0_1', 0, 0)).toEqual([
        { datasetIndex: 2, index: 0 },
        { datasetIndex: 2, index: 1 },
      ]);
    });

    it('routes segmented panel rows through the partition to original datasets', () => {
      const chart = createChart('bar', {
        labels: ['Q1', 'Q2'],
        datasets: [
          { label: 'East', data: [1, 2] },
          { label: 'West', data: [3, 4] },
          { label: 'North', data: [5, 6], yAxisID: 'y2' },
          { label: 'South', data: [7, 8], yAxisID: 'y2' },
        ],
      }, stackedScales);

      const { layers, resolve } = setup(chart);

      const panelTwoLayer = layers.find(layer => layer.id === '1_0');
      expect(panelTwoLayer).toBeDefined();
      // Bottom-first rows: panel 0 is the y2 band (North/South). Its MAIDR
      // row 1 = its second dataset = original dataset 3 (South).
      expect(resolve('0_0', 1, 1)).toEqual([{ datasetIndex: 3, index: 1 }]);
      // The y panel (East/West) row 0 = original dataset 0 (East).
      expect(resolve('1_0', 0, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
    });

    it('returns no targets for unknown layer ids', () => {
      const chart = createChart('line', {
        labels: ['A'],
        datasets: [
          { label: 'P', data: [1] },
          { label: 'V', data: [2], yAxisID: 'y2' },
        ],
      }, stackedScales);

      const { resolve } = setup(chart);

      expect(resolve('9_9', 0, 0)).toEqual([]);
    });
  });
});
