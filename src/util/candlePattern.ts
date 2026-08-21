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
 * The thresholds are the ones the requests specify (#731, #732, #733), and
 * they are parameters rather than literals because strictness is a matter of
 * trading style. There is no way to set them from a chart yet; when there is,
 * it passes {@link CandleShapeThresholds} and nothing else changes.
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
}

/** The thresholds each request names, and what applies when none are given. */
export const DEFAULT_CANDLE_SHAPE_THRESHOLDS: CandleShapeThresholds = {
  marubozuBody: 0.95,
  dojiBody: 0.05,
  dojiShortShadow: 0.05,
  dojiLongShadow: 0.6,
  spinningBody: 0.33,
  spinningShadowGap: 0.15,
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
