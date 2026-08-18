/**
 * What these tests protect.
 *
 * A box plot is the one chart Plot draws that has no mark of its own: `boxY` is
 * a `rule`, a `bar`, a `tick` and a `dot`, and the DOM says nothing about their
 * belonging together (#1074). Recognising them is `boxComposites`' job and is
 * covered in `converters.test.ts`; what is checked here is the reading — that
 * the five numbers announced for each category are the five the chart was drawn
 * from, that they land in the right fields, and that each of them highlights
 * the element it describes.
 *
 * Every value comes back through the scale from a pixel, so a field swapped for
 * its neighbour produces a schema that is well-formed and wrong. The assertions
 * are therefore on the numbers themselves, computed from the fixture's geometry
 * rather than restated from the code.
 */

import type { BoxPoint, BoxSelector } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

/**
 * Reads a fixture's first box layer.
 *
 * @param key - The fixture to mount.
 * @returns The layer, or `undefined` when the chart produced none.
 */
function boxLayer(
  key: 'boxPlot' | 'boxHorizontal' | 'facetedBox' | 'boxTails' | 'boxesOnBaseline',
): {
  data: BoxPoint[];
  selectors: BoxSelector[];
  orientation?: Orientation;
} | undefined {
  const { element } = mountFixture(key);
  const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
  if (!layer)
    return undefined;
  return {
    data: layer.data as BoxPoint[],
    selectors: layer.selectors as BoxSelector[],
    orientation: layer.orientation,
  };
}

describe('reading a box plot', () => {
  it('recovers each category\'s five-number summary', () => {
    // Read off the fixture's own geometry. Category A's box spans y 291.71 to
    // 335.46 on a scale running [2, 40] over pixels [370, 20], which is 5.75
    // to 10.5; its median tick sits at 314.74, which is 8; and its whisker runs
    // 360.79 to 277.89, which is 3 to 12.
    const layer = boxLayer('boxPlot');

    expect(layer?.data).toEqual([
      { z: 'A', lowerOutliers: [], min: 3, q1: 5.75, q2: 8, q3: 10.5, max: 12, upperOutliers: [40] },
      { z: 'B', lowerOutliers: [], min: 2, q1: 4, q2: 5.5, q3: 8.25, max: 9, upperOutliers: [30] },
    ]);
  });

  it('reads the transposed chart as the same distribution', () => {
    // `boxHorizontal` is the same data drawn with `boxX`: every part is rotated,
    // the band scale moves from x to y, and the whiskers run left to right
    // instead of bottom to top. The numbers must not move with them.
    const vertical = boxLayer('boxPlot');
    const horizontal = boxLayer('boxHorizontal');

    expect(horizontal?.orientation).toBe(Orientation.HORIZONTAL);
    expect(vertical?.orientation).toBe(Orientation.VERTICAL);
    expect(horizontal?.data).toEqual(vertical?.data);
  });

  it('puts an outlier on the side of the distribution it lies past', () => {
    // Both of this chart's outliers are above their whisker, and an outlier
    // filed under `lowerOutliers` is announced as the bottom of the tail rather
    // than the top of it.
    const layer = boxLayer('boxPlot');

    expect(layer?.data.map(point => point.upperOutliers)).toEqual([[40], [30]]);
    expect(layer?.data.every(point => point.lowerOutliers.length === 0)).toBe(true);
  });

  it('separates the outliers below the whisker from the ones above', () => {
    // The classification compares each outlier against the *lower* whisker end,
    // so a chart whose outliers are all high — which every other fixture is —
    // cannot tell a working split from one that files everything on one side.
    // Here A has an outlier at each end and B has two below its whisker —
    // drawn 14 first, so a tail reported in document order comes out reversed.
    const layer = boxLayer('boxTails');

    expect(layer?.data.map(point => [point.lowerOutliers, point.upperOutliers])).toEqual([
      [[0], [60]],
      [[10, 14], []],
    ]);
  });

  it('still reads a distribution whose every box stands on zero', () => {
    // Counts data with enough zeros puts a real first quartile at zero, and
    // that box then sits on the baseline exactly as a bar would — in every
    // category at once, if the data is zero-heavy throughout. Telling a
    // distribution from a magnitude by where its boxes stand would leave this
    // chart unread, which is why the reading asks Plot what it drew instead.
    const layer = boxLayer('boxesOnBaseline');

    expect(layer?.data.map(point => point.q1)).toEqual([0, 0]);
    expect(layer?.data.map(point => point.q3)).toEqual([6.75, 11.25]);
  });

  it('gives a facet only the outliers drawn in it', () => {
    // Plot emits a facet's `dot` group only where that facet has outliers, so
    // the *female* facet has three marks and the *male* facet four. Pairing the
    // facets by index rather than by offset hands the male facet's outlier to
    // the female one, which then reports a 40 that facet never held.
    const { element } = mountFixture('facetedBox');
    const cells = observablePlotToMaidr(element)?.subplots.flat() ?? [];
    const data = cells.map(cell => cell.layers[0].data as BoxPoint[]);

    expect(data.map(points => points.map(point => point.z))).toEqual([['female'], ['male']]);
    expect(data.map(points => points[0].upperOutliers)).toEqual([[], [40]]);
  });
});

describe('highlighting a box plot', () => {
  it('points each section at the element that draws it', () => {
    // A box's parts are four separate marks, so each section can and should
    // resolve to its own element rather than to the whole box.
    const { element } = mountFixture('boxPlot');
    const maidr = observablePlotToMaidr(element);
    const [first] = maidr?.subplots[0][0].layers[0].selectors as BoxSelector[];

    expect(element.ownerDocument.querySelectorAll(first.iq)).toHaveLength(1);
    expect(element.ownerDocument.querySelector(first.iq)?.tagName.toLowerCase()).toBe('rect');
    expect(element.ownerDocument.querySelector(first.q2)?.tagName.toLowerCase()).toBe('line');
    expect(element.ownerDocument.querySelector(first.min)?.tagName.toLowerCase()).toBe('line');
    expect(first.iq).not.toBe(first.q2);
  });

  it('points the minimum and the maximum at the one line that is the whisker', () => {
    // Plot draws a whisker as a single `<line>` spanning both ends, so there is
    // no separate element for either. Pointing both fields at the line that
    // holds them is what the plotly adapter does for a violin's inner box, and
    // it is a true statement about where the reader is; inserting a second
    // element to split it would mutate the author's chart (#1004).
    const layer = boxLayer('boxPlot');
    const [first] = layer?.selectors ?? [];

    expect(first.min).toBe(first.max);
  });

  it('gives every box its own selectors', () => {
    // One token per layer would stamp every category's box with the same
    // attribute, and each section would then highlight all of them at once.
    const layer = boxLayer('boxPlot');
    const [first, second] = layer?.selectors ?? [];

    expect(first.iq).not.toBe(second.iq);
    expect(first.min).not.toBe(second.min);
  });

  it('points each outlier at the circle holding its own value', () => {
    // The values in a tail are announced smallest first, and the selectors have
    // to be put in the same order or each outlier highlights a different one.
    // Nothing about the payload shows the mismatch: both lists are the right
    // length and hold the right things. B's outliers are 10 and 14 drawn 14
    // first, so document order and value order disagree — and on a vertical
    // chart the larger value is the higher circle, which is the smaller `cy`.
    const { element } = mountFixture('boxTails');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const [, second] = layer?.selectors as BoxSelector[];
    const values = (layer?.data as BoxPoint[])[1].lowerOutliers;
    const heights = second.lowerOutliers.map(selector =>
      Number(element.ownerDocument.querySelector(selector)?.getAttribute('cy')));

    expect(values).toEqual([10, 14]);
    expect(heights[0]).toBeGreaterThan(heights[1]);
  });

  it('gives each outlier a selector of its own', () => {
    const { element } = mountFixture('boxPlot');
    const maidr = observablePlotToMaidr(element);
    const [first] = maidr?.subplots[0][0].layers[0].selectors as BoxSelector[];

    expect(first.upperOutliers).toHaveLength(1);
    expect(element.ownerDocument.querySelector(first.upperOutliers[0])?.tagName.toLowerCase())
      .toBe('circle');
  });
});

describe('declining a box plot that cannot be paired up', () => {
  it.each(['barRangeAndTarget', 'bulletChart', 'floatingRangeBar'] as const)(
    'leaves %s alone when its parts only look like a box',
    (key) => {
      // Both satisfy every geometric relation a box plot's parts have: the tick
      // lies inside the bar, the rule runs along it and past both ends. Read as
      // a box they announce the bar's height as the third quartile and the
      // target line as the median — numbers that are quartiles of nothing.
      //
      // Each defeats a different guess at what a box plot is. The first two
      // stand on the baseline, which is what a magnitude does and a quartile
      // does not; the third does not stand on anything, because a candlestick's
      // body floats exactly as an interquartile box does. All three are drawn
      // in the very order `boxY` emits its parts, which is also the order
      // someone draws them in, so nothing about the arrangement separates them
      // either. What does is that Plot draws a box plot's median twice as thick
      // as an ordinary tick.
      const { element } = mountFixture(key);
      const layers = observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];

      expect(layers.map(layer => layer.type)).not.toContain(TraceType.BOX);
    },
  );

  it('leaves the chart unread when a part sits beyond the last box', () => {
    // Recognition asks whether every *box* has a median, not whether every
    // median has a box, so an extra tick drawn past the last category leaves
    // the composite recognised. Pairing the sorted parts by position would
    // match the two boxes to the first two ticks and drop the third without
    // noticing — a mark of the chart silently unaccounted for. Counting first
    // is what turns that into a refusal.
    const { element, svg } = mountFixture('boxPlot');
    const ticks = svg.querySelector('g[aria-label="tick"]');
    const stray = ticks?.firstElementChild?.cloneNode(true) as Element;
    stray.setAttribute('x1', '600');
    stray.setAttribute('x2', '620');
    ticks?.appendChild(stray);

    expect(observablePlotToMaidr(element)).toBeNull();
  });

  it('leaves the chart unread when a part has no partner', () => {
    // Recognition asks whether *some* median crosses each box, so a stray tick
    // that happens to cross one leaves the composite recognised while there is
    // no longer a median per box. Reading it anyway would pair the parts by
    // position and hand a category the wrong one; declining puts the chart back
    // where it was before this was read at all, which is the safe direction.
    const { element, svg } = mountFixture('boxPlot');
    const ticks = svg.querySelector('g[aria-label="tick"]');
    const stray = ticks?.firstElementChild?.cloneNode(true) as Element;
    stray.setAttribute('y1', '300');
    stray.setAttribute('y2', '300');
    ticks?.appendChild(stray);

    expect(observablePlotToMaidr(element)).toBeNull();
  });
});
