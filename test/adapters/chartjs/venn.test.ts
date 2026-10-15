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
      labels: ['Soccer', 'Tennis', 'Soccer ∩ Tennis', 'Both sports'],
      datasets: [{
        label: 'Sports',
        data: [
          { sets: ['Soccer'], value: 2 },
          { sets: ['Tennis'], value: 3 },
          { sets: ['Soccer', 'Tennis'], value: 1 },
          { sets: ['Tennis', 'Soccer'], value: 1 },
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
  it.each(['venn', 'euler'])('reads a %s as its regions, keeping a name the author gave', (type) => {
    const [layer] = extractChartData(vennChart(type)).maidr.subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.VENN);
    expect(layer.data as VennPoint[]).toEqual([
      { sets: ['Soccer'], size: 2 },
      { sets: ['Tennis'], size: 3 },
      { sets: ['Soccer', 'Tennis'], size: 1 },
      { sets: ['Tennis', 'Soccer'], size: 1, label: 'Both sports' },
    ]);
  });
});
