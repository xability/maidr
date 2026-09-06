/**
 * A d3 candlestick chart drawn from OHLC alone.
 *
 * `CandlestickPoint.volume` is optional precisely so "absent" and "zero" stay
 * distinguishable, and `Candlestick.description` renders `c.volume ?? ''` — a
 * blank cell for a period the chart never stated a volume for. The binder
 * coerced a missing volume to `0`, so a chart drawn from
 * `{date, open, high, low, close}` produced a data table whose Volume column
 * read 0 for every period. A reader quotes that back as "no shares traded"
 * rather than "the chart never said". Two sibling adapters (amCharts, Google
 * Charts) already leave it undefined.
 */
import type { CandlestickPoint } from '@type/grammar';
import { bindD3Candlestick } from '@adapters/d3/binders/candlestick';
import { describe, expect, test } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG holding one `g.candle` per period, bound the way a join leaves it.
 * @param data - The data to bind, one datum per candle
 * @returns The SVG root
 */
function buildSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="ohlc"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'candle');
    (group as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(group);
  }
  return svg;
}

const OHLC = [
  { date: '2024-01-02', open: 10, high: 12, low: 9, close: 11 },
  { date: '2024-01-03', open: 11, high: 13, low: 10, close: 10 },
];

const CONFIG = {
  selector: 'g.candle',
  value: 'date',
} as const;

describe('a d3 candlestick chart with no volume column', () => {
  test('leaves the volume out rather than reporting none traded', () => {
    const svg = buildSvg(OHLC);

    const points = bindD3Candlestick(svg, CONFIG).layer.data as CandlestickPoint[];

    expect(points.map(point => point.volume)).toEqual([undefined, undefined]);
    expect(Object.hasOwn(points[0], 'volume')).toBe(false);
  });

  test('keeps a stated volume of zero, which is a reading', () => {
    const svg = buildSvg([{ ...OHLC[0], volume: 0 }, { ...OHLC[1], volume: 4200 }]);

    const points = bindD3Candlestick(svg, CONFIG).layer.data as CandlestickPoint[];

    expect(points.map(point => point.volume)).toEqual([0, 4200]);
  });
});
