/**
 * @jest-environment jsdom
 */

/**
 * A candlestick's highlight grid is built by writing every cell.
 *
 * `mapToSvgElements` used to pre-fill the derived-edge arrays and every cell
 * of the grid with a hidden `<rect>` from `Svg.createEmptyElement`, then
 * overwrite all of them: at 200 candles that was 1800 elements built and
 * discarded per construction, and `Context.replaceFigure` rebuilds the trace
 * on every live-data append. The rows are only safe to leave empty while
 * every cell is still written, which is what these tests pin -- the count
 * alone would be satisfied by a grid with a hole in it, and a hole is a
 * segment the reader silently loses the highlight on.
 */

import type { CandlestickSelector, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Candlestick, candlestickSectionsOf } from '@model/candlestick';
import { TraceType } from '@type/grammar';
import { Svg } from '@util/svg';

const SVG_NS = 'http://www.w3.org/2000/svg';
const N = 200;

/**
 * A chart of `count` candles.
 * @param count - How many candles
 * @param withOpen - Whether every candle states an open, which is what gives
 *   the chart an `open` row
 * @returns The layer, without selectors
 */
function candles(count: number, withOpen: boolean): Omit<MaidrLayer, 'selectors'> {
  return {
    id: 'candlestick',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: Array.from({ length: count }, (_, i) => ({
      value: `d${i}`,
      ...(withOpen ? { open: 10 + (i % 3) } : {}),
      high: 15,
      low: 9,
      close: 14,
      volume: 1,
      volatility: 6,
    })),
  } as Omit<MaidrLayer, 'selectors'>;
}

/**
 * Reads the grid a trace built.
 * @param trace - The candlestick
 * @returns Its highlight grid
 */
function gridOf(trace: Candlestick): unknown[][] {
  return (trace as unknown as { highlightValues: unknown[][] }).highlightValues;
}

describe('a candlestick highlight grid', () => {
  beforeEach(() => {
    // jsdom lays nothing out, so the bodies are measured by hand.
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      value: () => ({ x: 0, y: 0, width: 2, height: 4 }),
      configurable: true,
    });
    document.body.innerHTML = `<svg xmlns="${SVG_NS}">${
      '<rect class="body" x="0" y="0" width="2" height="4" />'.repeat(N)}</svg>`;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
    document.body.innerHTML = '';
  });

  // Every shape `mapToSvgElements` can be handed, so the "no cell is left
  // undefined" claim is made about all of them and not only the common one.
  const shapes: [name: string, count: number, withOpen: boolean, selectors: string | string[] | CandlestickSelector][] = [
    ['structured selectors', N, true, { body: '.body' }],
    ['structured selectors, no open row', N, false, { body: '.body' }],
    ['structured selectors matching nothing', N, true, { body: '.nowhere' }],
    ['a legacy single selector', N, true, '.body'],
    ['a legacy selector array', N, true, ['.body']],
    ['one candle', 1, true, { body: '.body' }],
    ['one candle, legacy', 1, true, '.body'],
    ['no candles', 0, true, { body: '.body' }],
    ['no candles, legacy', 0, true, '.body'],
  ];

  test.each(shapes)('fills every cell with %s', (_name, count, withOpen, selectors) => {
    const layer = { ...candles(count, withOpen), selectors } as MaidrLayer;
    const rows = candlestickSectionsOf(layer.data as never).length;

    const trace = new Candlestick(layer);
    const grid = gridOf(trace);

    expect(grid).toHaveLength(rows);
    for (const row of grid) {
      expect(row).toHaveLength(count);
      for (const cell of row) {
        expect(cell).toBeDefined();
        expect(cell).not.toBeNull();
      }
    }

    trace.dispose();
  });

  test('a fully selectored chart derives its edges and builds no placeholder', () => {
    const empty = jest.spyOn(Svg, 'createEmptyElement');

    const trace = new Candlestick({
      ...candles(N, true),
      selectors: { body: '.body' },
    } as MaidrLayer);

    expect(empty).toHaveBeenCalledTimes(0);
    trace.dispose();
  });

  test('a chart whose selectors match nothing builds one placeholder per cell and no more', () => {
    const empty = jest.spyOn(Svg, 'createEmptyElement');

    const trace = new Candlestick({
      ...candles(N, true),
      selectors: { body: '.nowhere' },
    } as MaidrLayer);
    const grid = gridOf(trace);

    // One per cell: five rows of 200, and nothing spare.
    expect(empty).toHaveBeenCalledTimes(grid.length * N);
    trace.dispose();
  });
});
