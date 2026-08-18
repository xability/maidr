/**
 * Which order a Chart.js matrix chart's columns are read in (#1010).
 *
 * #974 fixed the rows and stated the principle in as many words — *"which
 * order the rows are actually drawn in is the scale's business, not the
 * data's"* — and then did none of it for the columns: `xLabels` went straight
 * from the collection loop into the payload, so neither `scales.x.labels` nor
 * `scales.x.reverse` was ever read.
 *
 * Measured on Chart.js 4 with `chartjs-chart-matrix` in Chromium, points
 * listed deliberately out of axis order as `c2, c0, c1`, reading each drawn
 * cell's own x:
 *
 *   no scale labels             columns left → right   c2, c0, c1
 *   x labels ['c0','c1','c2']   columns left → right   c0, c1, c2
 *   x reverse                   columns left → right   c2, c1, c0
 *   y reverse                   columns left → right   c0, c1, c2   (unaffected)
 *
 * and what the adapter emitted for the first three, before the fix:
 *
 *   no x labels        x=["c2","c0","c1"]
 *   x labels declared  x=["c2","c0","c1"]     ← chart draws c0, c1, c2
 *   x reverse          x=["c2","c0","c1"]     ← chart draws c2, c1, c0
 *
 * The first was right by luck: with nothing declared the listing order *is*
 * the drawn order.
 *
 * Chart.js paints to canvas, so there are no selectors and no highlight to
 * desynchronise — this is the one-sided case, like #976 and #982. Nothing was
 * mis-valued either, since `points` is keyed by label. Only the order was
 * false, and with it arrowing, panning, the braille row and autoplay.
 *
 * The `labels` half matters more than the `reverse` half: declaring a category
 * domain is ordinary, and is the whole reason the row block reads the scale.
 */

import type { ChartJsChart } from '@adapters/chartjs/types';
import type { HeatmapData } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';

/** Points listed in an order no axis draws, so the two cannot be confused. */
const LISTED = [
  { x: 'c2', y: 'r1', v: 1 },
  { x: 'c0', y: 'r1', v: 2 },
  { x: 'c1', y: 'r1', v: 3 },
  { x: 'c2', y: 'r0', v: 4 },
  { x: 'c0', y: 'r0', v: 5 },
  { x: 'c1', y: 'r0', v: 6 },
];

/**
 * The heatmap data a matrix chart converts to.
 * @param scaleX - The resolved x scale
 * @param scaleX.labels - The category domain, when the author declared one
 * @param scaleX.reverse - Whether the scale runs the other way
 * @returns The emitted data
 */
function dataFor(scaleX: { labels?: string[]; reverse?: boolean }): HeatmapData {
  const chart = {
    canvas: { id: 'matrix-chart' },
    config: { type: 'matrix' },
    data: { datasets: [{ type: 'matrix', data: LISTED }] },
    options: {
      scales: {
        x: { type: 'category', ...scaleX },
        y: { type: 'category', labels: ['r0', 'r1'] },
      },
    },
  } as unknown as ChartJsChart;

  const layer = extractChartData(chart).maidr.subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer.data as HeatmapData;
}

describe('which order a chart.js matrix chart reads its columns in', () => {
  it('keeps the listed order when the scale declares no domain', () => {
    // Right by luck rather than by reasoning, and pinned so the fix cannot
    // break the case it was already getting right: an inferred domain is the
    // order the points were listed in.
    expect(dataFor({}).x).toEqual(['c2', 'c0', 'c1']);
  });

  it('takes a declared domain over the order the points were listed in', () => {
    expect(dataFor({ labels: ['c0', 'c1', 'c2'] }).x).toEqual(['c0', 'c1', 'c2']);
  });

  it('turns a reversed scale over', () => {
    expect(dataFor({ labels: ['c0', 'c1', 'c2'], reverse: true }).x)
      .toEqual(['c2', 'c1', 'c0']);
  });

  it('carries every value across with its own column', () => {
    // `c0` held 5 on the r0 row and 2 on r1 however the points were listed;
    // only where it is announced changes.
    const declared = dataFor({ labels: ['c0', 'c1', 'c2'] });
    const reversed = dataFor({ labels: ['c0', 'c1', 'c2'], reverse: true });

    const columnOf = (data: HeatmapData, label: string): number[] => {
      const index = data.x.indexOf(label);
      return data.points.map(row => row[index]);
    };

    expect(columnOf(declared, 'c0')).toEqual(columnOf(reversed, 'c0'));
    expect(columnOf(declared, 'c2')).toEqual(columnOf(reversed, 'c2'));
  });

  it('leaves the rows to their own axis', () => {
    // The columns moving must not disturb #974's half.
    expect(dataFor({ labels: ['c0', 'c1', 'c2'] }).y).toEqual(['r0', 'r1']);
  });

  it('falls back to the listed order when the scale names other categories', () => {
    // A domain that does not describe this data is not evidence about how it
    // is drawn, so the listed order stays rather than dropping columns.
    expect(dataFor({ labels: ['nope', 'other'] }).x).toEqual(['c2', 'c0', 'c1']);
  });
});
