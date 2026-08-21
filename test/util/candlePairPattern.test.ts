/**
 * How a candle sits against the one before it (#735, #736, #737, #738).
 *
 * These say something the single-candle shapes cannot: a candle that swallows
 * the previous one whole, or opens past its extreme and closes back through
 * it, or retests the low it set. All of it is in the two candles' eight
 * numbers, and none of it is a forecast — what a reversal signal is supposed
 * to *mean* stays the reader's to decide.
 *
 * Every expected value below is worked from the requests' own arithmetic
 * rather than recorded from a run, with `1` the earlier candle and `2` the
 * later:
 *
 *   bullish engulfing  C1<O1, C2>O2, O2<C1, C2>O1
 *   bearish engulfing  C1>O1, C2<O2, O2>C1, C2<O1
 *   piercing line      C1<O1, O2<L1, C2>(O1+C1)/2, C2<O1
 *   dark cloud cover   C1>O1, O2>H1, C2<(O1+C1)/2, C2>O1
 *   tweezer bottom     |L1-L2| <= 0.1*mean(R1,R2), C1<=O1, C2>O2
 *   tweezer top        |H1-H2| <= 0.1*mean(R1,R2), C1>=O1, C2<O2
 *
 * Two things here are decisions rather than transcriptions:
 *
 * - **A pair can honestly be more than one of these.** Unlike a doji and a
 *   spinning top, which are the same statement at two strictnesses, an
 *   engulfing and a tweezer bottom are different facts about the same pair —
 *   one about the bodies, one about the shared low. So the answer is a list,
 *   in a fixed order.
 * - **The prior-trend qualifier is not applied.** #735 and #736 both note that
 *   pairing the geometry with a preceding down- or uptrend would cut false
 *   positives. "After a downtrend" needs a definition of trend the chart does
 *   not state — how far back, and how much of a fall counts — and inventing
 *   one would silence real patterns by a rule the reader cannot see.
 */

import { describe, expect, it } from '@jest/globals';
import {
  candlePairPatterns,
  DEFAULT_CANDLE_SHAPE_THRESHOLDS,
} from '@util/candlePattern';

/** A bearish candle: opens at 110, closes at 100, ranging 98 to 112. */
const FELL = { open: 110, high: 112, low: 98, close: 100 };
/** Its mirror: opens at 100, closes at 110, over the same extent. */
const ROSE = { open: 100, high: 112, low: 98, close: 110 };

describe('how a candle sits against the one before it', () => {
  it('names a bullish engulfing', () => {
    // Opens under the fall's close and closes over its open. The low is put
    // well clear of the previous one so nothing else is claimed here.
    expect(candlePairPatterns(FELL, { open: 99, high: 112, low: 90, close: 111 }))
      .toEqual(['bullish engulfing']);
  });

  it('names a bearish engulfing', () => {
    expect(candlePairPatterns(ROSE, { open: 111, high: 120, low: 99, close: 99 }))
      .toEqual(['bearish engulfing']);
  });

  it('names a piercing line', () => {
    // Opens at 97, under the previous low of 98; closes at 107, over the
    // body's midpoint of 105 but short of its open at 110.
    expect(candlePairPatterns(FELL, { open: 97, high: 108, low: 96, close: 107 }))
      .toEqual(['piercing line']);
  });

  it('names a dark cloud cover', () => {
    // The mirror: opens at 113 over the previous high of 112, closes at 102,
    // under the midpoint of 105 and over the open at 100.
    expect(candlePairPatterns(ROSE, { open: 113, high: 114, low: 101, close: 102 }))
      .toEqual(['dark cloud cover']);
  });

  it('names a tweezer bottom', () => {
    // Lows of 98 and 98.2, inside 0.1 of the two ranges' mean; the second
    // candle closes up, which is the low holding.
    expect(candlePairPatterns(FELL, { open: 101, high: 106, low: 98.2, close: 105 }))
      .toEqual(['tweezer bottom']);
  });

  it('names a tweezer top', () => {
    expect(candlePairPatterns(ROSE, { open: 109, high: 111.8, low: 104, close: 105 }))
      .toEqual(['tweezer top']);
  });

  it('names every pattern a pair really is', () => {
    // The same engulfing as above with its low moved onto the previous one,
    // which makes it a tweezer bottom as well. Both are true, and neither is
    // the other said more precisely.
    expect(candlePairPatterns(FELL, { open: 99, high: 112, low: 98, close: 111 }))
      .toEqual(['bullish engulfing', 'tweezer bottom']);
  });

  it('cannot call one pair both an engulfing and a piercing', () => {
    // #735's "does not fully engulf", written as arithmetic: engulfing needs
    // the close over the previous open and piercing needs it under.
    //
    // Both candles here open at 97 -- under the previous low of 98, so under
    // its close of 100 as well -- which satisfies the opening clause of each
    // pattern. The *only* thing left to tell them apart is where they close,
    // at 111 over the previous open of 110 or at 107 under it. A fixture that
    // separated them some other way would pass whatever these two clauses
    // said.
    const closesOver = candlePairPatterns(FELL, { open: 97, high: 112, low: 90, close: 111 });
    const closesUnder = candlePairPatterns(FELL, { open: 97, high: 108, low: 90, close: 107 });

    expect(closesOver).toEqual(['bullish engulfing']);
    expect(closesUnder).toEqual(['piercing line']);
  });

  it('scales the tweezer tolerance by both candles, not one', () => {
    // The same gap of 1 between the two lows, twice. Against two wide candles
    // it is well inside the tolerance; against two quiet ones it is not --
    // which is what stops a wild session lending its slack to a still one.
    const wide = candlePairPatterns(
      { open: 110, high: 120, low: 98, close: 100 },
      { open: 101, high: 120, low: 99, close: 110 },
    );
    const narrow = candlePairPatterns(
      { open: 101, high: 101.5, low: 98, close: 100 },
      { open: 100.2, high: 101, low: 99, close: 100.8 },
    );

    expect(wide).toEqual(['tweezer bottom']);
    expect(narrow).toEqual([]);
  });

  it('answers by the thresholds it is given', () => {
    const earlier = { open: 101, high: 101.5, low: 98, close: 100 };
    const later = { open: 100.2, high: 101, low: 99, close: 100.8 };

    expect(candlePairPatterns(earlier, later)).toEqual([]);
    expect(candlePairPatterns(earlier, later, {
      ...DEFAULT_CANDLE_SHAPE_THRESHOLDS,
      tweezerLevel: 0.4,
    })).toEqual(['tweezer bottom']);
  });

  it('says nothing about an ordinary pair', () => {
    // Two unremarkable rising candles, which is most of any chart.
    expect(candlePairPatterns(
      { open: 100, high: 105, low: 99, close: 104 },
      { open: 104, high: 108, low: 103, close: 107 },
    )).toEqual([]);
  });
});
