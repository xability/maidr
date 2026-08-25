/**
 * Which end of a reversed x axis a heatmap's first column sits at (#1008).
 *
 * #973 turned the *rows* over to match the y axis and never asked the x axis
 * anything, so a chart with `xAxis.reversed` was announced left to right while
 * it was drawn right to left.
 *
 * Measured on Highcharts 12.6 with the heatmap module, in Chromium, a three by
 * two grid, reading each cell's own resolved position:
 *
 *   plain        x0=1@(105,276)  x1=2@(315,276)  x2=3@(524,276)   x0 leftmost
 *   x reversed   x0=1@(524,276)  x1=2@(315,276)  x2=3@(105,276)   x0 rightmost
 *
 * and what the adapter emitted for those two, before the fix — byte-identical:
 *
 *   plain        x=["c0","c1","c2"]  points=[[4,5,6],[1,2,3]]  sel[0][0]=row0,col0
 *   x reversed   x=["c0","c1","c2"]  points=[[4,5,6],[1,2,3]]  sel[0][0]=row0,col0
 *
 * Every cell kept its own label and value and the highlight landed on the
 * right cell, because the selector addresses by the stamped Highcharts index
 * and the label for that column is that same index's category. Only the
 * direction was false — which is what arrowing, panning, braille and autoplay
 * all read.
 *
 * The two axes take opposite answers to the same question, and that is not an
 * inconsistency: Highcharts numbers a y axis from the bottom and an x axis
 * from the left, so an unreversed y has to be turned over and an unreversed x
 * does not.
 */

import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const X = ['c0', 'c1', 'c2'];
const Y = ['r0', 'r1'];

/**
 * The layer a three-by-two heatmap converts to.
 * @param xReversed - Whether Highcharts is drawing the x axis reversed
 * @param yReversed - Whether Highcharts is drawing the y axis reversed
 * @returns The emitted layer
 */
function layerFor(xReversed: boolean, yReversed: boolean): MaidrLayer {
  const xAxis = fakeAxis({ categories: X, reversed: xReversed } as never);
  const yAxis = fakeAxis({ categories: Y, reversed: yReversed } as never);
  const series = fakeSeries({
    index: 0,
    type: 'heatmap',
    name: 'H',
    xAxis,
    yAxis,
    // Values chosen so every cell is distinct: y index 0 holds 1..3, y index
    // 1 holds 4..6, both running up the x indices.
    data: [
      { x: 0, y: 0, options: { value: 1 } },
      { x: 1, y: 0, options: { value: 2 } },
      { x: 2, y: 0, options: { value: 3 } },
      { x: 0, y: 1, options: { value: 4 } },
      { x: 1, y: 1, options: { value: 5 } },
      { x: 2, y: 1, options: { value: 6 } },
    ],
  });

  const chart = fakeChart({
    type: 'heatmap',
    series: [series],
    xAxis: [xAxis],
    yAxis: [yAxis],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers[0] as MaidrLayer;
}

/** Which Highcharts x index each selector column points at, on the first row. */
function stampedCols(layer: MaidrLayer): (string | undefined)[] {
  return (layer.selectors as string[][])[0].map(
    cell => /data-maidr-col="(\d+)"/.exec(cell)?.[1],
  );
}

describe('which way a Highcharts heatmap\'s columns are read', () => {
  it('leaves an ordinary heatmap in the axis\' own order', () => {
    const data = layerFor(false, false).data as HeatmapData;

    expect(data.x).toEqual(['c0', 'c1', 'c2']);
    // Rows still turned over for the y axis, which is #973's half.
    expect(data.y).toEqual(['r1', 'r0']);
    expect(data.points).toEqual([[4, 5, 6], [1, 2, 3]]);
  });

  it('reads a reversed x axis the way the chart draws it', () => {
    const data = layerFor(true, false).data as HeatmapData;

    expect(data.x).toEqual(['c2', 'c1', 'c0']);
    expect(data.points).toEqual([[6, 5, 4], [3, 2, 1]]);
  });

  it('keeps every value on its own label when it turns the columns over', () => {
    // The reversal must move the values with the labels. `c2` held 3 on the
    // bottom row before and after; only where it is announced has changed.
    const plain = layerFor(false, false).data as HeatmapData;
    const reversed = layerFor(true, false).data as HeatmapData;

    const cellOf = (data: HeatmapData, label: string): (number | null)[] => {
      const column = data.x.indexOf(label);
      return data.points.map(row => row[column]);
    };

    expect(cellOf(reversed, 'c0')).toEqual(cellOf(plain, 'c0'));
    expect(cellOf(reversed, 'c2')).toEqual(cellOf(plain, 'c2'));
  });

  it('points each selector column at the cell its own label names', () => {
    // The half that reversing the labels alone would get wrong. The stamp is
    // still the index Highcharts gave the cell, so column 0 of a reversed
    // chart — announced `c2` — has to address stamped column 2.
    expect(stampedCols(layerFor(false, false))).toEqual(['0', '1', '2']);
    expect(stampedCols(layerFor(true, false))).toEqual(['2', '1', '0']);
  });

  it('turns the columns over independently of the rows', () => {
    // Both axes reversed: x flips, and y is left alone because a reversed y
    // already counts from the top.
    const data = layerFor(true, true).data as HeatmapData;

    expect(data.x).toEqual(['c2', 'c1', 'c0']);
    expect(data.y).toEqual(['r0', 'r1']);
    expect(data.points).toEqual([[3, 2, 1], [6, 5, 4]]);
  });
});
