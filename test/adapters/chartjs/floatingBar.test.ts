import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { GanttData, MaidrLayer, WaterfallPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Build a minimal floating-bar chart for the extractor to read.
 * @param labels The category labels — the lanes, or the waterfall's steps
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

/** A horizontal schedule: lanes on the category axis, intervals along x. */
const horizontal: ChartJsOptions = { indexAxis: 'y' };

describe('chart.js floating bar extraction', () => {
  describe('gantt', () => {
    it('reads a horizontal floating bar chart as a gantt', () => {
      const chart = barChart(
        ['Design', 'Build', 'Ship'],
        [{ label: 'Phase', data: [[0, 5], [5, 12], [12, 14]] }],
        horizontal,
      );

      const layers = layersOf(chart);

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.GANTT);
      expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
      const data = layers[0].data as GanttData;
      expect(data.points).toEqual([
        [{ x: 'Design', start: 0, end: 5 }],
        [{ x: 'Build', start: 5, end: 12 }],
        [{ x: 'Ship', start: 12, end: 14 }],
      ]);
    });

    it('used to lose every point of a floating bar chart', () => {
      // Regression: an array entry is neither a number nor a `{y}` object, so
      // before floating bars were read the chart extracted as a BAR layer
      // holding no points at all — silently.
      const layer = layersOf(barChart(['A'], [{ data: [[1, 2]] }], horizontal))[0];

      expect(layer.type).not.toBe(TraceType.BAR);
      expect((layer.data as GanttData).points.flat()).toHaveLength(1);
    });

    it('gathers a second dataset as a second interval in the same lane', () => {
      const chart = barChart(
        ['Alice', 'Bob'],
        [
          { label: 'Morning', data: [[9, 11], [9, 10]] },
          { label: 'Afternoon', data: [[14, 17], [13, 15]] },
        ],
        horizontal,
      );

      const data = layersOf(chart)[0].data as GanttData;

      expect(data.points[0]).toEqual([
        { x: 'Alice', start: 9, end: 11, label: 'Morning' },
        { x: 'Alice', start: 14, end: 17, label: 'Afternoon' },
      ]);
    });

    it('keeps an empty lane as a row and names it', () => {
      // The nested shape exists precisely so a lane with nothing booked is a
      // row a reader can navigate onto and be told about.
      const chart = barChart(
        ['Design', 'Idle', 'Ship'],
        [{ data: [[0, 5], null, [12, 14]] }],
        horizontal,
      );

      const data = layersOf(chart)[0].data as GanttData;

      expect(data.points).toHaveLength(3);
      expect(data.points[1]).toEqual([]);
      expect(data.lanes).toEqual(['Design', 'Idle', 'Ship']);
    });

    it('reads Date bounds as the instants the time scale plots them at', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-08T00:00:00Z');
      const chart = barChart(['Design'], [{ data: [[start, end]] }], {
        indexAxis: 'y',
        scales: { x: { type: 'time', time: { unit: 'day' } } },
      });

      const layer = layersOf(chart)[0];
      const data = layer.data as GanttData;

      expect(data.points[0][0]).toEqual({
        x: 'Design',
        start: start.valueOf(),
        end: end.valueOf(),
      });
      // Epoch milliseconds are what the bounds actually are, and what the
      // announced length is measured in — `time.unit` only says how the axis
      // is labelled.
      expect(data.unit).toBe('milliseconds');
      expect(layer.axes?.x?.format).toEqual({ type: 'date' });
    });

    it('names no unit on a plain linear axis', () => {
      const chart = barChart(['Design'], [{ data: [[0, 5]] }], horizontal);

      expect((layersOf(chart)[0].data as GanttData).unit).toBeUndefined();
    });

    it('lets the plugin name what the axis measures', () => {
      const chart = barChart(['Design'], [{ data: [[0, 5]] }], horizontal);

      const layers = extractChartData(chart, { unit: 'sprints' })
        .maidr
        .subplots[0][0]
        .layers;

      expect((layers[0].data as GanttData).unit).toBe('sprints');
    });

    it('reads a vertical range bar chart as a gantt too', () => {
      // Intervals along the value axis with one lane per category is what a
      // gantt is, whichever way round the chart is drawn.
      const chart = barChart(['Mon', 'Tue'], [{ data: [[3, 9], [5, 11]] }]);

      const layer = layersOf(chart)[0];

      expect(layer.type).toBe(TraceType.GANTT);
      expect(layer.orientation).toBeUndefined();
    });
  });

  describe('waterfall', () => {
    it('reads chained floating bars as a waterfall', () => {
      const chart = barChart(
        ['Open', 'Sales', 'Costs', 'Close'],
        [{ data: [[0, 100], [100, 150], [150, 120], [0, 120]] }],
      );

      const layers = layersOf(chart);

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.WATERFALL);
      expect(layers[0].data as WaterfallPoint[]).toEqual([
        { x: 'Open', start: 0, end: 100, delta: 100, kind: 'total' },
        { x: 'Sales', start: 100, end: 150, delta: 50, kind: 'increase' },
        { x: 'Costs', start: 150, end: 120, delta: -30, kind: 'decrease' },
        { x: 'Close', start: 0, end: 120, delta: 120, kind: 'total' },
      ]);
    });

    it('reads a subtotal drawn mid-chart as a total', () => {
      const chart = barChart(
        ['Open', 'Sales', 'Subtotal', 'Costs'],
        [{ data: [[0, 100], [100, 150], [0, 150], [150, 130]] }],
      );

      const points = layersOf(chart)[0].data as WaterfallPoint[];

      expect(points.map(point => point.kind))
        .toEqual(['total', 'increase', 'total', 'decrease']);
    });

    it('does not read unchained intervals as a waterfall', () => {
      // A schedule whose tasks happen to sit on one axis is not a running
      // total, and announcing a contribution the chart never made is the
      // failure this guard exists to prevent.
      const chart = barChart(['A', 'B'], [{ data: [[1, 3], [7, 9]] }]);

      expect(layersOf(chart)[0].type).toBe(TraceType.GANTT);
    });

    it('does not read a horizontal chart as a waterfall', () => {
      const chart = barChart(
        ['Open', 'Sales'],
        [{ data: [[0, 100], [100, 150]] }],
        horizontal,
      );

      expect(layersOf(chart)[0].type).toBe(TraceType.GANTT);
    });

    it('does not read several chained series as one waterfall', () => {
      // A waterfall carries one running total; two series are two schedules.
      const chart = barChart(['A', 'B'], [
        { label: 'One', data: [[0, 10], [10, 20]] },
        { label: 'Two', data: [[0, 5], [5, 8]] },
      ]);

      expect(layersOf(chart)[0].type).toBe(TraceType.GANTT);
    });
  });

  describe('highlighting', () => {
    it('maps a gantt lane and interval onto the dataset that booked it', () => {
      const chart = barChart(
        ['Alice', 'Bob'],
        [
          { label: 'Morning', data: [[9, 11], [9, 10]] },
          { label: 'Afternoon', data: [[14, 17], [13, 15]] },
        ],
        horizontal,
      );

      const resolve = resolverFor(chart);

      // MAIDR row = lane (Chart.js element index), col = which dataset.
      expect(resolve(0, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
      expect(resolve(0, 1)).toEqual([{ datasetIndex: 1, index: 0 }]);
      expect(resolve(1, 1)).toEqual([{ datasetIndex: 1, index: 1 }]);
    });

    it('highlights nothing on an empty lane', () => {
      const chart = barChart(
        ['Design', 'Idle'],
        [{ data: [[0, 5], null] }],
        horizontal,
      );

      const resolve = resolverFor(chart);

      expect(resolve(1, 0)).toEqual([]);
    });

    it('maps a waterfall step to its bar', () => {
      const chart = barChart(
        ['Open', 'Sales', 'Costs'],
        [{ data: [[0, 100], [100, 150], [150, 120]] }],
      );

      const resolve = resolverFor(chart);

      expect(resolve(0, 2)).toEqual([{ datasetIndex: 0, index: 2 }]);
    });
  });
});
