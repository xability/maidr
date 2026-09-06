/**
 * Bin bounds a pre-aggregated d3 histogram never stated.
 *
 * Without `xMin`/`xMax` accessors and without `x0`/`x1` on the datum, the
 * binder treats the bin as a zero-width point at the x value — which works
 * while that value is a number. Pre-aggregated histogram data very often
 * carries a string bin label instead (`{ label: '0-10', count: 5 }` bound with
 * `x: 'label'`), and `Number('0-10')` is `NaN`.
 *
 * `HistogramPoint` declares both bounds as numbers, and `Histogram.text` puts
 * them straight into the range it announces on every arrow keypress, with
 * `description` repeating them in the bin-range stat and two data-table
 * columns. The reader heard a NaN bin range for every bin, and nothing
 * anywhere said the bounds were never known — so the failure is invisible to
 * the author too.
 */
import type { HistogramPoint } from '@type/grammar';
import { bindD3Histogram } from '@adapters/d3/binders/histogram';
import { describe, expect, test } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG holding one `rect.bar` per datum, bound the way a join leaves it.
 * @param data - The data to bind, one datum per bar
 * @returns The SVG root
 */
function buildSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="hist"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'bar');
    (rect as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(rect);
  }
  return svg;
}

const LABELLED = [
  { label: '0-10', count: 5 },
  { label: '10-20', count: 9 },
];

describe('a d3 histogram whose bins carry no numeric bounds', () => {
  test('says which accessors are missing instead of announcing NaN', () => {
    const svg = buildSvg(LABELLED);

    expect(() => bindD3Histogram(svg, {
      selector: 'rect.bar',
      x: 'label',
      y: 'count',
    })).toThrow(/xMin.*xMax|`xMin`/s);
  });

  test('names the keys the datum does carry, so the fix is obvious', () => {
    const svg = buildSvg(LABELLED);

    expect(() => bindD3Histogram(svg, {
      selector: 'rect.bar',
      x: 'label',
      y: 'count',
    })).toThrow(/label, count/);
  });

  test('reads the bounds the caller supplies', () => {
    const svg = buildSvg(LABELLED);

    const layer = bindD3Histogram(svg, {
      selector: 'rect.bar',
      x: 'label',
      y: 'count',
      xMin: (datum: unknown) => Number((datum as { label: string }).label.split('-')[0]),
      xMax: (datum: unknown) => Number((datum as { label: string }).label.split('-')[1]),
    }).layer;

    const points = layer.data as HistogramPoint[];
    expect(points.map(point => [point.xMin, point.xMax])).toEqual([[0, 10], [10, 20]]);
  });

  test('still reads a numeric bin label as a zero-width bin', () => {
    const svg = buildSvg([{ x: 3, y: 7 }]);

    const points = bindD3Histogram(svg, { selector: 'rect.bar' }).layer.data as HistogramPoint[];

    expect(points[0]).toEqual({ x: 3, y: 7, xMin: 3, xMax: 3, yMin: 0, yMax: 7 });
  });
});
