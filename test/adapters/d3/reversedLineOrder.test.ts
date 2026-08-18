/**
 * A d3 line or area drawn right to left has to be read that way (#1044).
 *
 * `buildLineLayer` reads each series' bound datum and emits its points in the
 * array's order. `d3.line()` walks that same array and writes its vertices in
 * the same order — so when the scale runs the other way (`range([350, 50])`,
 * a reversed domain, or data simply listed newest-first) both come out back to
 * front and MAIDR walks the chart from the far end.
 *
 * Measured on real d3 7 in Chromium, `scalePoint` over four categories, driven
 * through `bindD3Line` / `bindD3Area`:
 *
 *   chart                     payload   path vertices          circles
 *   line, range([50, 350])    A,B,C,D   50, 150, 250, 350      the same
 *   line, range([350, 50])    A,B,C,D   350, 250, 150, 50      the same
 *   area, range([350, 50])    A,B,C,D   350, 250, 150, 50, …   (none drawn)
 *   connected scatter         1,3,2,4   110, 230, 170, 290     the same
 *
 * Both halves move together, so the highlight lands on the right mark; what is
 * wrong is that the walk runs opposite to the drawing. And note the contrast
 * with Vega-Lite (#1042), which is what decides the shape of the fix: Vega
 * sorts* a line's vertices into drawn order, so its payload had to be
 * permuted with no `pointOrder`. `d3.line()` does not sort, so d3 takes the
 * ordinary shape — reverse the payload and declare
 * `domMapping.pointOrder: 'reverse'`.
 *
 * The binders never see a scale: the caller passes selectors and accessors,
 * not `d3.scaleLinear()`. The rendered `d` answers anyway, which is the move
 * `drawsCategoriesReversed` makes for Google Charts (#1040) — ask where the
 * marks landed rather than what the author asked for.
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { bindD3Area } from '@adapters/d3/binders/area';
import { bindD3Line, bindD3Radar } from '@adapters/d3/binders/line';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The categories in the order the datum lists them. */
const LISTED = ['A', 'B', 'C', 'D'];
/** The same categories in the order a right-to-left chart draws them. */
const DRAWN = ['D', 'C', 'B', 'A'];

const POINTS = [
  { cat: 'A', val: 10 },
  { cat: 'B', val: 40 },
  { cat: 'C', val: 20 },
  { cat: 'D', val: 30 },
];

/**
 * An SVG holding one `path.series` per series, each carrying its bound point
 * array and the `d` d3 would have written for it.
 * @param series - One point array per series
 * @param xsFor - The vertex x's for series `row`, in the order written
 * @returns The SVG element
 */
function svgFor(
  series: { cat: string | number; val: number }[][],
  xsFor: (row: number) => number[],
): SVGElement {
  const dom = new JSDOM('<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="line-svg"></svg>');
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  series.forEach((points, row) => {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'series');
    const xs = xsFor(row);
    path.setAttribute(
      'd',
      xs.map((x, at) => `${at === 0 ? 'M' : 'L'}${x},${100 - at}`).join(''),
    );
    (path as unknown as { __data__: unknown }).__data__ = points;
    svg.appendChild(path);
  });
  return svg;
}

/** The x's d3 writes for a series drawn from the near end, or the far one. */
function run(count: number, reversed: boolean): number[] {
  return Array.from(
    { length: count },
    (_, at) => (reversed ? 350 - at * 100 : 50 + at * 100),
  );
}

/** The x values of one series of a line-shaped layer. */
function seriesX(layer: MaidrLayer, at = 0): (string | number)[] {
  return (layer.data as LinePoint[][])[at].map(point => point.x);
}

const CONFIG = {
  selector: 'path.series',
  title: 'Sales',
  axes: { x: 'Category', y: 'Value' },
  x: 'cat',
  y: 'val',
};

describe('d3 right-to-left line order', () => {
  it('leaves a line drawn from the near end in the datum order', () => {
    const svg = svgFor([POINTS], () => run(4, false));
    const layer = bindD3Line(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads a line drawn from the far end from the left of the chart', () => {
    const svg = svgFor([POINTS], () => run(4, true));
    const layer = bindD3Line(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('reads an area the same way, past the edge it closes back along', () => {
    // `d3.area()` runs out along the top and back along the baseline, so the
    // whole vertex list doubles back while the half that matters does not.
    // Only the leading `row.length` are read — the same ones
    // `reconcilePathCoordinates` keeps to build the highlight from.
    const svg = svgFor([POINTS], () => [...run(4, true), ...run(4, false)]);
    const layer = bindD3Area(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe('area');
    expect(seriesX(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('leaves a connected scatter alone, where neither end is the drawn order', () => {
    const svg = svgFor([POINTS], () => [110, 230, 170, 290]);
    const layer = bindD3Line(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('leaves one alone that merely ends left of where it started', () => {
    // `290, 170, 230, 110` finishes to the left of its first point but rises
    // in between, so comparing only the two ends would call it right-to-left
    // and turn a path that doubles back over. It is the run as a whole that
    // has to never go back on itself.
    const svg = svgFor([POINTS], () => [290, 170, 230, 110]);
    const layer = bindD3Line(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads a staircase, whose treads repeat an x without doubling back', () => {
    // A survival curve is one of these: `50,150,150,250` never goes back on
    // itself, so the run is still descending when it is drawn the other way.
    const svg = svgFor([POINTS], () => [350, 250, 250, 150]);
    const layer = bindD3Line(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns a multi-series layer over only when every series agrees', () => {
    const second = POINTS.map(point => ({ ...point, val: point.val / 2 }));
    const agreed = svgFor([POINTS, second], () => run(4, true));
    const both = bindD3Line(agreed, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(both, 0)).toEqual(DRAWN);
    expect(seriesX(both, 1)).toEqual(DRAWN);

    // One series drawn each way is not a reversed axis, and turning only one
    // over would put the two series' column `c` at opposite ends of the chart.
    const split = svgFor([POINTS, second], row => run(4, row === 0));
    const layer = bindD3Line(split, CONFIG).maidr.subplots[0][0].layers[0];
    expect(seriesX(layer, 0)).toEqual(LISTED);
    expect(seriesX(layer, 1)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('leaves a radar alone: its x is an angle, not a position on an axis', () => {
    const svg = svgFor([POINTS], () => run(4, true));
    const layer = bindD3Radar(svg, CONFIG).maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe('radar');
    expect(seriesX(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });
});
