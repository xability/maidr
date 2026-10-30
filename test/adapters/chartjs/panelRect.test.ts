/**
 * A Chart.js figure of axis-stacked panels is one canvas, so nothing in the
 * page marks a panel for MAIDR to outline in the figure lobby. The adapter
 * outlines it itself, as the band of the plot area its datasets' value scale
 * was laid out in.
 */
import type { ChartJsChart, ChartJsRuntimeScale } from '@adapters/chartjs/types';
import { panelRect } from '@adapters/chartjs/panel';
import { describe, expect, it } from '@jest/globals';

const AREA = { left: 50, top: 10, right: 450, bottom: 410 };

/**
 * A laid-out chart whose datasets are drawn against the given value scales.
 * @param valueScales - Each dataset's value scale id, by dataset index
 * @param scales - The laid-out scales, by id
 * @returns The chart
 */
function laidOut(
  valueScales: (string | undefined)[],
  scales: Record<string, ChartJsRuntimeScale>,
): ChartJsChart {
  return {
    chartArea: AREA,
    scales,
    getDatasetMeta: (index: number) => ({
      data: [],
      type: 'line',
      vScale: valueScales[index] === undefined ? undefined : { id: valueScales[index] },
    }),
  } as unknown as ChartJsChart;
}

describe('the panel of an axis-stacked Chart.js figure', () => {
  const rows = {
    y: { axis: 'y', left: 0, right: 50, top: 10, bottom: 200 },
    y2: { axis: 'y', left: 0, right: 50, top: 220, bottom: 410 },
  } as Record<string, ChartJsRuntimeScale>;

  it('is the row of the plot area its value scale is laid out in', () => {
    const chart = laidOut(['y', 'y2'], rows);

    expect(panelRect(chart, [1])).toEqual({ kind: 'rect', left: 50, top: 220, width: 400, height: 190 });
  });

  it('is the column of the plot area for a panel stacked along x', () => {
    const chart = laidOut(['x', 'x2'], {
      x: { axis: 'x', left: 50, right: 240, top: 410, bottom: 430 },
      x2: { axis: 'x', left: 260, right: 450, top: 410, bottom: 430 },
    } as Record<string, ChartJsRuntimeScale>);

    expect(panelRect(chart, [0])).toEqual({ kind: 'rect', left: 50, top: 10, width: 190, height: 400 });
  });

  it('is read from the first of the panel\'s datasets drawn against a laid-out scale', () => {
    const chart = laidOut([undefined, 'y2'], rows);

    expect(panelRect(chart, [0, 1])).toEqual({ kind: 'rect', left: 50, top: 220, width: 400, height: 190 });
  });

  it('is unknown before the chart is laid out', () => {
    const chart = { ...laidOut(['y', 'y2'], rows), chartArea: undefined } as ChartJsChart;

    expect(panelRect(chart, [0])).toBeNull();
  });
});
