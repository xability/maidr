/**
 * Which end of a reversed Highcharts category axis `data[0]` sits at (#995).
 *
 * `buildSegmentedRows` places each value under its own category index, which is
 * what makes Highcharts immune to the data-order bug plotly (#987) and
 * Vega-Lite (#994) have. But the categories are the *axis'*, and `xAxis.
 * reversed` draws `categories[0]` at the right-hand end — so the announcements
 * ran the opposite way from the bars.
 *
 * Measured on Highcharts 12 in Chromium, `categories: ['alpha','bravo',
 * 'charlie']`, reading each rendered point's own box:
 *
 *   chart                            xAxis.reversed   drawn left → right
 *   {type:'column'}                  undefined        alpha@105, bravo@313, charlie@522
 *   {type:'column'} + reversed       true             charlie@105, bravo@313, alpha@522
 *   stacked column + reversed        true             charlie@127, bravo@335, alpha@544
 *
 * MAIDR announced `alpha, bravo, charlie` in all three.
 *
 * The DOM does **not** move with the axis. The same measurement, reading the
 * elements in document order rather than by position:
 *
 *   column plain      h105@105  h210@313  h315@522
 *   column reversed   h105@522  h210@313  h315@105
 *
 * That is why both halves have to move together. Reversing the rows alone
 * would leave `data[0] = charlie` pointing at `DOM[0] = alpha`'s bar — trading
 * a correct highlight for a wrong one, which is worse than the direction bug
 * it set out to fix (the #988 trap).
 *
 * Two things the fixture has to imitate, both measured rather than assumed:
 *
 *   series [10, null, 0, 40]   →  3 elements, at the alpha, charlie and delta
 *                                 slots. A `null` renders nothing; a genuine
 *                                 `0` renders an element.
 *
 * So a DOM position is a count of *drawn* points, not of categories, and a
 * group with a gap has no element for some cell to name.
 */

import type { BarPoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];
const CONTAINER = 'reversed-bar';

/** The selector prefix every emitted bar selector shares. */
const GROUP = `#${CONTAINER} .highcharts-series-group`;

/**
 * Points for a category series, carrying nulls through as Highcharts does.
 * @param values - One value per category, `null` for a category not drawn
 * @returns Points positioned by category index
 */
function points(values: (number | null)[]): { x: number; y: number | null; category: string }[] {
  return values.map((y, i) => ({ x: i, y, category: CATEGORIES[i] }));
}

/**
 * The layer one chart converts to.
 * @param input          - The series values, one array per series
 * @param reversed       - Whether the category axis declares `reversed`
 * @param type           - The series type the chart declares
 * @param stacking       - How the series stack, if they do
 * @returns The emitted layer
 */
function layerFor(
  input: (number | null)[][],
  reversed: boolean,
  type: 'bar' | 'column' = 'column',
  stacking?: string,
): MaidrLayer {
  const xAxis = fakeAxis({ categories: CATEGORIES, reversed });
  const chart = fakeChart({
    type,
    renderToId: CONTAINER,
    plotOptions: stacking ? { series: { stacking } } : undefined,
    series: input.map((values, index) => fakeSeries({
      index,
      type,
      xAxis,
      data: points(values),
    })),
  });

  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer;
}

/** The category each row of a segmented layer announces, in order. */
function categoriesOf(layer: MaidrLayer): unknown[] {
  return (layer.data as SegmentedPoint[][])[0].map(cell => cell.x);
}

describe('a Highcharts bar chart on a reversed category axis', () => {
  it('leaves an ordinary column chart in the data\'s order', () => {
    const layer = layerFor([[10, 20, 30]], false);

    expect((layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['alpha', 'bravo', 'charlie']);
    expect(layer.selectors).toBe(`${GROUP} .highcharts-series-0 .highcharts-point`);
  });

  it('reads a reversed column chart the way it is drawn', () => {
    const layer = layerFor([[10, 20, 30]], true);

    expect((layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('names each bar so the reversed reading still outlines its own bar', () => {
    // The half that reversing the data alone would get wrong: the DOM stays in
    // data order, so `data[0] = charlie` has to name the *third* element.
    const layer = layerFor([[10, 20, 30]], true);

    expect(layer.selectors).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('counts a bar\'s position among the bars actually drawn', () => {
    // `bravo` is null, so Highcharts draws two elements and `charlie` is the
    // second — not the third its category index would suggest.
    const layer = layerFor([[10, null, 30]], true);

    expect((layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['charlie', 'alpha']);
    expect(layer.selectors).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('leaves a sideways chart alone', () => {
    // Highcharts sets `xAxis.reversed` itself on every chart it draws
    // sideways, so the flag cannot separate those from a column chart whose
    // author asked for a reversal. The resolved orientation can, since #997 —
    // and which end of a horizontal bar's category axis `data[0]` belongs at
    // is a convention `MaidrLayer.orientation` does not fix.
    const layer = layerFor([[10, 20, 30]], true, 'bar');

    expect((layer.data as BarPoint[]).map(point => point.y))
      .toEqual(['alpha', 'bravo', 'charlie']);
    expect(layer.selectors).toBe(`${GROUP} .highcharts-series-0 .highcharts-point`);
  });
});

describe('a segmented Highcharts bar group on a reversed category axis', () => {
  it('leaves an unreversed stacked group in the data\'s order', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], false, 'column', 'normal');

    expect(categoriesOf(layer)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(layer.selectors).toBe(
      `${GROUP} .highcharts-series-0 .highcharts-point, `
      + `${GROUP} .highcharts-series-1 .highcharts-point`,
    );
  });

  it('reads a reversed stacked group the way it is drawn', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true, 'column', 'normal');

    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.data as SegmentedPoint[][])[1].map(cell => cell.y))
      .toEqual([3, 2, 1]);
  });

  it('names one element per cell, per series', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true, 'column', 'normal');

    expect(layer.selectors).toEqual([
      [
        `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
        `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
        `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
      ],
      [
        `${GROUP} .highcharts-series-1 .highcharts-point:nth-child(3)`,
        `${GROUP} .highcharts-series-1 .highcharts-point:nth-child(2)`,
        `${GROUP} .highcharts-series-1 .highcharts-point:nth-child(1)`,
      ],
    ]);
  });

  it('counts a genuine zero, which Highcharts does draw', () => {
    // The distinction the DOM positions turn on. A zero-valued cell still has
    // an element, so it takes a place and everything after it keeps counting
    // past it — addressing by non-zero cells instead would shift `alpha` and
    // `bravo` onto each other's bars.
    const layer = layerFor([[10, 0, 30], [1, 2, 3]], true, 'column', 'normal');

    expect((layer.selectors as string[][])[0]).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('leaves a group with a gap as it was', () => {
    // No element exists for the cell `bravo` would need, and `SegmentedTrace`
    // rejects a whole grid when one cell resolves to nothing — which would
    // cost the layer its highlight entirely. Reading backwards is the lesser
    // failure, so the group is left alone rather than half-fixed.
    const layer = layerFor([[10, null, 30], [1, 2, 3]], true, 'column', 'normal');

    expect(categoriesOf(layer)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(typeof layer.selectors).toBe('string');
  });

  it('reads a reversed dodged group the way it is drawn', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true);

    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.selectors as string[][])[1][0])
      .toBe(`${GROUP} .highcharts-series-1 .highcharts-point:nth-child(3)`);
  });

  it('reads a reversed diverging pair the way it is drawn', () => {
    // Two series that never share a side of the baseline are drawn back to
    // back; the payload is the segmented one, so the reversal reaches it too.
    const layer = layerFor([[10, 20, 30], [-1, -2, -3]], true, 'column', 'normal');

    // Asserted so the case cannot quietly become another stacked one: the
    // pair is only diverging while the two series stay on opposite sides.
    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.data as SegmentedPoint[][])[1].map(cell => cell.y))
      .toEqual([-3, -2, -1]);
  });
});
