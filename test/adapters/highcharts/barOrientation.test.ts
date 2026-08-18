/**
 * Which way a Highcharts bar chart is drawn (#997).
 *
 * `convertBarSeries` treated `chart.inverted` as a modifier on the series
 * type, flipping a `bar` series (already sideways) back to vertical. Highcharts
 * does not compose the two: `type: 'bar'` *is* `column` with `inverted` set, so
 * the flag is the same one rather than a second one.
 *
 * Measured on Highcharts 12 in Chromium, `categories: ['alpha','bravo',
 * 'charlie']`, one series `[10, 20, 30]`, reading each rendered point's own
 * box:
 *
 *   chart options                    chart.inverted   left → right                       top → bottom
 *   {type:'column'}                  false            alpha@105, bravo@313, charlie@522   charlie@210, bravo@263, alpha@315
 *   {type:'column', inverted:true}   true             charlie@59, bravo@174, alpha@290    charlie@333, bravo@431, alpha@529
 *   {type:'bar'}                     true             charlie@59, bravo@174, alpha@290    charlie@333, bravo@431, alpha@529
 *   {type:'bar', inverted:true}      true             charlie@59, bravo@174, alpha@290    charlie@333, bravo@431, alpha@529
 *
 * The last three are identical to the pixel. Only the fourth was announced as
 * vertical, and the whole payload followed it — orientation, which field held
 * the category, and which axis carried which label:
 *
 *   {type:'bar', inverted:true}   orientation vert   data[0] {x:'alpha', y:10}   axes.x Fruit, axes.y Count
 *
 * Nothing was silent and no magnitude was a string, so this is not the
 * r-maidr #184 failure. It is a faithful description of the *transposed*
 * chart: announced as a vertical bar plot, arrowed left and right through
 * categories that run down the page.
 *
 * All four rows are covered rather than the broken one alone: the old flip and
 * the fix agree on three of them, so a test for `bar + inverted` by itself
 * would pass against a fix that got the others wrong.
 *
 * A segmented layer is covered for the same reason one level up.
 * `convertBarSeries` resolves the orientation once and hands it to all three
 * builders, so a test exercising only `convertSingleBar` would pass against a
 * fix applied in the wrong place. Measured, the segmented paths carry it too:
 *
 *   stacked bar             horz   {x:10, y:'alpha', z:'A'}   correct
 *   stacked bar + inverted  vert   {x:'alpha', y:10, z:'A'}   wrong
 *   dodged bar              horz   {x:10, y:'alpha', z:'A'}   correct
 *   dodged bar + inverted   vert   {x:'alpha', y:10, z:'A'}   wrong
 */

import type { BarPoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';
import { categoryPoints, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];

/**
 * The layer one bar chart converts to.
 * @param type     - The series type the chart declares
 * @param inverted - Whether the chart declares `chart.inverted`
 * @returns The emitted layer
 */
function barLayer(type: 'bar' | 'column', inverted?: boolean): MaidrLayer {
  const chart = fakeChart({
    type,
    inverted,
    series: [fakeSeries({
      index: 0,
      type,
      data: categoryPoints([10, 20, 30], CATEGORIES),
    })],
  });
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

/**
 * The layer a two-series bar chart converts to.
 * @param type     - The series type the chart declares
 * @param inverted - Whether the chart declares `chart.inverted`
 * @param stacking - How the series stack, if they do
 * @returns The emitted layer
 */
function segmentedLayer(
  type: 'bar' | 'column',
  inverted?: boolean,
  stacking?: string,
): MaidrLayer {
  const chart = fakeChart({
    type,
    inverted,
    plotOptions: stacking ? { series: { stacking } } : undefined,
    series: [10, 1].map((scale, index) => fakeSeries({
      index,
      type,
      data: categoryPoints([10, 20, 30].map(v => v * scale / 10), CATEGORIES),
    })),
  });
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

describe('how a Highcharts bar chart says which way it is drawn', () => {
  it('reads a column chart as upright', () => {
    expect(barLayer('column').orientation).toBe(Orientation.VERTICAL);
  });

  it('reads an inverted column chart as sideways', () => {
    expect(barLayer('column', true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('reads a bar chart as sideways', () => {
    expect(barLayer('bar').orientation).toBe(Orientation.HORIZONTAL);
  });

  it('reads an inverted bar chart as sideways too', () => {
    // The row that was wrong. `inverted` is not a second flip: Highcharts
    // draws this identically to `{type: 'bar'}`, measured to the pixel.
    expect(barLayer('bar', true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('puts the magnitude where the orientation says it is', () => {
    // The orientation is not just an announcement: `MaidrLayer.orientation`'s
    // contract has the bar family swap `x` and `y`, so getting it wrong moves
    // the category and the magnitude into each other's fields.
    const points = barLayer('bar', true).data as BarPoint[];

    expect(points[0]).toEqual({ x: 10, y: 'alpha' });
  });

  it('says the same for a stacked layer', () => {
    // `convertBarSeries` resolves the orientation once and hands it to all
    // three builders, so a fix applied inside `convertSingleBar` alone would
    // leave these reading the transposed chart.
    expect(segmentedLayer('bar', true, 'normal').orientation)
      .toBe(Orientation.HORIZONTAL);
  });

  it('says the same for a dodged layer', () => {
    expect(segmentedLayer('bar', true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('puts a segmented cell\'s magnitude where the orientation says it is', () => {
    const rows = segmentedLayer('bar', true, 'normal').data as SegmentedPoint[][];

    expect(rows[0][0]).toEqual({ x: 10, y: 'alpha', z: 'Series 0' });
  });
});
