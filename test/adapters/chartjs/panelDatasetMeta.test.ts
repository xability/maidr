/**
 * A panel view restricts `data.datasets` to the panel's partition, so every
 * extractor that walks it counts from zero. The metas it asks for have to be
 * translated back: `getDatasetMeta(0)` inside the second panel means "the
 * first dataset of THIS panel", not "the first dataset of the chart".
 *
 * Every meta-reading extractor (error bars, box, violin, geo, graph, pcp)
 * loops the panel-local index straight into `chart.getDatasetMeta(d)`, so
 * without the translation the lower panel reads the upper panel's parse and
 * announces numbers that belong to a different subplot.
 */
import type { ChartJsChart, ChartJsDataset, ChartJsParsedValue } from '@adapters/chartjs/types';
import type { ErrorBarPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';

/** Two error-bar datasets, one per stacked y panel. */
function twoPanelErrorBarChart(parsed: ChartJsParsedValue[][]): ChartJsChart {
  const datasets = [
    { label: 'Top', data: parsed[0].map(() => 0) },
    { label: 'Bottom', data: parsed[1].map(() => 0), yAxisID: 'y2' },
  ] as unknown as ChartJsDataset[];

  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels: ['A'], datasets },
    options: {
      plugins: {},
      scales: {
        y: { stack: 'panels', title: { text: 'Top' } },
        y2: { stack: 'panels', title: { text: 'Bottom' } },
        x: { title: { text: 'Category' } },
      },
    },
    config: { type: 'barWithErrorBars' },
    getDatasetMeta: (index: number) => ({
      data: [],
      type: 'barWithErrorBars',
      _parsed: parsed[index] ?? [],
    }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

describe('chart.js stacked panel dataset metas', () => {
  it('reads each panel from its own dataset meta rather than the first panel\'s', () => {
    const chart = twoPanelErrorBarChart([
      [{ x: 0, y: 10, yMin: 8, yMax: 12 }],
      [{ x: 0, y: 99, yMin: 90, yMax: 105 }],
    ]);

    const { maidr } = extractChartData(chart);

    const panels = maidr.subplots.flat().map(
      subplot => subplot.layers[0].data as ErrorBarPoint[],
    );
    expect(panels).toHaveLength(2);
    expect(panels.map(points => points.map(point => point.y)).flat().sort())
      .toEqual([10, 99]);
  });

  it('keeps a single-panel chart reading its metas unchanged', () => {
    const chart = twoPanelErrorBarChart([
      [{ x: 0, y: 10, yMin: 8, yMax: 12 }],
      [{ x: 0, y: 99, yMin: 90, yMax: 105 }],
    ]);
    chart.options.scales = { y: { title: { text: 'Response' } }, x: {} };
    (chart.data.datasets[1] as ChartJsDataset).yAxisID = undefined;

    const { maidr } = extractChartData(chart);

    const series = maidr.subplots[0][0].layers[0].data as ErrorBarPoint[][];
    expect(series.map(points => points[0].y)).toEqual([10, 99]);
  });
});
