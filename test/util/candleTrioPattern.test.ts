/**
 * The three-candle formations (#739, #740, #741, #742).
 *
 * These are the last of the family and the only ones that need two candles
 * behind the cursor. Each is the request's own arithmetic, with `1` the
 * earliest of the three and `3` the candle the cursor is on.
 *
 * Two thresholds had to be chosen rather than transcribed, and both are
 * choices worth seeing:
 *
 * - **#739's "large" and "small" bodies.** The request suggests measuring them
 *   against recent candle size, ATR-style. That needs a lookback window the
 *   chart does not state, and would leave the first candles of any chart
 *   unreadable. A body against its **own range** says the same thing about
 *   each candle — decisive, or not — and needs nothing beyond the three the
 *   pattern is about. 0.6 of the range for the outer two, 0.3 for the middle.
 * - **#740's "small shadows throughout"**, which the request leaves without a
 *   figure and asks for one. 0.15 of the range, and only on the *leading*
 *   side: a soldier that rose and left a long wick above it gave the gain
 *   back before the close, which is the opposite of the steady control the
 *   name is about.
 *
 * Both travel in {@link CandleShapeThresholds} so a caller can disagree.
 */

import { describe, expect, it } from '@jest/globals';
import {
  candleTrioPatterns,
  DEFAULT_CANDLE_SHAPE_THRESHOLDS,
} from '@util/candlePattern';

describe('the three-candle formations', () => {
  it('names a morning star', () => {
    // A decisive fall, a pause clear below it, then a decisive rise back
    // through the middle of the first candle's body at 110.
    expect(candleTrioPatterns(
      { open: 120, high: 121, low: 99, close: 100 },
      { open: 95, high: 96, low: 90, close: 94 },
      { open: 100, high: 116, low: 99, close: 115 },
    )).toEqual(['morning star']);
  });

  it('names an evening star', () => {
    expect(candleTrioPatterns(
      { open: 100, high: 121, low: 99, close: 120 },
      { open: 125, high: 130, low: 124, close: 126 },
      { open: 120, high: 121, low: 104, close: 105 },
    )).toEqual(['evening star']);
  });

  it('names three white soldiers', () => {
    // Each closes higher, each opens inside the body before it, and none
    // leaves more than a token wick above.
    expect(candleTrioPatterns(
      { open: 100, high: 110.5, low: 99, close: 110 },
      { open: 105, high: 115.5, low: 104, close: 115 },
      { open: 112, high: 122.5, low: 111, close: 122 },
    )).toEqual(['three white soldiers']);
  });

  it('names three black crows', () => {
    expect(candleTrioPatterns(
      { open: 110, high: 111, low: 99.5, close: 100 },
      { open: 105, high: 106, low: 94.5, close: 95 },
      { open: 100, high: 101, low: 89.5, close: 90 },
    )).toEqual(['three black crows']);
  });

  it('declines soldiers that gave the gain back before the close', () => {
    // The same three, with a wick of 3 over the last one against a range of
    // 14. It still closed highest; it did not hold the high while doing it.
    expect(candleTrioPatterns(
      { open: 100, high: 110.5, low: 99, close: 110 },
      { open: 105, high: 115.5, low: 104, close: 115 },
      { open: 112, high: 125, low: 111, close: 122 },
    )).toEqual([]);
  });

  it('names an upside Tasuki gap that held', () => {
    // Two rising candles with a gap from 111 to 114 between them, then a fall
    // that opens inside the second body and closes at 113 — inside the gap,
    // but above the first candle's high, so the gap survives.
    expect(candleTrioPatterns(
      { open: 100, high: 111, low: 99, close: 110 },
      { open: 115, high: 126, low: 114, close: 125 },
      { open: 120, high: 121, low: 112, close: 113 },
    )).toEqual(['upside tasuki gap']);
  });

  it('names the same gap as filled when the fall closes through it', () => {
    // Identical but for the close: 108 is under the first candle's high of
    // 111, so nothing of the gap is left. Both names are returned by the same
    // rule rather than one being a flag on the other, because which of the
    // two it is *is* the finding.
    expect(candleTrioPatterns(
      { open: 100, high: 111, low: 99, close: 110 },
      { open: 115, high: 126, low: 114, close: 125 },
      { open: 120, high: 121, low: 107, close: 108 },
    )).toEqual(['upside tasuki gap filled']);
  });

  it('names three inside down', () => {
    // The turn is tucked inside the rise's body, then confirmed lower.
    expect(candleTrioPatterns(
      { open: 100, high: 121, low: 99, close: 120 },
      { open: 115, high: 116, low: 104, close: 105 },
      { open: 105, high: 106, low: 97, close: 98 },
    )).toEqual(['three inside down']);
  });

  it('names three outside down', () => {
    // The turn swallows the rise instead of hiding in it.
    expect(candleTrioPatterns(
      { open: 100, high: 111, low: 99, close: 110 },
      { open: 112, high: 113, low: 97, close: 98 },
      { open: 98, high: 99, low: 89, close: 90 },
    )).toEqual(['three outside down']);
  });

  it('cannot call one trio both inside and outside down', () => {
    // Inside needs the turn's open at or under the rise's close; outside
    // needs it above. Checked rather than assumed.
    const inside = candleTrioPatterns(
      { open: 100, high: 121, low: 99, close: 120 },
      { open: 115, high: 116, low: 104, close: 105 },
      { open: 105, high: 106, low: 97, close: 98 },
    );
    const outside = candleTrioPatterns(
      { open: 100, high: 111, low: 99, close: 110 },
      { open: 112, high: 113, low: 97, close: 98 },
      { open: 98, high: 99, low: 89, close: 90 },
    );

    expect(inside).not.toContain('three outside down');
    expect(outside).not.toContain('three inside down');
  });

  it('answers by the thresholds it is given', () => {
    // The morning star's middle candle, fattened to a body of 2.5 against a
    // range of 6. Past the default 0.3, inside a caller's 0.5.
    const trio = [
      { open: 120, high: 121, low: 99, close: 100 },
      { open: 95, high: 96, low: 90, close: 92.5 },
      { open: 100, high: 116, low: 99, close: 115 },
    ] as const;

    expect(candleTrioPatterns(...trio)).toEqual([]);
    expect(candleTrioPatterns(...trio, {
      ...DEFAULT_CANDLE_SHAPE_THRESHOLDS,
      starSmallBody: 0.5,
    })).toEqual(['morning star']);
  });

  it('says nothing about three ordinary candles', () => {
    expect(candleTrioPatterns(
      { open: 100, high: 105, low: 99, close: 104 },
      { open: 104, high: 108, low: 103, close: 102 },
      { open: 102, high: 106, low: 101, close: 105 },
    )).toEqual([]);
  });
});
