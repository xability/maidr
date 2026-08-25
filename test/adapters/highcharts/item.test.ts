/**
 * An `item` series emitted no layer, so its chart read as though it were not
 * there — silence, on a chart whose only series it is (#1138).
 *
 * An item chart is a pie drawn as discrete symbols: a parliament diagram, one
 * dot per seat. Highcharts registers it as its own series type and documents
 * it as inheriting from `pie`, and its points carry the same `name` and `y` a
 * pie's do — so it reads through the same converter, and what differs is the
 * painting rather than the data.
 *
 * That is the same relation `columnpyramid` and `pictorial` have to `column`,
 * which #1138 settled the same way: a tapered outline and a repeated icon are
 * a column, and a ring of dots is a pie.
 */

import type { PiePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const PARTIES = ['Reds', 'Blues', 'Greens'];
const SEATS = [120, 98, 33];

function parliament(type: string): ReturnType<typeof fakeChart> {
  return fakeChart({
    series: [fakeSeries({
      index: 0,
      type,
      name: 'Seats',
      xAxis: fakeAxis({ categories: PARTIES }),
      yAxis: fakeAxis({ options: { title: { text: 'Seats' } } }),
      data: SEATS.map((y, i) => ({ x: i, y, name: PARTIES[i], category: PARTIES[i] })),
    })],
  });
}

describe('a highcharts item series', () => {
  it('is read rather than skipped', () => {
    // Measured before the fix: no layers at all, because `convertSeries`
    // fell to its `default:`, warned, and returned null.
    const layers = highchartsToMaidr(parliament('item')).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
  });

  it('is a pie, which is what it is drawn from', () => {
    const [layer] = highchartsToMaidr(parliament('item')).subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.PIE);
  });

  it('carries each name and its count', () => {
    const [layer] = highchartsToMaidr(parliament('item')).subplots[0][0].layers;

    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Reds', y: 120 },
      { x: 'Blues', y: 98 },
      { x: 'Greens', y: 33 },
    ]);
  });

  it('reads exactly as the pie it inherits from', () => {
    // The point of routing it through the one converter: the same data drawn
    // either way must announce identically, or the reader is being told the
    // painting rather than the chart.
    const asItem = highchartsToMaidr(parliament('item')).subplots[0][0].layers[0];
    const asPie = highchartsToMaidr(parliament('pie')).subplots[0][0].layers[0];

    expect(asItem.type).toBe(asPie.type);
    expect(asItem.data).toEqual(asPie.data);
    expect(asItem.axes).toEqual(asPie.axes);
  });
});
