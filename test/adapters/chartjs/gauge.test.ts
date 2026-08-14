import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions } from '@adapters/chartjs/types';
import type { GaugePoint, MaidrLayer, PiePoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal arc chart for the extractor to read.
 * @param labels The slice labels — on a dial, the measure's name
 * @param datasets The datasets the chart carries
 * @param options Chart options, for the sweep geometry
 * @returns A chart object shaped the way the extractor expects
 */
function doughnut(
  labels: (string | number)[],
  datasets: ChartJsDataset[],
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { labels, datasets };
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type: 'doughnut' },
    getDatasetMeta: () => ({ data: [], type: 'doughnut' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The layers a chart produces, in emission order. */
function layersOf(chart: ChartJsChart, pluginOptions?: Parameters<typeof extractChartData>[1]): MaidrLayer[] {
  return extractChartData(chart, pluginOptions).maidr.subplots[0][0].layers;
}

/** The half-circle sweep the doughnut-gauge recipe is drawn with. */
const dial: ChartJsOptions = { circumference: 180, rotation: 270 };

describe('chart.js gauge extraction', () => {
  it('reads a part-circle two-value doughnut as a gauge', () => {
    const chart = doughnut(['CPU'], [{ data: [73, 27] }], dial);

    const layers = layersOf(chart);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.GAUGE);
    // A single object, not an array: the chart draws one measure.
    expect(layers[0].data as GaugePoint).toEqual({
      value: 73,
      min: 0,
      max: 100,
      label: 'CPU',
    });
  });

  it('spends the remainder on the dial rather than announcing it', () => {
    // The second arc is drawn empty to leave the ring unfilled, so reading it
    // as a slice would announce a measure the chart does not have.
    const point = layersOf(doughnut(['Used'], [{ data: [30, 70] }], dial))[0].data as GaugePoint;

    expect(point.value).toBe(30);
    expect(point.max).toBe(100);
  });

  it('leaves a full-circle doughnut a pie', () => {
    const chart = doughnut(['Yes', 'No'], [{ data: [73, 27] }]);

    const layer = layersOf(chart)[0];

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.data as PiePoint[]).toHaveLength(2);
  });

  it('leaves a part-circle pie of several slices alone', () => {
    const chart = doughnut(['A', 'B', 'C'], [{ data: [10, 20, 30] }], dial);

    expect(layersOf(chart)[0].type).toBe(TraceType.PIE);
  });

  it('lets the page declare a dial the geometry does not show', () => {
    const chart = doughnut(['Score'], [{ data: [8, 2] }]);

    const layer = layersOf(chart, { traceType: TraceType.GAUGE })[0];

    expect(layer.type).toBe(TraceType.GAUGE);
    expect((layer.data as GaugePoint).max).toBe(10);
  });

  it('lets the page keep two slices two slices', () => {
    // A half-pie of exactly two slices is drawn identically to a dial, so the
    // declaration has to work in both directions.
    const chart = doughnut(['Yes', 'No'], [{ data: [73, 27] }], dial);

    expect(layersOf(chart, { traceType: TraceType.PIE })[0].type).toBe(TraceType.PIE);
  });

  it('carries the target and bands the chart draws as styling', () => {
    const chart = doughnut(['CPU'], [{ data: [73, 27] }], dial);

    const point = layersOf(chart, {
      target: 80,
      bands: [{ to: 50, label: 'idle' }, { to: 90, label: 'ok' }],
    })[0].data as GaugePoint;

    expect(point.target).toBe(80);
    expect(point.bands).toEqual([{ to: 50, label: 'idle' }, { to: 90, label: 'ok' }]);
  });

  it('names what the dial measures', () => {
    const layer = layersOf(doughnut(['CPU'], [{ data: [73, 27] }], dial))[0];

    // A dial has no scales, so the fallback would announce an axis it does
    // not have.
    expect(layer.axes?.x?.label).toBe('Measure');
    expect(layer.axes?.y?.label).toBe('Value');
  });

  it('highlights the arc the measure is drawn as', () => {
    const chart = doughnut(['CPU'], [{ data: [73, 27] }], dial);
    const { maidr, layerDatasetIndices } = extractChartData(chart);
    const layers = maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, layerDatasetIndices);

    // The gauge is one position, and it is the ring's first arc — never the
    // remainder drawn beside it.
    expect(resolveActiveTargets(layers, maps, layerDatasetIndices, '0', 0, 0))
      .toEqual([{ datasetIndex: 0, index: 0 }]);
  });
});
