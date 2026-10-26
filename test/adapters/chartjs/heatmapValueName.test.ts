/**
 * A Chart.js heatmap's cell value is announced under the name the chart gives
 * it.
 *
 * A matrix chart has no scale for the cell value, and the extractor emitted no
 * `z` axis, so every cell was read under MAIDR's placeholder: "Task is Math,
 * Model is GPT-4, Level is 92". The page had no way to change that:
 * `plugins.maidr.axes.z` was read for a bubble's size only.
 */
import type { ChartJsChart, ChartJsDataset, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { MaidrLayer } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { TraceFactory } from '@model/factory';

/**
 * A two-by-one matrix chart.
 *
 * @param labels - Each dataset's label, one dataset per entry
 * @returns The chart
 */
function matrixChart(labels: (string | undefined)[]): ChartJsChart {
  const datasets: ChartJsDataset[] = labels.map((label, index) => ({
    ...(label !== undefined ? { label } : {}),
    data: [{ x: `task ${index}`, y: 'GPT-4', v: 92 - index }],
  }));
  return {
    canvas: { id: 'matrix-chart' } as unknown as HTMLCanvasElement,
    data: { datasets },
    options: {},
    config: { type: 'matrix' },
    getDatasetMeta: () => ({ data: [], type: 'matrix' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The chart's one layer. */
function layerOf(chart: ChartJsChart, pluginOptions?: MaidrPluginOptions): MaidrLayer {
  return extractChartData(chart, pluginOptions).maidr.subplots[0][0].layers[0];
}

describe('chart.js heatmap value name', () => {
  it('announces a cell under its dataset\'s label, as the matrix tooltip names it', () => {
    const layer = layerOf(matrixChart(['Task Performance']));

    const state = TraceFactory.create(layer).getStateAt(0, 0);

    expect(state.empty).toBe(false);
    if (state.empty)
      return;
    expect(state.text.z).toEqual({ label: 'Task Performance', value: 92 });
  });

  it('takes the name the page gives in plugins.maidr.axes.z', () => {
    const layer = layerOf(matrixChart(['Task Performance']), { axes: { z: 'Score (%)' } });

    expect(layer.axes?.z).toEqual({ label: 'Score (%)' });
  });

  it('names nothing when the datasets are labelled differently', () => {
    // Two labels name two things, so neither is the name of every cell; the
    // reader hears the placeholder rather than a wrong name.
    const layer = layerOf(matrixChart(['Before', 'After']));

    expect(layer.axes?.z).toBeUndefined();
  });

  it('names nothing when no dataset is labelled', () => {
    const layer = layerOf(matrixChart([undefined]));

    expect(layer.axes?.z).toBeUndefined();
  });
});
