/**
 * A waffle is a bar chart drawn as a count of cells (#1093).
 *
 * Both halves of what it says are written down: the `<pattern>` a path is
 * filled with gives the cell's size, and the path is the outline around the
 * filled cells. So the tally is the outline's area over the cell's, and it
 * needs no colour inversion and no approximation.
 *
 * What is announced is not the tally but the height those cells would have as
 * a solid bar, put back through the scale. The two agree only while a cell is
 * one unit — `unit: 5` draws 12 as 2.4 cells — and going through the scale
 * needs no knowledge of `unit` at all.
 */

import type { BarPoint, SegmentedPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layerOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType; data: unknown } | null {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers[0] ?? null;
}

function barsOf(key: Parameters<typeof mountFixture>[0]): [string, number][] {
  const layer = layerOf(key);
  return (layer?.data as BarPoint[]).map(point => [String(point.x), Number(point.y)]);
}

describe('a waffle chart', () => {
  it('recovers each category\'s tally exactly', () => {
    // 12, 7 and 19 cells. The middle one ends on a partial row, so its outline
    // is a staircase rather than a rectangle — which the area reads without
    // caring, where counting whole rows would not.
    expect(layerOf('waffle')?.type).toBe(TraceType.BAR);
    expect(barsOf('waffle')).toEqual([['A', 12], ['B', 7], ['C', 19]]);
  });

  it('reads the horizontal form with the same arithmetic', () => {
    // `Plot.waffleX` lays its cells along the band instead of stacking them up
    // it, so every outline is a plain rectangle. Nothing about the reading
    // changes: the area over the cell is still the tally.
    //
    // A horizontal layer carries its magnitude in `x` and its category in `y`,
    // which is what `orientation` means, so the pair is read the other way
    // round here rather than the values being different.
    const layer = layerOf('waffleRow');

    expect(layer?.type).toBe(TraceType.BAR);
    expect((layer?.data as BarPoint[]).map(point => [String(point.y), Number(point.x)]))
      .toEqual([['A', 12], ['B', 7], ['C', 19]]);
  });

  it('leaves a tally that is genuinely fractional alone', () => {
    // Half a cell is drawn as half a cell. Rounding these to whole numbers
    // would report 3 and 4 for a chart holding 2.5 and 4.
    expect(barsOf('fractionalWaffle')).toEqual([['A', 2.5], ['B', 4]]);
  });

  it('reads a value whose cells are worth more than one', () => {
    // `unit: 5` makes each cell five units, so the raw cell counts here are
    // 2.4, 1.4 and 3.8. Announcing those would be announcing fractions of a
    // cell as though they were the data; going through the scale instead
    // returns what the axis shows, and never has to learn what `unit` was.
    expect(barsOf('unitWaffle')).toEqual([['A', 12], ['B', 7], ['C', 19]]);
  });

  it('measures the lattice across the mark, not off the first path it meets', () => {
    // 2 and 17, in that order. The first category holds less than one row, so
    // its own outline is two cells wide where the lattice is three — and a
    // width taken from it would divide every tally on the chart by the wrong
    // number. Some category always fills a row, because Plot sizes the lattice
    // to the largest value.
    expect(barsOf('partialWaffle')).toEqual([['A', 2], ['B', 17]]);
  });

  it('turns away an outline drawn in more than one piece', () => {
    // Hand-edited, because a waffle draws its filled cells as one closed
    // region and Plot gives no way to ask for two. It pins the check anyway:
    // the area of a vertex list spanning two subpaths is the area of neither,
    // and a tally read off it is a number about the parse rather than about
    // the chart.
    const { element, svg } = mountFixture('waffle');
    svg.querySelector('g[aria-label="waffle"] path')
      ?.setAttribute('d', 'M0,0L165.789,0L165.789,-110.526ZM0,-110.526L55.263,-110.526L55.263,-165.789Z');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    // The edited path is dropped and the two intact ones still read.
    expect((layer?.data as BarPoint[]).map(point => [String(point.x), Number(point.y)]))
      .toEqual([['B', 7], ['C', 19]]);
  });

  it('announces a category holding nothing as a zero', () => {
    // Plot still draws the empty category — `M0,0L0,0…Z`, every vertex on the
    // origin — so it is a bar of zero rather than a bar that was never drawn.
    // Dropping it would leave a reader arrowing from B to C past a category
    // the chart shows and never hearing it.
    expect(barsOf('zeroWaffle')).toEqual([['A', 0], ['B', 7], ['C', 12]]);
  });

  it.each([
    // Not a reference at all, so there is no lattice to look up.
    { fill: 'steelblue', why: 'a plain colour' },
    // A reference that resolves to nothing. Falling back to whichever pattern
    // is nearest would divide this path's area by a cell it was not drawn on,
    // which is a tally about some other category.
    { fill: 'url(#plot-pattern-nowhere)', why: 'a reference to no pattern' },
  ])('turns away a path filled with $why', ({ fill }) => {
    const { element, svg } = mountFixture('waffle');
    svg.querySelector('g[aria-label="waffle"] path')?.setAttribute('fill', fill);
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    expect((layer?.data as BarPoint[]).map(point => [String(point.x), Number(point.y)]))
      .toEqual([['B', 7], ['C', 19]]);
  });

  it('reads a waffle split by fill as a stack of its segments', () => {
    // A `fill` puts one path per segment in the same band, each with its own
    // pattern — and the series colour is on the pattern's swatch rather than
    // on the path, which carries only `url(#…)`.
    const layer = layerOf('stackedWaffle');
    const rows = layer?.data as SegmentedPoint[][];

    expect(layer?.type).toBe(TraceType.STACKED);
    expect(rows.map(row => row.map(point => [String(point.x), Number(point.y)])))
      .toEqual([[['A', 5], ['B', 3]], [['A', 7], ['B', 4]]]);
  });
});
