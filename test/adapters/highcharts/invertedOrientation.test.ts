/**
 * Everything but the bars kept reading an inverted Highcharts chart upright.
 *
 * `chart.inverted` turns the whole plot on its side, and #997 taught the bar
 * family to say so. Every other oriented series went on emitting the upright
 * arrangement: a box plot, a Cleveland dot plot, a lollipop and a dumbbell
 * declared no orientation at all, and the two that did declare one -- the
 * error bar and the forest plot -- named their axes the wrong way round.
 *
 * Measured on Highcharts 12 in Chromium, `categories: ['alpha','bravo',
 * 'charlie']` with `xAxis.title` `Group` and `yAxis.title` `Value`, each
 * series drawn once plain and once with `chart: {inverted: true}`:
 *
 *   series      inverted   orientation   announced on the first mark
 *   boxplot     yes        (none)        "Group is alpha" against the wrong axis
 *   scatter     yes        (none)        a vertical dot plot of a sideways chart
 *   lollipop    yes        (none)        as above
 *   dumbbell    yes        (none)        as above
 *   errorbar    yes        horz          "Value is alpha, value Group is 10"
 *
 * The last row is the one that shows what the labels cost: both of them on the
 * wrong number, in a layer that had already said it was sideways. Highcharts
 * calls the category axis `xAxis` whichever way it draws the chart, while
 * MAIDR's `axes.x` names the axis the reading's `x` is on -- so the pair has
 * to be swapped with the axes they name, exactly as `barAxes` does for a bar.
 *
 * Which payloads move is the grammar's table, not a matter of taste: the bar
 * family -- the dot and the lollipop here -- exchanges `x` and `y`, while a
 * box, an interval and a dumbbell carry no such pair and keep what they have.
 */

import type { BarPoint, BoxPoint, DumbbellData, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];

/**
 * The layer one series converts to, on a chart titled the usual way round.
 *
 * @param type - The Highcharts series type
 * @param data - Its points
 * @param inverted - Whether the chart declares `chart.inverted`
 * @returns The emitted layer
 */
function layerFor(
  type: string,
  data: Record<string, unknown>[],
  inverted?: boolean,
): MaidrLayer {
  const categoryAxis = fakeAxis({
    categories: CATEGORIES,
    options: { title: { text: 'Group' } },
  });
  const valueAxis = fakeAxis({ options: { title: { text: 'Value' } } });
  const chart = fakeChart({
    inverted,
    xAxis: [categoryAxis],
    yAxis: [valueAxis],
    series: [fakeSeries({
      index: 0,
      type,
      name: 'Obs',
      xAxis: categoryAxis,
      yAxis: valueAxis,
      data,
    })],
  });
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

/** The five-number summaries a boxplot series carries. */
const BOXES = [
  { x: 0, low: 1, q1: 2, median: 3, q3: 4, high: 5, category: 'alpha' },
  { x: 1, low: 2, q1: 3, median: 4, q3: 5, high: 6, category: 'bravo' },
];

/** The two ends a dumbbell series carries. */
const ENDS = [
  { x: 0, low: 1, high: 5, category: 'alpha' },
  { x: 1, low: 2, high: 8, category: 'bravo' },
];

describe('a box plot on an inverted Highcharts chart', () => {
  it('says it is drawn sideways', () => {
    expect(layerFor('boxplot', BOXES, true).orientation).toBe(Orientation.HORIZONTAL);
    expect(layerFor('boxplot', BOXES).orientation).toBeUndefined();
  });

  it('swaps the axis titles with the pair they name', () => {
    // `BoxTrace` takes the group off `axes.y` when the layer is horizontal,
    // and on an inverted chart the group is what Highcharts' `xAxis` holds.
    expect(layerFor('boxplot', BOXES, true).axes).toEqual({
      x: { label: 'Value' },
      y: { label: 'Group' },
    });
  });

  it('leaves the summary itself alone', () => {
    const boxes = layerFor('boxplot', BOXES, true).data as BoxPoint[];

    expect(boxes[0]).toEqual({
      z: 'alpha',
      lowerOutliers: [],
      min: 1,
      q1: 2,
      q2: 3,
      q3: 4,
      max: 5,
      upperOutliers: [],
    });
  });
});

describe('the bar-family marks on an inverted Highcharts chart', () => {
  it('reads a category scatter as a horizontal dot plot', () => {
    const layer = layerFor('scatter', categoryPoints([10, 20, 30], CATEGORIES), true);

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // The exchange the grammar's table calls for: magnitude on `x`.
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 10, y: 'alpha' });
    expect(layer.axes).toEqual({ x: { label: 'Value' }, y: { label: 'Group' } });
  });

  it('reads a lollipop the same way', () => {
    const layer = layerFor('lollipop', categoryPoints([10, 20, 30], CATEGORIES), true);

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 10, y: 'alpha' });
  });

  it('leaves both upright on a chart that is not inverted', () => {
    const dot = layerFor('scatter', categoryPoints([10, 20, 30], CATEGORIES));

    expect(dot.orientation).toBeUndefined();
    expect((dot.data as BarPoint[])[0]).toEqual({ x: 'alpha', y: 10 });
    expect(dot.axes).toEqual({ x: { label: 'Group' }, y: { label: 'Value' } });
  });
});

describe('a dumbbell on an inverted Highcharts chart', () => {
  it('says it is drawn sideways without moving its ends', () => {
    const layer = layerFor('dumbbell', ENDS, true);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as DumbbellData).points[0]).toEqual({
      x: 'alpha',
      start: 1,
      end: 5,
    });
  });

  it('swaps the axis titles with the pair they name', () => {
    expect(layerFor('dumbbell', ENDS, true).axes).toEqual({
      x: { label: 'Value' },
      y: { label: 'Group' },
    });
  });
});

describe('an error bar on an inverted Highcharts chart', () => {
  it('still says it is drawn sideways', () => {
    // This one already did. What it got wrong was the pair of labels.
    expect(layerFor('errorbar', [
      { x: 0, low: 8, high: 12, category: 'alpha' },
      { x: 1, low: 18, high: 22, category: 'bravo' },
    ], true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('names the sample axis y, which is where the trace looks for it', () => {
    const layer = layerFor('errorbar', [
      { x: 0, low: 8, high: 12, category: 'alpha' },
      { x: 1, low: 18, high: 22, category: 'bravo' },
    ], true);

    expect(layer.axes).toEqual({ x: { label: 'Value' }, y: { label: 'Group' } });
  });

  it('leaves the titles of an upright chart where they are', () => {
    const layer = layerFor('errorbar', [
      { x: 0, low: 8, high: 12, category: 'alpha' },
    ]);

    expect(layer.axes).toEqual({ x: { label: 'Group' }, y: { label: 'Value' } });
  });
});
