/**
 * A Highcharts histogram on an inverted chart was read as an upright one.
 *
 * `convertBarGroup` has resolved `chart.inverted` since #997, but
 * `convertHistogramSeries` was never given the chart at all: it took the
 * series alone, wrote the bin into `x` and the count into `y`, and declared no
 * `orientation` — so a chart drawn with its bins running down the page said
 * `vert` by omission.
 *
 * A histogram has no sideways series type of its own the way a column has
 * `bar`, so `inverted` is the whole of the question here rather than one half
 * of it.
 *
 * Measured on Highcharts 12 plus `modules/histogram-bellcurve.js` in
 * Chromium, five hundred samples binned into fifteen, once plain and once
 * with `chart: {inverted: true}` — the emitted layer, and what MAIDR
 * announced on the first bin:
 *
 *   chart options           orientation   data[0]                              announced
 *   (none)                  vert          {x: -1.31, y: 4, xMin: -1.31, …}     "Value is -1.31 through -1.14, Count is 4"
 *   {inverted: true}        vert          {x: -1.34, y: 7, xMin: -1.34, …}     "Value is -1.34 through -1.17, Count is 7"
 *
 * The second row is a faithful reading of a chart Highcharts did not draw:
 * announced as an upright histogram, arrowed left and right through bins that
 * run down the page. Highcharts keeps the bin on `x` and the count on `y`
 * whichever way it draws them, so the payload has to be transposed for the
 * horizontal reading rather than merely labelled as one — `Histogram` takes
 * the bin bounds from `yMin`/`yMax` and the count from `x` when the layer
 * says `horz`.
 */

import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/** Three bins of width 2, and the counts that fell in them. */
const BINS = [
  { start: 0, end: 2, count: 4 },
  { start: 2, end: 4, count: 33 },
  { start: 4, end: 6, count: 12 },
];

/**
 * The layer one histogram converts to.
 *
 * The axis titles are the ones a histogram is conventionally drawn with: the
 * measured variable along the bins, the count against them. They do not move
 * when the chart is inverted — Highcharts still calls the bin axis `xAxis` —
 * which is why the emitted labels have to be swapped with the pair they name.
 *
 * @param inverted - Whether the chart declares `chart.inverted`
 * @returns The emitted layer
 */
function histogramLayer(inverted?: boolean): MaidrLayer {
  const binAxis = fakeAxis({ options: { title: { text: 'Petal Length' } } });
  const countAxis = fakeAxis({ options: { title: { text: 'Count' } } });
  const chart = fakeChart({
    inverted,
    xAxis: [binAxis],
    yAxis: [countAxis],
    series: [fakeSeries({
      index: 0,
      type: 'histogram',
      name: 'Histogram',
      xAxis: binAxis,
      yAxis: countAxis,
      data: BINS.map(bin => ({
        x: bin.start,
        y: bin.count,
        options: { x: bin.start, x2: bin.end },
      })),
    })],
  });
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

describe('a Highcharts histogram on an upright chart', () => {
  it('says nothing about orientation, which is `vert`', () => {
    expect(histogramLayer().orientation).toBeUndefined();
  });

  it('puts the bin on x and the count on y', () => {
    const points = histogramLayer().data as HistogramPoint[];

    expect(points[0]).toEqual({ x: 0, y: 4, xMin: 0, xMax: 2, yMin: 0, yMax: 4 });
  });

  it('names the bin axis x and the count axis y', () => {
    expect(histogramLayer().axes).toEqual({
      x: { label: 'Petal Length' },
      y: { label: 'Count' },
    });
  });
});

describe('a Highcharts histogram on an inverted chart', () => {
  it('says it is drawn sideways', () => {
    expect(histogramLayer(true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('takes the bin bounds from the axis the bins run along', () => {
    // The transposition the orientation asks for: bounds in `yMin`/`yMax`,
    // count on `x`. Declaring `horz` over the upright payload would be worse
    // than declaring nothing — the count would then be read off the bin.
    const points = histogramLayer(true).data as HistogramPoint[];

    expect(points[0]).toEqual({ x: 4, y: 0, xMin: 0, xMax: 4, yMin: 0, yMax: 2 });
  });

  it('swaps the axis labels with the pair they name', () => {
    // `axes.x` names whichever axis the point's `x` is on, which for a
    // sideways histogram is the count — the same swap `barAxes` makes for a
    // sideways bar.
    expect(histogramLayer(true).axes).toEqual({
      x: { label: 'Count' },
      y: { label: 'Petal Length' },
    });
  });
});
