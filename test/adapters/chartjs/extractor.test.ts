import type { ChartJsChart, ChartJsData, ChartJsOptions, ChartJsRuntimeScale } from '@adapters/chartjs/types';
import { extractChartData, extractMaidrData } from '@adapters/chartjs/extractor';
import { TraceType } from '@type/grammar';

interface MockChartConfig {
  type: string;
  data: ChartJsData;
  options?: ChartJsOptions;
  /** Runtime (laid-out) scales; omitted to simulate pre-layout charts. */
  scales?: Record<string, ChartJsRuntimeScale>;
}

function createChart(config: MockChartConfig): ChartJsChart {
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data: config.data,
    options: config.options ?? {},
    config: { type: config.type },
    ...(config.scales ? { scales: config.scales } : {}),
    getDatasetMeta: () => ({ data: [], type: config.type }),
    setActiveElements: () => {},
    update: () => {},
  };
}

describe('chart.js extractor', () => {
  describe('single-panel behavior (unchanged)', () => {
    it('emits a 1x1 subplot grid for a plain bar chart', () => {
      const chart = createChart({
        type: 'bar',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{ label: 'Sales', data: [1, 2, 3] }],
        },
      });

      const { maidr, layerDatasetIndices } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(1);
      expect(maidr.subplots[0]).toHaveLength(1);
      const layer = maidr.subplots[0][0].layers[0];
      expect(layer.id).toBe('0');
      expect(layer.type).toBe(TraceType.BAR);
      expect(layerDatasetIndices.get('0')).toEqual([0]);
    });

    it('keeps a classic dual-axis chart (no stack option) as ONE subplot', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['Jan', 'Feb'],
          datasets: [
            { label: 'Revenue', data: [10, 20] },
            { label: 'Growth', data: [1, 2], yAxisID: 'y2' },
          ],
        },
        options: {
          scales: {
            x: {},
            y: { title: { text: 'USD' } },
            y2: { title: { text: 'Percent' } },
          },
        },
      });

      const { maidr } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(1);
      expect(maidr.subplots[0]).toHaveLength(1);
      expect(maidr.subplots[0][0].layers).toHaveLength(1);
      expect(maidr.subplots[0][0].layers[0].id).toBe('0');
    });

    it('keeps overlapping same-kind runtime bands (dual axis) as ONE subplot', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['Jan', 'Feb'],
          datasets: [
            { label: 'Revenue', data: [10, 20] },
            { label: 'Growth', data: [1, 2], yAxisID: 'y2' },
          ],
        },
        options: { scales: { x: {}, y: {}, y2: {} } },
        scales: {
          x: { axis: 'x', top: 400, bottom: 430, left: 40, right: 600 },
          y: { axis: 'y', top: 0, bottom: 400, left: 0, right: 40 },
          y2: { axis: 'y', top: 0, bottom: 400, left: 600, right: 640 },
        },
      });

      const { maidr } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(1);
      expect(maidr.subplots[0]).toHaveLength(1);
    });

    it('falls back to a single subplot when all datasets share one stacked scale', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['Jan', 'Feb'],
          datasets: [{ label: 'Only', data: [1, 2] }],
        },
        options: {
          scales: {
            x: {},
            y: { stack: 'demo' },
            y2: { stack: 'demo' },
          },
        },
      });

      const { maidr } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(1);
      expect(maidr.subplots[0]).toHaveLength(1);
      expect(maidr.subplots[0][0].layers[0].id).toBe('0');
    });
  });

  describe('axis-stacked panels', () => {
    const stackedLineChart = (scales?: Record<string, ChartJsRuntimeScale>): ChartJsChart =>
      createChart({
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar'],
          datasets: [
            { label: 'Price', data: [10, 20, 30] },
            { label: 'Volume', data: [1, 2, 3], yAxisID: 'y2' },
          ],
        },
        options: {
          scales: {
            x: { title: { text: 'Month' } },
            y: { stack: 'demo', stackWeight: 2, title: { text: 'Price ($)' } },
            y2: { stack: 'demo', stackWeight: 1, title: { text: 'Volume' } },
          },
        },
        scales,
      });

    it('splits y-stacked scales into an N rows x 1 col subplot grid', () => {
      const { maidr } = extractChartData(stackedLineChart());

      expect(maidr.subplots).toHaveLength(2);
      expect(maidr.subplots[0]).toHaveLength(1);
      expect(maidr.subplots[1]).toHaveLength(1);
    });

    it('gives every layer a figure-unique id and maps it to its datasets', () => {
      const { maidr, layerDatasetIndices } = extractChartData(stackedLineChart());

      const first = maidr.subplots[0][0].layers[0];
      const second = maidr.subplots[1][0].layers[0];
      expect(first.id).toBe('0_0');
      expect(second.id).toBe('1_0');
      expect(layerDatasetIndices.get('0_0')).toEqual([0]);
      expect(layerDatasetIndices.get('1_0')).toEqual([1]);
    });

    it('labels each panel with its OWN scale title and shares the index axis', () => {
      const { maidr } = extractChartData(stackedLineChart());

      const first = maidr.subplots[0][0].layers[0];
      const second = maidr.subplots[1][0].layers[0];
      expect(first.axes?.y).toEqual({ label: 'Price ($)' });
      expect(second.axes?.y).toEqual({ label: 'Volume' });
      expect(first.axes?.x).toEqual({ label: 'Month' });
      expect(second.axes?.x).toEqual({ label: 'Month' });
      // Panel display name (first layer title) comes from the scale title.
      expect(first.title).toBe('Price ($)');
      expect(second.title).toBe('Volume');
    });

    it('orders panels by runtime band position (top-first), not declaration', () => {
      // y2's band is laid out ABOVE y's, so y2 must come first.
      const { maidr } = extractChartData(stackedLineChart({
        x: { axis: 'x', top: 400, bottom: 430, left: 40, right: 600 },
        y: { axis: 'y', top: 210, bottom: 400, left: 0, right: 40 },
        y2: { axis: 'y', top: 0, bottom: 200, left: 0, right: 40 },
      }));

      expect(maidr.subplots[0][0].layers[0].title).toBe('Volume');
      expect(maidr.subplots[1][0].layers[0].title).toBe('Price ($)');
      // Ids stay contiguous in emission (visual) order.
      expect(maidr.subplots[0][0].layers[0].id).toBe('0_0');
      expect(maidr.subplots[1][0].layers[0].id).toBe('1_0');
    });

    it('detects stacked layout from disjoint runtime bands even without the stack option', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['Jan', 'Feb'],
          datasets: [
            { label: 'Price', data: [10, 20] },
            { label: 'Volume', data: [1, 2], yAxisID: 'y2' },
          ],
        },
        options: { scales: { x: {}, y: {}, y2: {} } },
        scales: {
          x: { axis: 'x', top: 400, bottom: 430, left: 40, right: 600 },
          y: { axis: 'y', top: 0, bottom: 200, left: 0, right: 40 },
          y2: { axis: 'y', top: 210, bottom: 400, left: 0, right: 40 },
        },
      });

      const { maidr } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(2);
      expect(maidr.subplots[0]).toHaveLength(1);
    });

    it('splits x-stacked scales into a 1 row x N cols subplot grid', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['a', 'b'],
          datasets: [
            { label: 'Left', data: [1, 2] },
            { label: 'Right', data: [3, 4], xAxisID: 'x2' },
          ],
        },
        options: {
          scales: {
            y: {},
            x: { stack: 'cols', title: { text: 'Left Panel' } },
            x2: { stack: 'cols', title: { text: 'Right Panel' } },
          },
        },
      });

      const { maidr } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(1);
      expect(maidr.subplots[0]).toHaveLength(2);
      expect(maidr.subplots[0][0].layers[0].title).toBe('Left Panel');
      expect(maidr.subplots[0][1].layers[0].title).toBe('Right Panel');
    });

    it('classifies stacked/dodged bars per panel from the panel\'s own scale', () => {
      const chart = createChart({
        type: 'bar',
        data: {
          labels: ['Q1', 'Q2'],
          datasets: [
            { label: 'East', data: [1, 2] },
            { label: 'West', data: [3, 4] },
            { label: 'North', data: [5, 6], yAxisID: 'y2' },
            { label: 'South', data: [7, 8], yAxisID: 'y2' },
          ],
        },
        options: {
          scales: {
            x: {},
            y: { stack: 'demo', stacked: true },
            y2: { stack: 'demo' },
          },
        },
      });

      const { maidr, layerDatasetIndices } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(2);
      expect(maidr.subplots[0][0].layers[0].type).toBe(TraceType.STACKED);
      expect(maidr.subplots[1][0].layers[0].type).toBe(TraceType.DODGED);
      expect(layerDatasetIndices.get(maidr.subplots[0][0].layers[0].id)).toEqual([0, 1]);
      expect(layerDatasetIndices.get(maidr.subplots[1][0].layers[0].id)).toEqual([2, 3]);
    });

    it('keeps per-dataset scatter layers within each panel, mapped to original datasets', () => {
      const chart = createChart({
        type: 'scatter',
        data: {
          datasets: [
            { label: 'S1', data: [{ x: 1, y: 2 }] },
            { label: 'S2', data: [{ x: 3, y: 4 }] },
            { label: 'S3', data: [{ x: 5, y: 6 }], yAxisID: 'y2' },
          ],
        },
        options: {
          scales: {
            x: {},
            y: { stack: 'demo' },
            y2: { stack: 'demo' },
          },
        },
      });

      const { maidr, layerDatasetIndices } = extractChartData(chart);

      expect(maidr.subplots).toHaveLength(2);
      const panelOneIds = maidr.subplots[0][0].layers.map(l => l.id);
      const panelTwoIds = maidr.subplots[1][0].layers.map(l => l.id);
      expect(panelOneIds).toEqual(['0_0', '0_1']);
      expect(panelTwoIds).toEqual(['1_0']);
      expect(layerDatasetIndices.get('0_0')).toEqual([0]);
      expect(layerDatasetIndices.get('0_1')).toEqual([1]);
      expect(layerDatasetIndices.get('1_0')).toEqual([2]);
    });

    it('falls back to the first dataset label when a panel scale has no title', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['Jan'],
          datasets: [
            { label: 'Price', data: [10] },
            { label: 'Volume', data: [1], yAxisID: 'y2' },
          ],
        },
        options: {
          scales: { x: {}, y: { stack: 'demo' }, y2: { stack: 'demo' } },
        },
      });

      const { maidr } = extractChartData(chart);

      expect(maidr.subplots[0][0].layers[0].title).toBe('Price');
      expect(maidr.subplots[1][0].layers[0].title).toBe('Volume');
    });

    it('still throws for unsupported chart types', () => {
      const chart = createChart({
        type: 'pie',
        data: { datasets: [{ data: [1, 2] }] },
        options: {
          scales: { x: {}, y: { stack: 'demo' }, y2: { stack: 'demo' } },
        },
      });

      expect(() => extractChartData(chart)).toThrow(/unsupported chart type/);
    });
  });

  describe('extractMaidrData wrapper', () => {
    it('returns the same schema shape as extractChartData().maidr', () => {
      const chart = createChart({
        type: 'line',
        data: {
          labels: ['Jan'],
          datasets: [
            { label: 'Price', data: [10] },
            { label: 'Volume', data: [1], yAxisID: 'y2' },
          ],
        },
        options: {
          scales: { x: {}, y: { stack: 'demo' }, y2: { stack: 'demo' } },
        },
      });

      const maidr = extractMaidrData(chart);

      expect(maidr.subplots).toHaveLength(2);
      expect(maidr.subplots[0][0].layers[0].id).toBe('0_0');
    });
  });
});
