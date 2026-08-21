/**
 * The shape a single candle is drawn in (#731, #732, #733).
 *
 * A candlestick chart carries two things at every session: the four prices,
 * which the trace already announces, and the shape they draw — a cross, a
 * solid block, a small body between two long wicks. The second is what a
 * sighted reader takes in at a glance and a listener would otherwise have to
 * reconstruct by holding four numbers in their head and dividing.
 *
 * Every case below is worked from the request's own arithmetic:
 *
 *   range = high - low        body  = |close - open|
 *   upper = high - max(o, c)  lower = min(o, c) - low
 *
 * Three of them are decisions rather than transcriptions, and each is
 * asserted so it cannot drift:
 *
 * - **The tests overlap, and the narrower one wins.** Every doji satisfies the
 *   spinning top's body condition by construction (0.05 of a range is inside
 *   0.33), and a doji with two even wicks satisfies all of it. "Doji" is the
 *   stronger statement about the same candle.
 * - **A candle drawn at one price is a doji, not a dragonfly.** Its range is
 *   zero, so every proportional test is trivially true and the variant rules
 *   would report a rejection of lows that never happened. Open level with
 *   close is the whole of the doji definition, and that much is real.
 * - **It is not a marubozu either**, for the mirror-image reason: `body >=
 *   0.95 * range` reads `0 >= 0` and would call the flattest candle on the
 *   chart the most one-directional one.
 */

import { describe, expect, it } from '@jest/globals';
import { candleShape, DEFAULT_CANDLE_SHAPE_THRESHOLDS } from '@util/candlePattern';

describe('the shape a candle is drawn in', () => {
  it('names a marubozu drawn with no wicks at all', () => {
    // high === close and low === open: the request's "perfect" bullish case.
    expect(candleShape({ open: 10, high: 20, low: 10, close: 20 })).toBe('marubozu');
    // And bearish, which is the same body with open and close swapped.
    expect(candleShape({ open: 20, high: 20, low: 10, close: 10 })).toBe('marubozu');
  });

  it('names a marubozu inside the wick tolerance', () => {
    // range 10.5, body 10, and 10 >= 0.95 * 10.5 = 9.975.
    expect(candleShape({ open: 10, high: 20.3, low: 9.8, close: 20 })).toBe('marubozu');
  });

  it('declines a body that misses the tolerance', () => {
    // range 11.5, body 10, and 0.95 * 11.5 = 10.925. A candle 87% body is a
    // strong one and not a marubozu, and it is nothing else either.
    expect(candleShape({ open: 10, high: 21, low: 9.5, close: 20 })).toBeNull();
  });

  it('names a doji whose wicks reach both ways', () => {
    // range 10, body 0.2; both shadows near 5, so neither variant applies.
    expect(candleShape({ open: 100, high: 105, low: 95, close: 100.2 })).toBe('doji');
  });

  it('names a dragonfly by its one long lower wick', () => {
    // range 8.4, upper 0.4 (<= 0.42), lower 8 (>= 5.04).
    expect(candleShape({ open: 100, high: 100.4, low: 92, close: 100 }))
      .toBe('dragonfly doji');
  });

  it('names a gravestone by its one long upper wick', () => {
    expect(candleShape({ open: 100, high: 108, low: 99.6, close: 100 }))
      .toBe('gravestone doji');
  });

  it('names a spinning top by its small body between even wicks', () => {
    // range 10, body 2 (<= 3.3), both shadows 4 (>= 2), and no gap between
    // them at all.
    expect(candleShape({ open: 100, high: 106, low: 96, close: 102 }))
      .toBe('spinning top');
  });

  it('declines a small body whose wicks are lopsided', () => {
    // The clause that separates a spinning top from a hammer-shaped candle:
    // body 2, upper 6, lower 2, and |6 - 2| = 4 is past 0.15 * 10.
    expect(candleShape({ open: 100, high: 108, low: 98, close: 102 })).toBeNull();
  });

  it('calls an overlapping candle a doji rather than a spinning top', () => {
    // Satisfies every spinning-top clause -- body 0.2 <= 3.234, both shadows
    // 4.8, no gap -- and is a doji, which says more about the same candle.
    expect(candleShape({ open: 100, high: 105, low: 95.2, close: 100.2 }))
      .toBe('doji');
  });

  it('calls a candle drawn at a single price a plain doji', () => {
    // Range zero. Not a dragonfly and not a gravestone, which each name a
    // long shadow this candle has none of, and not a marubozu.
    expect(candleShape({ open: 50, high: 50, low: 50, close: 50 })).toBe('doji');
  });

  it('leaves an ordinary candle unnamed', () => {
    // range 6, body 4: too small for a marubozu, far too large for a doji or
    // a spinning top. Most candles on most charts are this.
    expect(candleShape({ open: 100, high: 105, low: 99, close: 104 })).toBeNull();
  });

  it('answers by the thresholds it is given', () => {
    const candle = { open: 10, high: 21, low: 9.5, close: 20 };

    // The same candle the tolerance rejected above, accepted once the
    // strictness is relaxed -- which is the whole point of the figures being
    // parameters rather than literals.
    expect(candleShape(candle)).toBeNull();
    expect(candleShape(candle, { ...DEFAULT_CANDLE_SHAPE_THRESHOLDS, marubozuBody: 0.85 }))
      .toBe('marubozu');
  });
});
