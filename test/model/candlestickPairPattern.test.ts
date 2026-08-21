/**
 * The two-candle patterns reach the announcement (#735, #736, #737, #738).
 *
 * `candlePairPatterns` decides the names; these cases are about where they
 * land and what they sit beside. They travel as asides alongside the candle's
 * own shape, which is the field for facts that are neither axis — and unlike
 * the shape there may be more than one at a time, because two of these can be
 * true of one pair without either being the other said more precisely.
 *
 * The first candle of a chart has nothing before it, so it carries none.
 */

import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import type { Ohlc } from '@util/candlePattern';
import { describe, expect, it } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A candle carrying whatever prices a case needs.
 *
 * `trend` and `volatility` are placeholders: the model recomputes both.
 *
 * @param value - The x label
 * @param ohlc  - The four prices
 * @returns A candlestick point
 */
function candle(value: string, ohlc: Ohlc): CandlestickPoint {
  return { value, ...ohlc, trend: 'Neutral', volatility: 0 };
}

/**
 * The trace over a series of candles, positioned on the first.
 *
 * @param prices - The candles' prices in x order
 * @returns A candlestick trace
 */
function trace(prices: Ohlc[]): Candlestick {
  const layer: MaidrLayer = {
    id: 'candle',
    type: TraceType.CANDLESTICK,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: prices.map((ohlc, index) => candle(`d${index}`, ohlc)),
  };
  return new Candlestick(layer);
}

/**
 * What a trace announces as asides after stepping `steps` candles forward.
 *
 * The first `FORWARD` is the trace's initial entry and lands on the candle
 * the cursor already reports, so it is spent before any stepping begins.
 *
 * @param subject - The trace to read
 * @param steps   - How many candles to advance
 * @returns The aside label/value pairs, or undefined when there are none
 */
function asidesAt(
  subject: Candlestick,
  steps: number,
): { label: string; value: string }[] | undefined {
  subject.moveOnce('FORWARD');
  for (let i = 0; i < steps; i++) {
    subject.moveOnce('FORWARD');
  }
  const state = subject.state as Extract<TraceState, { empty: false }>;
  return state.text.asides;
}

/** A bearish candle, no named shape of its own. */
const FELL: Ohlc = { open: 110, high: 112, low: 98, close: 100 };
/** Swallows {@link FELL}'s body whole, with its low well clear of it. */
const ENGULFS: Ohlc = { open: 99, high: 112, low: 90, close: 111 };
/** An unremarkable candle after it. */
const ORDINARY: Ohlc = { open: 111, high: 115, low: 110, close: 114 };

describe('a candlestick announces what a candle makes of the one before it', () => {
  it('says nothing about the first candle, which has no previous', () => {
    expect(asidesAt(trace([FELL, ENGULFS, ORDINARY]), 0)).toBeUndefined();
  });

  it('names the engulfing on the candle that does it', () => {
    expect(asidesAt(trace([FELL, ENGULFS, ORDINARY]), 1))
      .toEqual([{ label: 'pattern', value: 'bullish engulfing' }]);
  });

  it('says nothing about an ordinary pair', () => {
    expect(asidesAt(trace([FELL, ENGULFS, ORDINARY]), 2)).toBeUndefined();
  });

  it('announces the shape and the pattern together when both hold', () => {
    // A doji whose low sits on the previous candle's: its own shape, and what
    // it makes of the one before it. Two different facts, both true, and the
    // shape is named first because it is about the candle the cursor is on.
    const doji: Ohlc = { open: 105, high: 112, low: 98, close: 105.2 };

    expect(asidesAt(trace([FELL, doji]), 1)).toEqual([
      { label: 'shape', value: 'doji' },
      { label: 'pattern', value: 'tweezer bottom' },
    ]);
  });
});
