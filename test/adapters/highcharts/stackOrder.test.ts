import type { HighchartsAxis } from '@adapters/highcharts/types';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

/**
 * Highcharts draws the first series of a stack at its top: `yAxis.reversedStacks`
 * is true unless a chart turns it off. `SegmentedTrace` reads the first row of
 * a segmented layer as the segment on the baseline, so a group emitted in
 * declared order was walked upside down — Up moved to the segment drawn below,
 * and the total that sits above the stack followed the bottom segment.
 */

const QUARTERS = ['Q1', 'Q2', 'Q3'];

/**
 * The layer a three-series column group stacks into.
 *
 * @param stacking - How the series stack
 * @param yAxis - The value axis, which carries `reversedStacks`
 * @returns The layer
 */
function stackedLayer(stacking: 'normal' | 'percent', yAxis: HighchartsAxis = fakeAxis()): MaidrLayer {
  const xAxis = fakeAxis({ categories: QUARTERS });
  const chart = fakeChart({
    type: 'column',
    renderToId: 'stacked-chart',
    plotOptions: { column: { stacking } },
    series: [
      fakeSeries({ index: 0, name: 'Product A', xAxis, yAxis, data: categoryPoints([20, 14, 23], QUARTERS) }),
      fakeSeries({ index: 1, name: 'Product B', xAxis, yAxis, data: categoryPoints([15, 18, 20], QUARTERS) }),
      fakeSeries({ index: 2, name: 'Product C', xAxis, yAxis, data: categoryPoints([10, 12, 9], QUARTERS) }),
    ],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers[0];
}

/** The series each row of a segmented layer holds, first row first. */
function rowNames(layer: MaidrLayer): unknown[] {
  return (layer.data as SegmentedPoint[][]).map(row => row[0].z);
}

describe('a stacked Highcharts column group', () => {
  it('runs from the series drawn at the base of the stack to the one on top', () => {
    const layer = stackedLayer('normal');

    expect(layer.type).toBe(TraceType.STACKED);
    // Product C is the segment on the baseline and Product A the one on top.
    expect(rowNames(layer)).toEqual(['Product C', 'Product B', 'Product A']);
    expect((layer.data as SegmentedPoint[][])[0].map(cell => cell.y)).toEqual([10, 12, 9]);
  });

  it('outlines the segment each row announces', () => {
    const selectors = stackedLayer('normal').selectors as (string | null)[][];

    expect(selectors.map(row => row[0])).toEqual([
      '#stacked-chart .highcharts-series-group .highcharts-series-2 .highcharts-point:nth-child(1)',
      '#stacked-chart .highcharts-series-group .highcharts-series-1 .highcharts-point:nth-child(1)',
      '#stacked-chart .highcharts-series-group .highcharts-series-0 .highcharts-point:nth-child(1)',
    ]);
  });

  it('stacks a percent group the same way', () => {
    const layer = stackedLayer('percent');

    expect(layer.type).toBe(TraceType.NORMALIZED);
    expect(rowNames(layer)).toEqual(['Product C', 'Product B', 'Product A']);
  });

  it('keeps the declared order on a chart that stacks the first series at the base', () => {
    const layer = stackedLayer('normal', fakeAxis({ options: { reversedStacks: false } }));

    expect(rowNames(layer)).toEqual(['Product A', 'Product B', 'Product C']);
  });

  it('still names the layer after the first series declared', () => {
    const layer = stackedLayer('normal');

    expect(layer.id).toBe('0');
  });
});
