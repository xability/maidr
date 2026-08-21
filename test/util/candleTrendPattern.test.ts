/**
 * The one shape whose name is decided by what came before it (#734).
 *
 * A hammer and a hanging man are the *same candle* — a small body high in the
 * range, over a long lower shadow, with next to nothing above it. Which of
 * the two it is depends entirely on whether the market had been falling or
 * rising into it, so this is the one place in the family where a run of
 * earlier closes has to be read.
 *
 * The shape, from the request:
 *
 *   lower >= 2 * body
 *   upper <= 0.1 * range
 *   min(open, close) >= low + 0.66 * range
 *
 * The run, also the request's: the last three closes before the candle, each
 * strictly under (hammer) or over (hanging man) the one before it.
 *
 * That rule is narrow on purpose. It can be stated to a reader in one
 * sentence, and a candle that meets the shape after an unsteady run is left
 * unnamed rather than given whichever name the last two closes happen to
 * suggest. A chart's first few candles establish no run and so get no name.
 */

import { describe, expect, it } from '@jest/globals';
import {
  candleTrendPattern,
  DEFAULT_CANDLE_SHAPE_THRESHOLDS,
} from '@util/candlePattern';

/**
 * The shape both names share: body 2 high in a range of 10.5, a lower shadow
 * of 8 under it and 0.5 above.
 */
const SHAPED = { open: 108, high: 110.5, low: 100, close: 110 };

/** Three closes, each under the last. */
const FELL = [130, 120, 112];
/** Three closes, each over the last. */
const ROSE = [100, 105, 112];

describe('a hammer and a hanging man, told apart by the run before them', () => {
  it('names a hammer after a run of falling closes', () => {
    expect(candleTrendPattern(FELL, SHAPED)).toBe('hammer');
  });

  it('names a hanging man after a run of rising closes', () => {
    // The identical candle. Only the three numbers before it changed.
    expect(candleTrendPattern(ROSE, SHAPED)).toBe('hanging man');
  });

  it('reads only the last few closes, not the whole chart', () => {
    // A long history that wandered before settling into its fall.
    expect(candleTrendPattern([50, 90, 60, 130, 120, 112], SHAPED)).toBe('hammer');
  });

  it('leaves the shape unnamed after an unsteady run', () => {
    // Down then up. Neither name is earned, and picking one from the last
    // step would be reading a trend the closes do not show.
    expect(candleTrendPattern([120, 110, 115], SHAPED)).toBeNull();
  });

  it('does not count a flat step as part of a run', () => {
    // "Each strictly under the one before" -- a close that held is not a fall.
    expect(candleTrendPattern([120, 115, 115], SHAPED)).toBeNull();
  });

  it('names nothing at the start of a chart', () => {
    // Two closes cannot establish a three-close run, however they moved.
    expect(candleTrendPattern([120, 112], SHAPED)).toBeNull();
    expect(candleTrendPattern([], SHAPED)).toBeNull();
  });

  it('leaves an ordinary candle unnamed however the run moved', () => {
    // A lower shadow of 1 against a body of 4 is not a hammer, and a falling
    // run does not make it one.
    const ordinary = { open: 100, high: 105, low: 99, close: 104 };

    expect(candleTrendPattern(FELL, ordinary)).toBeNull();
    expect(candleTrendPattern(ROSE, ordinary)).toBeNull();
  });

  it('leaves a candle drawn at a single price unnamed', () => {
    // Every clause of the shape is trivially true of a range of zero -- a
    // lower shadow of 0 is "at least twice a body of 0" -- and it has none of
    // the long lower shadow the name is about.
    expect(candleTrendPattern(FELL, { open: 50, high: 50, low: 50, close: 50 }))
      .toBeNull();
  });

  it('answers by the lookback it is given', () => {
    // The unsteady run above, read two closes deep instead of three: 110 then
    // 115 is a rise, so the shape gets a name it did not have. Which is the
    // point of the window being a parameter -- and of it being visible.
    const wandering = [120, 110, 115];

    expect(candleTrendPattern(wandering, SHAPED)).toBeNull();
    expect(candleTrendPattern(wandering, SHAPED, {
      ...DEFAULT_CANDLE_SHAPE_THRESHOLDS,
      trendLookback: 2,
    })).toBe('hanging man');
  });
});
