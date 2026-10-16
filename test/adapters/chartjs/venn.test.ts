import type { ChartJsChart } from '@adapters/chartjs/types';
import type { VennPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * A `chartjs-chart-venn` chart as `extractSets` builds it: one point per
 * region, `{ sets, value }`, the region's name in `data.labels`.
 *
 * @param type - `venn` or `euler`
 * @returns The chart
 */
function vennChart(type: string): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: {
      labels: ['Soccer', 'Tennis', 'Soccer ∩ Tennis', 'Both sports', 'Tennis∩Soccer', 'Soccer & Tennis fans'],
      datasets: [{
        label: 'Sports',
        data: [
          { sets: ['Soccer'], value: 2 },
          { sets: ['Tennis'], value: 3 },
          { sets: ['Soccer', 'Tennis'], value: 1 },
          { sets: ['Tennis', 'Soccer'], value: 1 },
          { sets: ['Soccer', 'Tennis'], value: 1 },
          { sets: ['Soccer', 'Tennis'], value: 1 },
        ],
      }],
    },
    options: { plugins: {} },
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

describe('chart.js venn and euler', () => {
  it.each(['venn', 'euler'])('reads a %s as its regions, keeping a name the author gave even when it names the sets', (type) => {
    const [layer] = extractChartData(vennChart(type)).maidr.subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.VENN);
    expect(layer.data as VennPoint[]).toEqual([
      { sets: ['Soccer'], size: 2 },
      { sets: ['Tennis'], size: 3 },
      { sets: ['Soccer', 'Tennis'], size: 1 },
      { sets: ['Tennis', 'Soccer'], size: 1, label: 'Both sports' },
      { sets: ['Soccer', 'Tennis'], size: 1 },
      { sets: ['Soccer', 'Tennis'], size: 1, label: 'Soccer & Tennis fans' },
    ]);
  });
});

/**
 * A `chartjs-chart-venn` chart of the given points and region names.
 *
 * @param labels - `data.labels`, one per point
 * @param data - The points
 * @returns The chart
 */
function vennOf(labels: string[], data: unknown[]): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels, datasets: [{ label: 'Sports', data }] },
    options: { plugins: {} },
    config: { type: 'venn' },
    getDatasetMeta: () => ({ data: [], type: 'venn' }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

describe('chart.js venn points the plugin could not size or place', () => {
  it('reads a region with no usable value as one with no size, rather than a size of zero', () => {
    const chart = vennOf(['Soccer', 'Tennis', 'Golf', 'Fans'], [
      { sets: ['Soccer'] },
      { sets: ['Tennis'], value: Number.NaN },
      { sets: ['Golf'], value: '4' },
      { sets: ['Soccer', 'Tennis'], value: null },
    ]);

    const [layer] = extractChartData(chart).maidr.subplots[0][0].layers;

    expect(layer.data as VennPoint[]).toEqual([
      { sets: ['Soccer'] },
      { sets: ['Tennis'] },
      { sets: ['Golf'] },
      { sets: ['Soccer', 'Tennis'], label: 'Fans' },
    ]);
  });

  it('skips a point with empty sets, keeping every other region\'s own name', () => {
    const chart = vennOf(['Nobody', 'Soccer', 'Tennis', 'Both sports'], [
      { sets: [], value: 9 },
      { sets: ['Soccer'], value: 2 },
      { sets: ['Tennis'], value: 3 },
      { sets: ['Soccer', 'Tennis'], value: 1 },
    ]);

    const [layer] = extractChartData(chart).maidr.subplots[0][0].layers;

    expect(layer.data as VennPoint[]).toEqual([
      { sets: ['Soccer'], size: 2 },
      { sets: ['Tennis'], size: 3 },
      { sets: ['Soccer', 'Tennis'], size: 1, label: 'Both sports' },
    ]);
  });

  it('reads no layer at all from a dataset whose every point has empty or missing sets', () => {
    const chart = vennOf(['Nobody', 'Nothing'], [{ sets: [], value: 1 }, { value: 2 }]);

    const layers = extractChartData(chart).maidr.subplots.flat().flatMap(subplot => subplot.layers);

    expect(layers).toEqual([]);
  });
});
