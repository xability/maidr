/**
 * A Vega-Lite heatmap cell no row names (#1191).
 *
 * `extractHeatmapData` builds both axes from the **union** of what the rows
 * mention and then fills a rectangle, so any (x, y) pair the data skips is a
 * hole by construction. The grid was initialised to `0`, which announced a
 * reading for a cell the chart drew nothing in — and made it indistinguishable
 * from one the author genuinely recorded as zero.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { HeatmapData } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

/** A 2x2 grid of labels with only three of the four pairs recorded. */
const SPARSE = [
  { q: 'c1', r: 'top', v: 3 },
  { q: 'c2', r: 'top', v: 4 },
  { q: 'c1', r: 'bottom', v: 5 },
  // ('c2', 'bottom') deliberately absent.
];

const DENSE = [...SPARSE, { q: 'c2', r: 'bottom', v: 0 }];

/**
 * The heatmap grid a set of rows converts to.
 * @param values - The rows the spec carries
 * @returns The emitted `points` grid
 */
function gridFor(values: unknown[]): (number | null)[][] {
  const spec = {
    data: { values },
    mark: 'rect',
    encoding: {
      x: { field: 'q', type: 'nominal' },
      y: { field: 'r', type: 'nominal' },
      color: { field: 'v', type: 'quantitative' },
    },
  } as unknown as VegaLiteSpec;
  return (vegaLiteToMaidr(spec).subplots[0][0].layers[0].data as HeatmapData).points;
}

describe('a vega-lite heatmap whose rows do not fill the grid', () => {
  it('leaves the unnamed cell absent rather than reading it as zero', () => {
    expect(gridFor(SPARSE)).toEqual([[3, 4], [5, null]]);
  });

  it('is no longer indistinguishable from one recording a zero', () => {
    expect(gridFor(DENSE)).toEqual([[3, 4], [5, 0]]);
    expect(gridFor(SPARSE)).not.toEqual(gridFor(DENSE));
  });

  it('treats a row whose colour field is null as a hole too', () => {
    const grid = gridFor([...SPARSE, { q: 'c2', r: 'bottom', v: null }]);

    // `Number(null)` is `0`, so the old spelling turned a stated absence into
    // a stated zero on the way through.
    expect(grid[1][1]).toBeNull();
  });
});
