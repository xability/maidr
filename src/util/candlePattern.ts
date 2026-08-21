/**
 * The shape of a single candle, read off its own four numbers.
 *
 * A candlestick chart says two things at every session. The first is the four
 * prices, which the trace already announces. The second is the *shape* the
 * candle is drawn in — a cross, a solid block, a small body between two long
 * wicks — and that is the half a sighted reader gets from the picture at a
 * glance and a screen-reader user has to reconstruct by holding four numbers
 * in their head and dividing.
 *
 * Nothing here is a forecast. Every name below describes the drawing: a doji
 * is a candle whose open and close are level, a marubozu is one drawn with
 * (almost) no wicks. What such a candle is supposed to *mean* is the reader's
 * to decide, exactly as it is for someone looking at the chart.
 *
 * {@link candlePairPatterns} does the same for the two-candle patterns, which
 * describe how a candle sits against the one before it rather than how it is
 * drawn on its own (#735, #736, #737, #738).
 *
 * The thresholds are the ones the requests specify, and they are parameters
 * rather than literals because strictness is a matter of trading style. There
 * is no way to set them from a chart yet; when there is, it passes
 * {@link CandleShapeThresholds} and nothing else changes.
 *
 * @packageDocumentation
 */

/** A candle's four prices, the only input any shape test needs. */
export interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * The shapes told apart here, which are the ones a single candle can carry.
 *
 * Patterns that need a neighbour — engulfing, piercing, the star and soldier
 * families — are not shapes of one candle and are not decided here.
 */
export type CandleShape
  = | 'marubozu'
    | 'doji'
    | 'dragonfly doji'
    | 'gravestone doji'
    | 'spinning top';

/** How strict each test is, as fractions of the candle's own range. */
export interface CandleShapeThresholds {
  /** A marubozu's body must be at least this much of the range (#731). */
  marubozuBody: number;
  /** A doji's body may be at most this much of the range (#733). */
  dojiBody: number;
  /** A doji variant's short shadow may be at most this much (#733). */
  dojiShortShadow: number;
  /** A doji variant's long shadow must be at least this much (#733). */
  dojiLongShadow: number;
  /** A spinning top's body may be at most this much of the range (#732). */
  spinningBody: number;
  /** How far a spinning top's two shadows may differ (#732). */
  spinningShadowGap: number;
  /**
   * How far two candles' shared level may differ and still be one, as a
   * fraction of the two ranges' mean (#737).
   */
  tweezerLevel: number;
}

/** The thresholds each request names, and what applies when none are given. */
export const DEFAULT_CANDLE_SHAPE_THRESHOLDS: CandleShapeThresholds = {
  marubozuBody: 0.95,
  dojiBody: 0.05,
  dojiShortShadow: 0.05,
  dojiLongShadow: 0.6,
  spinningBody: 0.33,
  spinningShadowGap: 0.15,
  tweezerLevel: 0.1,
};

/** The four quantities every test below is written in terms of. */
interface CandleParts {
  range: number;
  body: number;
  upper: number;
  lower: number;
}

/**
 * Splits a candle into the parts the shape tests are written in terms of.
 *
 * @param candle - The candle's four prices
 * @returns Its range, body height and the length of each shadow
 */
function partsOf(candle: Ohlc): CandleParts {
  const top = Math.max(candle.open, candle.close);
  const bottom = Math.min(candle.open, candle.close);
  return {
    range: candle.high - candle.low,
    body: Math.abs(candle.close - candle.open),
    upper: candle.high - top,
    lower: bottom - candle.low,
  };
}

/**
 * Which doji variant a level-bodied candle is, if it is one at all.
 *
 * @param parts      - The candle's measured parts
 * @param thresholds - How strict to be
 * @returns The variant's name
 */
function dojiVariant(
  parts: CandleParts,
  thresholds: CandleShapeThresholds,
): CandleShape {
  // A candle with no range at all opened, closed, rose and fell at one price.
  // It is a doji — open level with close is the whole of the definition — but
  // it is not a *dragonfly* or a *gravestone*, both of which name a long
  // shadow that this candle does not have. Every proportion below is a
  // fraction of a range of zero and so is trivially satisfied, which would
  // otherwise report a rejection of lows that never happened.
  if (parts.range === 0) {
    return 'doji';
  }

  const short = thresholds.dojiShortShadow * parts.range;
  const long = thresholds.dojiLongShadow * parts.range;

  if (parts.upper <= short && parts.lower >= long) {
    return 'dragonfly doji';
  }
  if (parts.lower <= short && parts.upper >= long) {
    return 'gravestone doji';
  }
  return 'doji';
}

/**
 * Names the shape a candle is drawn in, or nothing when it is an ordinary one.
 *
 * The tests are asked most specific first, because they overlap by
 * construction: every doji also satisfies the spinning top's body condition
 * (0.05 of a range is under 0.33), and a doji with two even wicks satisfies
 * all of it. Doji is the narrower statement and so the one worth making.
 * Marubozu cannot collide with either — a body at 95% of the range and one at
 * 5% are the two ends of the same measurement.
 *
 * @param candle     - The candle's four prices
 * @param thresholds - How strict to be; the requests' figures by default
 * @returns The shape's name, or `null` for a candle that is none of them
 */
export function candleShape(
  candle: Ohlc,
  thresholds: CandleShapeThresholds = DEFAULT_CANDLE_SHAPE_THRESHOLDS,
): CandleShape | null {
  const parts = partsOf(candle);

  // Not `>= 0`: a candle drawn at a single price has a body of zero, and
  // `0 >= 0.95 * 0` would call it the most one-directional candle on the
  // chart. It reaches the doji test below instead, which is what it is.
  if (parts.range > 0 && parts.body >= thresholds.marubozuBody * parts.range) {
    return 'marubozu';
  }

  if (parts.body <= thresholds.dojiBody * parts.range) {
    return dojiVariant(parts, thresholds);
  }

  if (
    parts.body <= thresholds.spinningBody * parts.range
    && parts.upper >= parts.body
    && parts.lower >= parts.body
    && Math.abs(parts.upper - parts.lower) <= thresholds.spinningShadowGap * parts.range
  ) {
    return 'spinning top';
  }

  return null;
}

/**
 * How a candle sits against the one before it.
 *
 * These are statements about a *pair*, so they are announced on the second
 * candle of the two: it is the one whose reading changes because of what came
 * before. The first candle on a chart has no previous and so carries none.
 */
export type CandlePairPattern
  = | 'bullish engulfing'
    | 'bearish engulfing'
    | 'piercing line'
    | 'dark cloud cover'
    | 'tweezer bottom'
    | 'tweezer top';

/**
 * Whether two candles share a level closely enough to be a tweezer.
 *
 * The tolerance is a fraction of the two ranges' mean rather than of either
 * one, so a quiet session beside a wild one does not get the wild one's
 * slack — which is what "the same level, twice" is supposed to mean.
 *
 * @param first      - The earlier candle's level
 * @param second     - The later candle's level
 * @param ranges     - Both candles' high-to-low extents
 * @param thresholds - How strict to be
 * @returns True when the two levels count as one
 */
function sharesLevel(
  first: number,
  second: number,
  ranges: [number, number],
  thresholds: CandleShapeThresholds,
): boolean {
  const tolerance = thresholds.tweezerLevel * ((ranges[0] + ranges[1]) / 2);
  return Math.abs(first - second) <= tolerance;
}

/**
 * Names every two-candle pattern a pair satisfies.
 *
 * An **array**, because unlike the single-candle shapes these do not compete.
 * A doji and a spinning top are the same statement at two strictnesses, so
 * only the narrower is worth making; an engulfing and a tweezer bottom are
 * two different facts — one about the bodies, one about the shared low — and
 * a pair can honestly be both. They are returned in a fixed order so the
 * announcement does not depend on how the tests happen to be written.
 *
 * What the pairs cannot collide on is direction: bullish engulfing needs the
 * close above the previous open and piercing needs it below, which is #735's
 * "does not fully engulf" written as arithmetic, and the bearish two mirror
 * it. A tweezer bottom and a tweezer top would need the earlier candle to be
 * both bearish and bullish.
 *
 * The prior-trend qualifier #735 and #736 mention as desirable is **not**
 * applied. "After a downtrend" needs a definition of trend — how many candles
 * back, and how much of a fall counts — that the chart does not state, and
 * inventing one would silence real patterns on a reader's behalf by a rule
 * they cannot see. The geometry each request specifies is what is tested.
 *
 * @param previous   - The candle before
 * @param candle     - The candle the cursor is on
 * @param thresholds - How strict to be; the requests' figures by default
 * @returns Every pattern the pair satisfies, possibly none
 */
export function candlePairPatterns(
  previous: Ohlc,
  candle: Ohlc,
  thresholds: CandleShapeThresholds = DEFAULT_CANDLE_SHAPE_THRESHOLDS,
): CandlePairPattern[] {
  const found = new Array<CandlePairPattern>();

  const wasBearish = previous.close < previous.open;
  const wasBullish = previous.close > previous.open;
  const midpoint = (previous.open + previous.close) / 2;
  const ranges: [number, number] = [
    previous.high - previous.low,
    candle.high - candle.low,
  ];

  // #738: the later body swallows the earlier one whole, in the opposite
  // direction. Deliberately two candles rather than three, as the request
  // notes.
  if (
    wasBearish
    && candle.close > candle.open
    && candle.open < previous.close
    && candle.close > previous.open
  ) {
    found.push('bullish engulfing');
  }
  if (
    wasBullish
    && candle.close < candle.open
    && candle.open > previous.close
    && candle.close < previous.open
  ) {
    found.push('bearish engulfing');
  }

  // #735 and #736: opens past the earlier candle's extreme, then closes back
  // through the middle of its body without reaching the far end of it. The
  // direction of the second candle follows from the other clauses rather than
  // being tested again -- an open below the previous low and a close above
  // the previous body's midpoint is a rising candle by arithmetic.
  if (
    wasBearish
    && candle.open < previous.low
    && candle.close > midpoint
    && candle.close < previous.open
  ) {
    found.push('piercing line');
  }
  if (
    wasBullish
    && candle.open > previous.high
    && candle.close < midpoint
    && candle.close > previous.open
  ) {
    found.push('dark cloud cover');
  }

  // #737: the same low tested twice and held, or the same high twice and
  // rejected. A run of three or more candles sharing a level is this rule
  // over each consecutive pair, which announces the level on every candle
  // that retested it rather than only on the last.
  if (
    previous.close <= previous.open
    && candle.close > candle.open
    && sharesLevel(previous.low, candle.low, ranges, thresholds)
  ) {
    found.push('tweezer bottom');
  }
  if (
    previous.close >= previous.open
    && candle.close < candle.open
    && sharesLevel(previous.high, candle.high, ranges, thresholds)
  ) {
    found.push('tweezer top');
  }

  return found;
}
