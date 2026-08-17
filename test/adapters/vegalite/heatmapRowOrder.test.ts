/**
 * A Vega-Lite heatmap's rows follow the axis, not the data (#977).
 *
 * `extractHeatmapData` built both axes from the order the rows happened to
 * arrive in. Vega sorts a nominal domain rather than keeping that order, so
 * unless the author listed their data already sorted, the announced grid was
 * not the drawn one — every value still on its own label, but the reader's
 * sense of which row sits above which taken from nothing in particular.
 *
 * Measured by compiling this very spec and running it through Vega, with rows
 * listed `zebra, apple, mango`:
 *
 *   view.scale('y').domain()  ->  ['apple', 'mango', 'zebra']
 *   y('apple') =   0   <- top
 *   y('mango') = 100
 *   y('zebra') = 200   <- bottom
 *
 * So Vega draws `domain[0]` at the **top**, which is the order `HeatmapData`
 * asks for. Nothing is reversed here — unlike plotly (#972), Highcharts (#975)
 * and Chart.js (#976), whose libraries all count from the bottom.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { HeatmapData } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

/** Rows listed out of sorted order, so the two orders are distinguishable. */
const ROWS = [
  { q: 'c1', r: 'zebra', v: 1 },
  { q: 'c2', r: 'zebra', v: 2 },
  { q: 'c1', r: 'apple', v: 3 },
  { q: 'c2', r: 'apple', v: 4 },
  { q: 'c1', r: 'mango', v: 5 },
  { q: 'c2', r: 'mango', v: 6 },
];

/** What Vega resolved for this spec, top to bottom. */
const DRAWN = ['apple', 'mango', 'zebra'];

const SPEC = {
  data: { values: ROWS },
  mark: 'rect',
  encoding: {
    x: { field: 'q', type: 'nominal' },
    y: { field: 'r', type: 'nominal' },
    color: { field: 'v', type: 'quantitative' },
  },
} as unknown as VegaLiteSpec;

/**
 * A compiled view that answers for the named scales and throws otherwise,
 * which is what Vega itself does for a scale that is not in scope.
 * @param domains - The domain to report per scale name
 * @returns The stub view
 */
function viewWith(domains: Record<string, unknown[]>): VegaView {
  return {
    scale: (name: string) => {
      if (!(name in domains))
        throw new Error(`Unrecognized scale or projection: ${name}`);
      return { domain: () => domains[name] };
    },
  } as unknown as VegaView;
}

/**
 * The heatmap data a spec converts to.
 * @param view - The compiled view, when the caller supplied one
 * @returns The emitted data
 */
function dataFor(view?: VegaView): HeatmapData {
  return vegaLiteToMaidr(SPEC, view).subplots[0][0].layers[0].data as HeatmapData;
}

describe('a vega-lite heatmap with its view', () => {
  it('orders the rows as the chart draws them', () => {
    // Before the fix this was ['zebra', 'apple', 'mango'] — the rows' order,
    // which is not the axis at all.
    expect(dataFor(viewWith({ y: DRAWN, x: ['c1', 'c2'] })).y).toEqual(DRAWN);
  });

  it('does not reverse: Vega already draws the first domain value at the top', () => {
    // The sibling adapters reverse. This one must not, or it would undo a
    // correct order. 'apple' is the top row and leads the payload.
    expect(dataFor(viewWith({ y: DRAWN, x: ['c1', 'c2'] })).y[0]).toBe('apple');
  });

  it('carries each value onto its own row', () => {
    const { y, points } = dataFor(viewWith({ y: DRAWN, x: ['c1', 'c2'] }));

    expect(points[y.indexOf('apple')]).toEqual([3, 4]);
    expect(points[y.indexOf('mango')]).toEqual([5, 6]);
    expect(points[y.indexOf('zebra')]).toEqual([1, 2]);
  });

  it('orders the columns from the x scale too', () => {
    expect(dataFor(viewWith({ y: DRAWN, x: ['c2', 'c1'] })).x).toEqual(['c2', 'c1']);
  });

  it('honours a sort the encoding asked for, whatever it was', () => {
    // The point of reading the view rather than sorting here: `sort` can name
    // another field or give a list, and only Vega knows how it resolved.
    const descending = ['zebra', 'mango', 'apple'];

    expect(dataFor(viewWith({ y: descending, x: ['c1', 'c2'] })).y).toEqual(descending);
  });
});

describe('a vega-lite heatmap without a view', () => {
  it('falls back to the order the rows arrived in', () => {
    // Nothing to ask, so the rows' own order is the best guess available.
    expect(dataFor().y).toEqual(['zebra', 'apple', 'mango']);
  });

  it('still pairs every value with its label', () => {
    const { y, points } = dataFor();

    expect(points[y.indexOf('apple')]).toEqual([3, 4]);
    expect(points[y.indexOf('zebra')]).toEqual([1, 2]);
  });
});

describe('a domain that names more than this layer draws', () => {
  it('still orders the rows it does draw, dropping the rest', () => {
    // A scale shared across a composite spec is the ordinary case, and it is
    // still authoritative about the relative order of these three.
    const shared = [...DRAWN, 'kiwi'];

    expect(dataFor(viewWith({ y: shared, x: ['c1', 'c2'] })).y).toEqual(DRAWN);
  });
});

describe('a domain that is missing one of the rows', () => {
  it('is ignored rather than dropping a row the chart shows', () => {
    expect(dataFor(viewWith({ y: ['apple', 'mango'], x: ['c1', 'c2'] })).y).toEqual([
      'zebra',
      'apple',
      'mango',
    ]);
  });
});
