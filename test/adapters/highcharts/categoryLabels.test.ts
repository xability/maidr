/**
 * A Highcharts chart declared `xAxis: { type: 'category' }` announced its
 * categories as their own subscripts (#1146).
 *
 * Every converter names its points through one helper:
 *
 *     function pointLabel(point) {
 *       return point.category ?? point.name ?? point.x;
 *     }
 *
 * and Highcharts fills `point.category` differently depending only on how the
 * author spelled the axis. Measured on Highcharts 11.4.8 in Chromium, reading
 * the rendered tick labels off the SVG beside a transcription of the helper:
 *
 *   declaration                     drawn ticks     point.category  pointLabel
 *   xAxis: { categories: [...] }    Norway, Germany Norway, Germany Norway, …
 *   xAxis: { type: 'category' }     Norway, Germany 0, 1            0, 1
 *
 * The same chart, drawn identically, announced two different things. `??`
 * only falls through null and undefined, and `0` is neither, so the fallback
 * to `point.name` -- which does hold the label -- was unreachable.
 *
 * The labels are not lost, only elsewhere: a `type: 'category'` axis collects
 * them in `axis.names` and leaves `axis.categories` an **empty array**, which
 * is truthy and indexes to `undefined`. So the fix is to ask the axis, from
 * whichever of the two places Highcharts filled -- which is what the chart
 * itself prints under the marks.
 *
 * Measured too, and the reason nothing else moves: a heatmap or an xrange on
 * a `type: 'category'` axis fills **neither** list, because nothing named its
 * points, and the chart draws "0", "1" on the ticks as well. There is no
 * label to recover there and none is invented.
 */
import type { BarPoint, SegmentedPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const LABELS = ['Norway', 'Germany'];

/**
 * The x axis as each of Highcharts' two spellings leaves it.
 *
 * @param spelling - Which declaration the author used
 * @returns The axis
 */
function categoryAxis(spelling: 'categories' | 'type'): ReturnType<typeof fakeAxis> {
  return spelling === 'categories'
    // `categories: [...]` — the labels are in `categories`, `names` is empty.
    ? fakeAxis({ categories: [...LABELS], names: [] })
    // `type: 'category'` — the reverse, and `categories` is an EMPTY ARRAY
    // rather than absent, which is the whole trap.
    : fakeAxis({ categories: [], names: [...LABELS] });
}

/**
 * A one-series column chart on one of the two spellings.
 *
 * The points carry what Highcharts gives them under that spelling: a label in
 * `category` when the axis declared them, and the point's **index** there
 * plus the label on `name` when the axis derived them.
 *
 * @param spelling - Which declaration the author used
 * @param type - The series type
 * @returns The fake chart
 */
function chartOn(
  spelling: 'categories' | 'type',
  type = 'column',
): ReturnType<typeof fakeChart> {
  const axis = categoryAxis(spelling);
  return fakeChart({
    type,
    renderToId: 'labels-chart',
    series: [fakeSeries({
      index: 0,
      type,
      name: 'GDP',
      xAxis: axis,
      data: [42, 39].map((y, i) => (spelling === 'categories'
        ? { x: i, y, category: LABELS[i] }
        : { x: i, y, category: i as unknown as string, name: LABELS[i] })),
    })],
  });
}

/**
 * The x of every point of the chart's first layer.
 *
 * @param chart - The chart to convert
 * @returns The announced labels
 */
function labels(chart: ReturnType<typeof fakeChart>): (string | number)[] {
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  return (layer.data as BarPoint[]).map(point => point.x);
}

describe('highcharts category labels', () => {
  it('announces the labels a type: category axis derived', () => {
    expect(labels(chartOn('type'))).toEqual(LABELS);
  });

  it('announces the labels a declared categories axis carries', () => {
    // The spelling that already worked, asserted so the fix cannot cost it.
    expect(labels(chartOn('categories'))).toEqual(LABELS);
  });

  it('does not let a point index outrank the name the axis drew', () => {
    // The exact shape of the bug: `point.category` is `0`, which `??` will
    // not fall through, so every fallback below it was dead. Pinned on the
    // first point, whose index is the falsy one.
    expect(labels(chartOn('type'))[0]).not.toBe(0);
  });

  it('reaches every type that names a point the same way', () => {
    // `pointLabel` is the naming path for a dozen series types, so the fix
    // is asserted somewhere other than a bar as well -- a lollipop, whose
    // converter does nothing of its own about labels.
    expect(labels(chartOn('type', 'lollipop'))).toEqual(LABELS);
  });

  it('reads a scatter on a derived category axis as a dot plot', () => {
    // The same empty-array trap in a second place: a scatter pinned to
    // category ticks is a dot plot, and the test for one was
    // `xAxis.categories.length > 0` -- false on an axis whose labels are in
    // `names`. A `ScatterPoint.x` is strictly numeric, so the chart came out
    // announcing the tick index and dropping the label under it.
    const layer = highchartsToMaidr(chartOn('type', 'scatter'))
      .subplots[0][0]
      .layers[0];

    expect(layer.type).toBe(TraceType.DOT);
    expect((layer.data as BarPoint[]).map(point => point.x)).toEqual(LABELS);
  });

  it('names the categories of a stacked bar', () => {
    // A segmented group builds its own shared label list rather than calling
    // `pointLabel`, and had the same hole: `axisCategories?.[index]` on an
    // empty array is `undefined`, so it fell to `p.category` -- the index.
    const axis = categoryAxis('type');
    const chart = fakeChart({
      type: 'column',
      renderToId: 'stacked-chart',
      plotOptions: { column: { stacking: 'normal' } },
      series: [
        // `category` carries the INDEX, which is what a real chart puts
        // there under this spelling -- measured on a stacked column of the
        // same shape. Without it the row builder's `?? p.name` fallback
        // recovers the label by accident and the test proves nothing.
        fakeSeries({
          index: 0,
          name: 'one',
          xAxis: axis,
          data: [3, 5].map((y, i) => ({
            x: i,
            y,
            category: i as unknown as string,
            name: LABELS[i],
          })),
        }),
        fakeSeries({
          index: 1,
          name: 'two',
          xAxis: axis,
          data: [1, 2].map((y, i) => ({
            x: i,
            y,
            category: i as unknown as string,
            name: LABELS[i],
          })),
        }),
      ],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.STACKED);
    expect((layer.data as SegmentedPoint[][])[0].map(cell => cell.x))
      .toEqual(LABELS);
  });

  it('falls back to the point when the axis names nothing', () => {
    // A heatmap or an xrange declared `type: 'category'` fills neither list,
    // because nothing named its points -- measured, and the chart draws the
    // numbers on its ticks too. Nothing is recovered and nothing invented.
    const chart = fakeChart({
      type: 'column',
      renderToId: 'unnamed-chart',
      series: [fakeSeries({
        index: 0,
        xAxis: fakeAxis({ categories: [], names: [] }),
        data: [{ x: 0, y: 42, name: 'Norway' }, { x: 1, y: 39 }],
      })],
    });

    expect(labels(chart)).toEqual(['Norway', 1]);
  });

  it('passes over a blank entry rather than announcing nothing', () => {
    // An axis that names some slots and not others. A blank label names
    // nothing, and announcing it would replace a position a reader can at
    // least count with silence.
    const chart = fakeChart({
      type: 'column',
      renderToId: 'gappy-chart',
      series: [fakeSeries({
        index: 0,
        xAxis: fakeAxis({ categories: [], names: ['Norway', ''] }),
        data: [{ x: 0, y: 42 }, { x: 1, y: 39, name: 'Germany' }],
      })],
    });

    expect(labels(chart)).toEqual(['Norway', 'Germany']);
  });
});
