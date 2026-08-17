/**
 * A Vega-Lite `stack: "normalize"` bar carries shares, not raw values (#965).
 *
 * `stack: "normalize"` is an instruction to *Vega-Lite* to divide at render
 * time, so `data.values` holds the raw numbers by definition and the shares
 * exist only on screen. The core divides nothing itself — fed one payload,
 * `NORMALIZED` and `STACKED` announce identically — so the reader was pitched
 * the counts across a chart whose columns are all the same height.
 *
 * The bands arrive grouped by colour rather than aligned by category, which is
 * why the totals are taken by the category's own value; the last case here is
 * the one that would fail if they were paired by position instead.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { SegmentedPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * The bands a stacked spec converts to.
 * @param values - The spec's data rows
 * @param stack - What the y encoding declares
 * @returns The emitted `SegmentedPoint[][]`
 */
function bandsOf(
  values: Record<string, unknown>[],
  stack: 'normalize' | 'zero' = 'normalize',
): SegmentedPoint[][] {
  const layer = vegaLiteToMaidr({
    data: { values },
    mark: 'bar',
    encoding: {
      x: { field: 'q', type: 'nominal' },
      y: { field: 'v', type: 'quantitative', stack },
      color: { field: 's', type: 'nominal' },
    },
  } as unknown as VegaLiteSpec).subplots[0][0].layers[0];
  return layer.data as SegmentedPoint[][];
}

/** Counts whose shares differ from them, so the two cannot be confused. */
const UNEVEN = [
  { q: 'Q1', s: 'A', v: 1 },
  { q: 'Q1', s: 'B', v: 1 },
  { q: 'Q2', s: 'A', v: 300 },
  { q: 'Q2', s: 'B', v: 100 },
];

describe('a normalized vega-lite bar', () => {
  it('divides each category by its own total', () => {
    // Q1 is 50/50 and Q2 is 75/25. Before the fix these were 1, 300, 1, 100.
    const [first, second] = bandsOf(UNEVEN);

    expect(first.map(point => point.y)).toEqual([50, 75]);
    expect(second.map(point => point.y)).toEqual([50, 25]);
  });

  it('makes every category sum to 100', () => {
    const bands = bandsOf(UNEVEN);

    const totals = bands[0].map(
      (_, index) => bands.reduce((sum, band) => sum + Number(band[index].y), 0),
    );
    expect(totals).toEqual([100, 100]);
  });

  it('keeps the band names on their own values', () => {
    const [first, second] = bandsOf(UNEVEN);

    expect(first[0].z).toBe('A');
    expect(second[0].z).toBe('B');
  });

  it('totals by category rather than by position', () => {
    // Series B skips Q1 entirely, so the two bands are no longer the same
    // length and B's only point sits at index 0 of its own array. Pairing by
    // index would divide Q2's 100 by Q1's total of 5.
    const bands = bandsOf([
      { q: 'Q1', s: 'A', v: 5 },
      { q: 'Q2', s: 'A', v: 100 },
      { q: 'Q2', s: 'B', v: 100 },
    ]);

    const a = bands.find(band => band[0].z === 'A') ?? [];
    const b = bands.find(band => band[0].z === 'B') ?? [];
    // Q1 has only A, so A takes all of it; Q2 splits evenly.
    expect(a.map(point => point.y)).toEqual([100, 50]);
    expect(b.map(point => point.y)).toEqual([50]);
  });

  it('leaves a category of nothing alone rather than dividing by zero', () => {
    const bands = bandsOf([
      { q: 'Q1', s: 'A', v: 0 },
      { q: 'Q1', s: 'B', v: 0 },
    ]);

    expect(bands.every(band => band.every(point => point.y === 0))).toBe(true);
  });
});

describe('a plain stacked vega-lite bar is untouched', () => {
  it('keeps the values it was given', () => {
    const [first, second] = bandsOf(UNEVEN, 'zero');

    expect(first.map(point => point.y)).toEqual([1, 300]);
    expect(second.map(point => point.y)).toEqual([1, 100]);
  });

  it('is still announced as a stack', () => {
    const layer = vegaLiteToMaidr({
      data: { values: UNEVEN },
      mark: 'bar',
      encoding: {
        x: { field: 'q', type: 'nominal' },
        y: { field: 'v', type: 'quantitative', stack: 'zero' },
        color: { field: 's', type: 'nominal' },
      },
    } as unknown as VegaLiteSpec).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.STACKED);
  });
});
