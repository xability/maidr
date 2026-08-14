import type { HexbinPoint } from '@type/grammar';
import { bindD3Hexbin } from '@adapters/d3/binders/hexbin';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds a `d3-hexbin` bin: an array of the points that fell in the hexagon,
 * carrying its centre as `.x`/`.y` — which is where the count comes from too,
 * since the bin's `length` is it.
 */
function bin(x: number, y: number, count: number): number[] {
  const points = Array.from({ length: count }, (_, index) => index);
  return Object.assign(points, { x, y });
}

/**
 * Builds an SVG holding one `path.hexagon` per bin, in the order given — which
 * for `d3-hexbin` is the order the bins were generated in, not the lattice's.
 */
function buildHexbinSvg(bins: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="hex-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of bins) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'hexagon');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

/**
 * A lattice whose bins are NOT drawn row by row, and whose top row is short —
 * an empty bin has no hexagon at all, which is the ordinary case.
 */
const SCATTERED = [
  bin(2, 10, 4),
  bin(1.5, 20, 7),
  bin(0, 10, 1),
  bin(1, 10, 3),
  bin(0.5, 20, 2),
];

describe('bindD3Hexbin', () => {
  test('groups the bins into lattice rows, bottom row first', () => {
    const svg = buildHexbinSvg(SCATTERED);

    const result = bindD3Hexbin(svg, {
      selector: 'path.hexagon',
      title: 'Point Density',
      axes: { x: 'X', y: 'Y', fill: 'Count' },
    });

    expect(result.layer.type).toBe(TraceType.HEXBIN);
    const data = result.layer.data as HexbinPoint[][];
    // `HexbinTrace` steps its row index UP for an upward move, so row 0 has to
    // be the bottom of the chart; within a row the index is the position.
    expect(data).toEqual([
      [
        { x: 0, y: 10, count: 1 },
        { x: 1, y: 10, count: 3 },
        { x: 2, y: 10, count: 4 },
      ],
      [
        { x: 0.5, y: 20, count: 2 },
        { x: 1.5, y: 20, count: 7 },
      ],
    ]);
  });

  test('reads the centre through the inverse scales it is given', () => {
    // `d3-hexbin` bins the PROJECTED points, so a bin's centre is a pixel.
    const svg = buildHexbinSvg([bin(100, 300, 5), bin(200, 300, 2)]);

    const result = bindD3Hexbin(svg, {
      selector: 'path.hexagon',
      x: d => (d as { x: number }).x / 10,
      y: d => 40 - (d as { y: number }).y / 10,
    });

    const data = result.layer.data as HexbinPoint[][];
    expect(data).toEqual([[
      { x: 10, y: 10, count: 5 },
      { x: 20, y: 10, count: 2 },
    ]]);
  });

  test('emits one selector per bin, in the payload\'s lattice order', () => {
    const svg = buildHexbinSvg(SCATTERED);

    const result = bindD3Hexbin(svg, { selector: 'path.hexagon' });

    // A bare selector would resolve in DOM order — the order the plugin
    // generated the bins in — and the count would still match, so the trace
    // could not tell it was lighting the wrong hexagons.
    const selectors = result.layer.selectors as string[];
    expect(selectors).toHaveLength(5);
    const counts = selectors.map((one) => {
      const element = svg.ownerDocument.querySelector(one);
      return (element as unknown as { __data__: { length: number } }).__data__.length;
    });
    expect(counts).toEqual([1, 3, 4, 2, 7]);
  });

  test('a rebind clears stamps left on MAIDR-owned clones', () => {
    const svg = buildHexbinSvg(SCATTERED);
    bindD3Hexbin(svg, { selector: 'path.hexagon' });

    // MAIDR clones a mark to highlight it, and the clone copies the stamp the
    // bind just laid down. `queryD3Elements` skips owned elements, so the
    // clone never joins the payload — but the emitted
    // `path.hexagon[data-maidr-hexbin-index="N"]` does not exclude it, so on a
    // rebind that index would resolve to two hexagons: the real one and the
    // clone. The count of selectors still matches the count of bins, so
    // nothing downstream can tell.
    const original = svg.querySelector('path.hexagon')!;
    const clone = original.cloneNode(true) as Element;
    clone.setAttribute('data-maidr-owned', 'true');
    svg.appendChild(clone);
    expect(clone.getAttribute('data-maidr-hexbin-index')).not.toBeNull();

    const result = bindD3Hexbin(svg, { selector: 'path.hexagon' });

    const selectors = result.layer.selectors as string[];
    expect(selectors).toHaveLength(5);
    for (const one of selectors) {
      expect(svg.ownerDocument.querySelectorAll(one)).toHaveLength(1);
    }
    expect(clone.hasAttribute('data-maidr-hexbin-index')).toBe(false);
  });

  test('groups by an explicit `row` accessor when the y values do not line up', () => {
    const svg = buildHexbinSvg([
      Object.assign([0], { x: 3, y: 10.0001, row: 0 }),
      Object.assign([0, 1], { x: 1, y: 9.9998, row: 0 }),
      Object.assign([0], { x: 2, y: 20.5, row: 1 }),
    ]);

    const result = bindD3Hexbin(svg, { selector: 'path.hexagon', row: 'row' });

    const data = result.layer.data as HexbinPoint[][];
    expect(data).toHaveLength(2);
    expect(data[0].map(hexagon => hexagon.x)).toEqual([1, 3]);
  });

  test('scopes a single bin with one selector', () => {
    const svg = buildHexbinSvg([bin(1, 1, 2)]);

    const result = bindD3Hexbin(svg, { selector: 'path.hexagon' });

    expect(result.layer.selectors).toBe('#hex-svg path.hexagon');
  });

  test('says where the three numbers live when one cannot be read', () => {
    const svg = buildHexbinSvg([{ cx: 1, cy: 2 }]);

    expect(() => bindD3Hexbin(svg, { selector: 'path.hexagon' }))
      .toThrow(/has no count/);
  });

  test('throws an actionable error when the selector matches no hexagons', () => {
    const svg = buildHexbinSvg(SCATTERED);

    expect(() => bindD3Hexbin(svg, { selector: 'polygon.hex' })).toThrow(/hexagon/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a Figure that highlights its bins', () => {
    const svg = buildHexbinSvg(SCATTERED);
    const result = bindD3Hexbin(svg, {
      selector: 'path.hexagon',
      title: 'Point Density',
      axes: { x: 'X', y: 'Y', fill: 'Count' },
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.HEXBIN]);
    });
  });
});
