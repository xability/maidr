/**
 * A Chart.js matrix chart has to be emitted top row first (#974).
 *
 * `HeatmapData` runs top-first and `Heatmap` turns it over so its own row 0 is
 * the bottom of the drawn grid, which is what makes ArrowUp move visually up.
 * `extractHeatmapLayers` took its row order from the order the data points
 * happened to be listed in and never looked at the scale, so two things went
 * wrong at once: the matrix controller defaults its y scale to `reverse`,
 * which put the first-listed row at the bottom; and a chart whose points are
 * listed in any other order got a y axis in that order rather than the drawn
 * one.
 *
 * Measured on real Chart.js 4.5.1 with `chartjs-chart-matrix`, reading
 * `chart.scales.y` after a fixed layout (the scale spans y 32..122, so a
 * larger pixel is lower on screen), for data listed
 * `['first', 'second', 'third']`:
 *
 *   scales.y.reverse undeclared -> resolves true    px(first) 121.6, px(third) 32.0
 *   scales.y.reverse: false     -> stays    false   px(first)  32.0, px(third) 121.6
 *
 * so the controller's own default draws the first-listed row at the bottom.
 * Chart.js writes that resolved default back into `chart.options`, which is
 * where the adapter reads it.
 */
import type { ChartJsChart } from '@adapters/chartjs/types';
import type { HeatmapData } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';

/** Rows as a matrix chart is usually authored: ascending, bottom-up. */
const Y = ['first', 'second', 'third'];

/**
 * A matrix chart, as Chart.js leaves its options after construction.
 * @param scaleY - The resolved y scale
 * @param scaleY.labels - The category domain, when the author declared one
 * @param scaleY.reverse - Whether the scale runs the other way
 * @param rows - The order the data points are listed in
 * @returns The chart
 */
function matrixChart(
  scaleY: { labels?: string[]; reverse?: boolean },
  rows: string[] = Y,
): ChartJsChart {
  const data = rows.flatMap((y, index) => [
    { x: 'c1', y, v: index * 2 + 1 },
    { x: 'c2', y, v: index * 2 + 2 },
  ]);
  return {
    canvas: { id: 'matrix-chart' },
    config: { type: 'matrix' },
    data: { datasets: [{ type: 'matrix', data }] },
    options: { scales: { x: { type: 'category', labels: ['c1', 'c2'] }, y: { type: 'category', ...scaleY } } },
  } as unknown as ChartJsChart;
}

/**
 * The heatmap data a matrix chart converts to.
 * @param scaleY - The resolved y scale
 * @param scaleY.labels - The category domain, when the author declared one
 * @param scaleY.reverse - Whether the scale runs the other way
 * @param rows - The order the data points are listed in
 * @returns The emitted data
 */
function dataFor(
  scaleY: { labels?: string[]; reverse?: boolean },
  rows: string[] = Y,
): HeatmapData {
  const layer = extractChartData(matrixChart(scaleY, rows)).maidr.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer.data as HeatmapData;
}

describe('a chart.js matrix chart', () => {
  it('turns the rows over, because the controller reverses its y scale', () => {
    // 'third' is drawn at the top under `reverse`, so the layer leads with it.
    // Before the fix this was ['first', 'second', 'third'].
    expect(dataFor({ labels: Y, reverse: true }).y).toEqual(['third', 'second', 'first']);
  });

  it('carries the values over with their labels', () => {
    expect(dataFor({ labels: Y, reverse: true }).points).toEqual([[5, 6], [3, 4], [1, 2]]);
  });

  it('leaves an unreversed scale alone', () => {
    // `reverse: false` draws the first label at the top already.
    expect(dataFor({ labels: Y, reverse: false }).y).toEqual(Y);
    expect(dataFor({ labels: Y, reverse: false }).points).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('takes the order from the scale rather than the data', () => {
    // The points are listed scrambled, but the axis draws them in the order
    // the scale names. Before the fix the emitted axis followed the data.
    expect(dataFor({ labels: Y, reverse: false }, ['second', 'third', 'first']).y).toEqual(Y);
  });

  it('keeps every value on its own row when the two disagree', () => {
    // 'second' was listed first and carries 1 and 2; it must still do so
    // after being moved to the middle of the axis.
    const { y, points } = dataFor({ labels: Y, reverse: false }, ['second', 'third', 'first']);

    expect(points[y.indexOf('second')]).toEqual([1, 2]);
    expect(points[y.indexOf('third')]).toEqual([3, 4]);
    expect(points[y.indexOf('first')]).toEqual([5, 6]);
  });
});

describe('a matrix chart whose domain Chart.js inferred', () => {
  it('still turns the rows over', () => {
    // With no `labels` declared, Chart.js leaves `options.scales.y.labels`
    // absent while still resolving `reverse: true`. An inferred domain is the
    // order the points were listed in, so falling back to that and reversing
    // is right. Deliberately not read off the laid-out `chart.scales`, whose
    // `getLabels()` here is contaminated with the x values — measured as
    // ['c1', 'first', 'c2', 'second', 'third'].
    expect(dataFor({ reverse: true }).y).toEqual(['third', 'second', 'first']);
  });
});

describe('a scale that names rows the chart never drew', () => {
  it('falls back to the data rather than inventing an empty band', () => {
    // A scale naming four rows over three rows of data would otherwise add a
    // row of zeroes the chart does not show.
    const { y, points } = dataFor({ labels: [...Y, 'fourth'], reverse: false });

    expect(y).toEqual(Y);
    expect(points).toHaveLength(3);
  });
});
