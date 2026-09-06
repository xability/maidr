/**
 * @jest-environment jsdom
 */

/**
 * A candlestick derives the open and close edges it was given no selector for
 * by drawing a line along the body, and `Svg.createLineElements` inserts that
 * line into the chart. On a chart whose candles do not
 * all state an open there is no `open` row (#1188), so a derived open edge has
 * no row to be placed in: it was inserted, referenced by nothing, and left
 * behind by `dispose()` -- one hidden `<line>` per opened candle per focus
 * cycle, for the lifetime of the page.
 */

import type { MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const BODY = '.body';

/** How many MAIDR-owned elements the document holds right now. */
function ownedCount(): number {
  return document.querySelectorAll('[data-maidr-owned]').length;
}

/**
 * Two of three candles state an open, so the chart reads as high-low-close
 * and has no `open` row -- but each of the two still has a body to derive an
 * open edge from.
 */
const layer: Omit<MaidrLayer, 'selectors'> = {
  id: 'test-candlestick',
  type: TraceType.CANDLESTICK,
  axes: { x: { label: 'Date' }, y: { label: 'Price' } },
  data: [
    { value: 'd0', open: 10, high: 15, low: 9, close: 14, volume: 1, volatility: 6 },
    { value: 'd1', high: 16, low: 12, close: 13, volume: 1, volatility: 4 },
    { value: 'd2', open: 13, high: 14, low: 10, close: 11, volume: 1, volatility: 4 },
  ],
};

describe('a candlestick without an open row', () => {
  beforeEach(() => {
    // jsdom lays nothing out, so the body has no measured box to draw along.
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      value: () => ({ x: 0, y: 0, width: 2, height: 4 }),
      configurable: true,
    });
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${
      '<rect class="body" x="0" y="0" width="2" height="4" />'.repeat(3)}</svg>`;
  });

  afterEach(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
    document.body.innerHTML = '';
  });

  test('disposing removes every element it inserted beside the bodies', () => {
    const trace = TraceFactory.create({ ...layer, selectors: { body: BODY } });
    const inserted = ownedCount();

    trace.dispose();

    expect(inserted).toBeGreaterThan(0);
    expect(ownedCount()).toBe(0);
  });
});
