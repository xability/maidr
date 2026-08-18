/**
 * Which end of a reversed Highcharts axis a line's `data[0]` sits at (#1007).
 *
 * `convertLineSeries` maps `series.data` and never consulted the axis, so a
 * line on a reversed axis was announced as its own mirror image: every value
 * right, the shape backwards, and with it the stereo pan, the braille line
 * and the direction autoplay sweeps.
 *
 * Measured on Highcharts 12.6 in Chromium, one series `[10, 20, 30]` over
 * `categories: ['alpha','bravo','charlie']`:
 *
 *   chart                     drawn left → right        path `d` vertices
 *   plain                     alpha, bravo, charlie     88, 263, 438
 *   xAxis.reversed            charlie, bravo, alpha     438, 263, 88
 *   numeric xAxis.reversed    2, 1, 0                   521, 263, 5
 *
 * The path is stroked in the *series'* order either way, which is why the
 * payload cannot be reversed on its own: `data[0] = charlie` would pair with
 * the vertex at x=438, where alpha is drawn (the #988 trap). The layer says
 * so with `domMapping.pointOrder`, and `LineTrace` pairs the two back up --
 * `test/model/lineReversedPointOrder.test.ts` covers that half.
 */

import type { LinePoint, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];

/**
 * The layer one line chart converts to.
 *
 * @param options - Which axis the chart declares and how it is drawn
 * @param options.reversed - Whether the x axis declares `reversed`
 * @param options.inverted - Whether the chart is drawn sideways
 * @param options.categories - The axis' categories, `null` for a numeric axis
 * @param options.seriesCount - How many series the chart draws
 * @returns The emitted layer
 */
function layerFor(options: {
  reversed?: boolean;
  inverted?: boolean;
  /** `null` for a numeric axis, which carries no categories at all. */
  categories?: string[] | null;
  seriesCount?: number;
}): MaidrLayer {
  const categories = options.categories === undefined ? CATEGORIES : options.categories;
  const xAxis = fakeAxis({
    categories: categories ?? undefined,
    reversed: options.reversed,
  });
  const chart = fakeChart({
    type: 'line',
    inverted: options.inverted,
    series: Array.from({ length: options.seriesCount ?? 1 }, (_, index) =>
      fakeSeries({
        index,
        type: 'line',
        name: `S${index}`,
        xAxis,
        data: [10, 20, 30].map((y, i) => ({
          x: i,
          y: y + index * 100,
          ...(categories ? { category: categories[i] } : {}),
        })),
      })),
  });

  const maidr = highchartsToMaidr(chart);
  return maidr.subplots[0][0].layers[0];
}

/**
 * The x field of every point of one series.
 *
 * @param layer - The emitted layer
 * @param row - Which series to read
 * @returns The categories, in the order the layer announces them
 */
function categoriesOf(layer: MaidrLayer, row = 0): (string | number)[] {
  return (layer.data as LinePoint[][])[row].map(p => p.x);
}

describe('a highcharts line on a reversed axis', () => {
  it('reads a plain chart in the order it was written', () => {
    const layer = layerFor({});

    expect(layer.type).toBe(TraceType.LINE);
    expect(categoriesOf(layer)).toEqual(CATEGORIES);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads a reversed chart in the order it is drawn', () => {
    const layer = layerFor({ reversed: true });

    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('tells the trace its marks run the other way', () => {
    // Without this the reversed payload would outline the far end of the
    // series -- a worse defect than the direction it fixes.
    expect(layerFor({ reversed: true }).domMapping?.pointOrder).toBe('reverse');
  });

  it('keeps every value with its own category', () => {
    const values = (layerFor({ reversed: true }).data as LinePoint[][])[0];

    expect(values).toEqual([
      { x: 'charlie', y: 30, z: 'S0' },
      { x: 'bravo', y: 20, z: 'S0' },
      { x: 'alpha', y: 10, z: 'S0' },
    ]);
  });

  it('turns every series of a multi-line layer round together', () => {
    const layer = layerFor({ reversed: true, seriesCount: 2 });

    expect(categoriesOf(layer, 0)).toEqual(['charlie', 'bravo', 'alpha']);
    expect(categoriesOf(layer, 1)).toEqual(['charlie', 'bravo', 'alpha']);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('reverses a numeric axis too', () => {
    // The measurement above shows a numeric reversed axis draws right to left
    // the same way a category one does; nothing here is category-specific.
    const layer = layerFor({ reversed: true, categories: null });

    expect(categoriesOf(layer)).toEqual([2, 1, 0]);
  });

  it('leaves an inverted chart alone', () => {
    // Highcharts sets `xAxis.reversed` by itself when it turns a chart
    // sideways, so the flag alone would report every inverted line as
    // reversed. Which end of a sideways line's axis `data[0]` belongs at was
    // not measured, and is left alone rather than guessed at.
    const layer = layerFor({ reversed: true, inverted: true });

    expect(categoriesOf(layer)).toEqual(CATEGORIES);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });
});
