/**
 * A hexbin is a lattice of counts, and the author is the one who says so (#1084).
 *
 * The extraction needs no colour and no approximation: the bin's centre is its
 * `transform`, and its count is the hexagon's radius through the `r` scale.
 * What cannot be read off the markup is *that it is a hexbin* — the marks
 * arrive labelled `dot` like any scatter's, and Plot's own `symbol: 'hexagon'`
 * draws the identical path shape at a different radius.
 *
 * So this is the one reading here that is declared rather than detected, using
 * the `markTypes` option that already exists for the same problem on a binned
 * rect. The shape is still checked: a declaration pointing at marks that are
 * not hexagons is declined rather than read as a lattice of invented counts.
 */

import type { HexbinPoint, MaidrLayer } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layerOf(
  key: Parameters<typeof mountFixture>[0],
  declared = true,
): MaidrLayer | null {
  const { element } = mountFixture(key);
  const maidr = observablePlotToMaidr(element, {
    ...(declared ? { markTypes: { dot: TraceType.HEXBIN } } : {}),
  });
  return maidr?.subplots[0][0].layers[0] ?? null;
}

describe('a hexbin the author has declared', () => {
  it('is read as a lattice of bins rather than as a dot plot', () => {
    expect(layerOf('hexbin')?.type).toBe(TraceType.HEXBIN);
  });

  it('recovers each bin\'s count from the size of its hexagon', () => {
    // Three clusters of 5, 2 and 9 points. The counts come back exactly:
    // Plot sizes a bin by a square-root scale, so 10·√(5/9) = 7.454 and
    // 10·√(2/9) = 4.714 are the drawn radii, and inverting returns integers.
    const rows = layerOf('hexbin')?.data as HexbinPoint[][];

    expect(rows.flat().map(bin => bin.count)).toEqual([5, 9, 2]);
  });

  it('leaves a tally that is genuinely not a whole number alone', () => {
    // Sized by the MEAN of a fractional weight rather than by a count, so the
    // bins hold 0.4 and 2.9. `HexbinPoint.count` is documented as a tally of
    // points, which is why a near-integer is rounded to one — but `r` need not
    // be a count, and rounding these would report 0 and 3.
    const rows = layerOf('meanHexbin')?.data as HexbinPoint[][];

    expect(rows.flat().map(bin => bin.count).sort((a, b) => a - b)).toEqual([0.4, 2.9]);
  });

  it('groups the bins into lattice rows, bottom row first', () => {
    // `HexbinTrace` steps its row index upward, and a hex lattice's rows share
    // a y pixel exactly — so they are grouped on the pixel rather than on the
    // inverted value, and the grouping is exact instead of tolerant.
    const rows = layerOf('hexbin')?.data as HexbinPoint[][];

    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.length)).toEqual([1, 1, 1]);
    // Ascending y, since the lowest row is announced first.
    const ys = rows.map(row => Number(row[0].y));
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('places each bin at its lattice centre, not at a data point', () => {
    // A bin's centre is where the lattice put it, which is the honest answer:
    // the observations behind it are at neither end of that hexagon.
    const rows = layerOf('hexbin')?.data as HexbinPoint[][];

    expect(Number(rows[0][0].x)).toBeCloseTo(0.72, 1);
    expect(Number(rows[0][0].y)).toBeCloseTo(1.16, 1);
  });
});

/**
 * Reads the hexbin fixture with one cell redrawn along `d`.
 *
 * Its scales and its other cells stay as Plot drew them; only the shape
 * changes, which is how a path Plot would never produce can still be put in
 * front of the check that has to refuse it.
 */
function readingOf(d: string): unknown {
  const { element, svg } = mountFixture('hexbin');
  svg.querySelector('g[aria-label="dot"] path')?.setAttribute('d', d);
  return observablePlotToMaidr(element, { markTypes: { dot: TraceType.HEXBIN } });
}

describe('a hexbin nobody declared', () => {
  it('is left as the dot plot the markup says it is', () => {
    // Without the declaration there is nothing to distinguish it, and reading
    // it as a scatter announces positions that are really lattice centres —
    // which is wrong, but is the reading the markup supports and the one this
    // adapter gave before. Only the author can say otherwise.
    expect(layerOf('hexbin', false)?.type).toBe(TraceType.SCATTER);
  });

  it('declines a declaration pointing at marks of the wrong shape', () => {
    // A bubble chart drawn with `symbol: 'diamond'`: paths, in a group
    // labelled `dot`, and it has an r scale — everything a hexbin has except
    // six-sided marks. Read as one, every bubble's radius would be announced
    // as a bin tally.
    expect(layerOf('diamondBubble')).toBeNull();
  });

  it('declines six vertices that are not a hexagon\'s', () => {
    // Hand-written, because no Plot symbol has six vertices without being a
    // regular hexagon — the diamond above has four, a triangle three, a star
    // ten. It pins the check anyway: without it any six-sided path would have
    // a tally read off its widest point, which is a number about its shape
    // rather than about the data.
    // Its top vertex is far outside where a hexagon of this width puts one,
    // so no tolerance admits it.
    expect(readingOf('M0,-9L6,-5L7,4L0,20L-6,5L-7,-4Z')).toBeNull();
  });

  it('declines a hexagon\'s vertices buried in a longer path', () => {
    // The six points a hexagon of radius 10 has, plus others. Each expected
    // vertex is found, so the position check alone passes — the count is what
    // says this is not a hexagon but some shape that happens to touch one.
    expect(readingOf(
      'M0,11.547L5,9L10,5.774L10,0L10,-5.774L0,-11.547L-5,-9L-10,-5.774L-10,5.774Z',
    )).toBeNull();
  });

  it('declines a declaration pointing at marks that are not a hexbin', () => {
    // `symbol: 'hexagon'` draws the same shape, so the shape alone cannot
    // refuse it — but a scatter has no `r` scale, so there is no count to
    // read, and announcing one would be inventing it.
    expect(layerOf('hexagonScatter')).toBeNull();
  });
});
