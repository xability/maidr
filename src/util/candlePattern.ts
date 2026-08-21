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
 * drawn on its own (#735, #736, #737, #738), and {@link candleTrendPattern}
 * for the one pair of names that a run of earlier closes decides between
 * (#734). {@link candleTrioPatterns} covers the three-candle formations
 * (#739, #740, #741, #742).
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
  /** A hammer's lower shadow must be at least this many bodies (#734). */
  hammerLowerShadow: number;
  /** A hammer's upper shadow may be at most this much of the range (#734). */
  hammerUpperShadow: number;
  /** A hammer's body must sit at least this far up the range (#734). */
  hammerBodyFloor: number;
  /** How many earlier closes a hammer's run is read from (#734). */
  trendLookback: number;
  /** A star's outer candles fill at least this much of their range (#739). */
  starLargeBody: number;
  /** A star's middle candle fills at most this much of its range (#739). */
  starSmallBody: number;
  /** A soldier's or crow's shadow, at most this much of its range (#740). */
  soldierShadow: number;
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
  hammerLowerShadow: 2,
  hammerUpperShadow: 0.1,
  hammerBodyFloor: 0.66,
  trendLookback: 3,
  // #739 asks for "large" and "small" relative to recent candle size, and
  // suggests an ATR. That needs a lookback window the chart does not state
  // and would leave the first candles of any chart unreadable; a body against
  // its own range says the same thing about each candle -- decisive, or not
  // -- and needs nothing beyond the three the pattern is about. #740 leaves
  // "small shadows" without a figure at all and asks for one to be chosen.
  starLargeBody: 0.6,
  starSmallBody: 0.3,
  soldierShadow: 0.15,
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

/**
 * The two names one candle shape carries, told apart by what came before it.
 */
export type CandleTrendPattern = 'hammer' | 'hanging man';

/**
 * Whether a candle is drawn in the hammer shape: a small body high in the
 * range, over a long lower shadow, with next to nothing above it.
 *
 * @param candle     - The candle's four prices
 * @param thresholds - How strict to be
 * @returns True when the candle is that shape
 */
function isHammerShape(
  candle: Ohlc,
  thresholds: CandleShapeThresholds,
): boolean {
  const parts = partsOf(candle);

  // A candle drawn at a single price satisfies every clause below -- a lower
  // shadow of zero is `2 * 0`, an upper shadow of zero is under a tenth of
  // zero, and its body sits at the low, which is also two thirds of the way
  // up a range of nothing. It has no long lower shadow, which is the whole of
  // what a hammer names, so it is turned away before any of that is asked.
  if (parts.range === 0) {
    return false;
  }

  return parts.lower >= thresholds.hammerLowerShadow * parts.body
    && parts.upper <= thresholds.hammerUpperShadow * parts.range
    && Math.min(candle.open, candle.close)
    >= candle.low + thresholds.hammerBodyFloor * parts.range;
}

/**
 * Whether a run of closes moves one way throughout.
 *
 * @param closes    - The closes, oldest first
 * @param direction - Whether they must fall or rise
 * @returns True when every step goes that way
 */
function runsOneWay(closes: readonly number[], direction: 'down' | 'up'): boolean {
  for (let i = 1; i < closes.length; i++) {
    const fell = closes[i] < closes[i - 1];
    if (direction === 'down' ? !fell : !(closes[i] > closes[i - 1])) {
      return false;
    }
  }
  return true;
}

/**
 * Names a hammer or a hanging man, which are one shape under two readings.
 *
 * The shape does not decide it: an identical candle is a hammer at the bottom
 * of a fall and a hanging man at the top of a rise. So this is the one place
 * where the run of earlier closes has to be read, and it is read by the rule
 * #734 gives -- the last {@link CandleShapeThresholds.trendLookback} closes
 * before the candle, each strictly under or over the one before it.
 *
 * That is a narrow rule and deliberately so. It is the request's own, it can
 * be stated to a reader in one sentence, and a candle that meets the shape
 * after an unsteady run is left unnamed rather than given whichever name the
 * last two closes happen to suggest. Nothing here forecasts anything: the
 * name says what the drawing is, and a reader who wants to know whether the
 * fall really was a downtrend can navigate back through it.
 *
 * A run shorter than the lookback -- the first few candles of any chart --
 * establishes nothing, and gets no name.
 *
 * @param previousCloses - Every close before this candle, oldest first
 * @param candle         - The candle's four prices
 * @param thresholds     - How strict to be; the request's figures by default
 * @returns The name, or `null` when the shape or the run does not hold
 */
export function candleTrendPattern(
  previousCloses: readonly number[],
  candle: Ohlc,
  thresholds: CandleShapeThresholds = DEFAULT_CANDLE_SHAPE_THRESHOLDS,
): CandleTrendPattern | null {
  if (!isHammerShape(candle, thresholds)) {
    return null;
  }

  const run = previousCloses.slice(-thresholds.trendLookback);
  if (run.length < thresholds.trendLookback) {
    return null;
  }

  if (runsOneWay(run, 'down')) {
    return 'hammer';
  }
  if (runsOneWay(run, 'up')) {
    return 'hanging man';
  }
  return null;
}

/** The three-candle formations. */
export type CandleTrioPattern
  = | 'morning star'
    | 'evening star'
    | 'three white soldiers'
    | 'three black crows'
    | 'upside tasuki gap'
    | 'upside tasuki gap filled'
    | 'three inside down'
    | 'three outside down';

/**
 * Whether a candle's body fills enough of its range to be a decisive one.
 *
 * @param candle - The candle's four prices
 * @param share  - The fraction of the range the body must reach
 * @returns True when the body is at least that much of the range
 */
function bodyFills(candle: Ohlc, share: number): boolean {
  const parts = partsOf(candle);
  return parts.range > 0 && parts.body >= share * parts.range;
}

/**
 * Whether a candle's body is small enough against its range to be a star.
 *
 * A candle drawn at one price counts: it has no body at all, which is the
 * indecision a star's middle candle stands for, and unlike the hammer shape
 * there is no long shadow being claimed that it does not have.
 *
 * @param candle - The candle's four prices
 * @param share  - The fraction of the range the body must stay under
 * @returns True when the body is at most that much of the range
 */
function bodyStaysUnder(candle: Ohlc, share: number): boolean {
  const parts = partsOf(candle);
  return parts.body <= share * parts.range;
}

/**
 * Whether three candles all run one way, each closing past the last and
 * opening inside the body before it, with short shadows on the leading side.
 *
 * @param candles    - The three candles, oldest first
 * @param direction  - Whether they rise (soldiers) or fall (crows)
 * @param thresholds - How strict to be
 * @returns True when all three march that way
 */
function marchesOneWay(
  candles: readonly [Ohlc, Ohlc, Ohlc],
  direction: 'up' | 'down',
  thresholds: CandleShapeThresholds,
): boolean {
  const rising = direction === 'up';

  for (const candle of candles) {
    if (rising ? candle.close <= candle.open : candle.close >= candle.open) {
      return false;
    }
    // The shadow that matters is the one ahead of the march: a soldier that
    // rose and left a long wick above it gave the gain back before the close,
    // which is the opposite of the steady control the name is about.
    const parts = partsOf(candle);
    const leading = rising ? parts.upper : parts.lower;
    if (parts.range === 0 || leading > thresholds.soldierShadow * parts.range) {
      return false;
    }
  }

  const [one, two, three] = candles;
  const closesOn = rising
    ? one.close < two.close && two.close < three.close
    : one.close > two.close && two.close > three.close;
  if (!closesOn) {
    return false;
  }

  // "Opens within the prior body", written from the body's own ends rather
  // than by flipping the inequalities: a rising candle's body runs open to
  // close, a falling one's runs close to open.
  const insideFirst = rising
    ? two.open >= one.open && two.open <= one.close
    : two.open <= one.open && two.open >= one.close;
  const insideSecond = rising
    ? three.open >= two.open && three.open <= two.close
    : three.open <= two.open && three.open >= two.close;

  return insideFirst && insideSecond;
}

/**
 * Names every three-candle formation a trio satisfies.
 *
 * An array for the reason {@link candlePairPatterns} returns one: these are
 * separate statements rather than one statement at several strictnesses. Most
 * of them cannot co-occur — a formation that needs its first candle bullish
 * excludes every one that needs it bearish — but a filled Tasuki gap and an
 * evening star can both describe the same three candles, and neither is the
 * other said more precisely.
 *
 * @param first      - The earliest of the three
 * @param second     - The middle one
 * @param third      - The candle the cursor is on
 * @param thresholds - How strict to be; the requests' figures by default
 * @returns Every formation the trio satisfies, possibly none
 */
export function candleTrioPatterns(
  first: Ohlc,
  second: Ohlc,
  third: Ohlc,
  thresholds: CandleShapeThresholds = DEFAULT_CANDLE_SHAPE_THRESHOLDS,
): CandleTrioPattern[] {
  const found = new Array<CandleTrioPattern>();

  const firstTop = Math.max(first.open, first.close);
  const firstBottom = Math.min(first.open, first.close);
  const midpoint = (first.open + first.close) / 2;
  const secondTop = Math.max(second.open, second.close);
  const secondBottom = Math.min(second.open, second.close);

  const large = (candle: Ohlc): boolean => bodyFills(candle, thresholds.starLargeBody);
  const small = (candle: Ohlc): boolean => bodyStaysUnder(candle, thresholds.starSmallBody);

  // #739: decisive, then a pause clear of it, then decisive back through the
  // middle of the first candle's body.
  if (
    first.close < first.open && large(first)
    && small(second) && secondTop < firstBottom
    && third.close > third.open && large(third) && third.close > midpoint
  ) {
    found.push('morning star');
  }
  if (
    first.close > first.open && large(first)
    && small(second) && secondBottom > firstTop
    && third.close < third.open && large(third) && third.close < midpoint
  ) {
    found.push('evening star');
  }

  // #740: three steady steps the same way.
  if (marchesOneWay([first, second, third], 'up', thresholds)) {
    found.push('three white soldiers');
  }
  if (marchesOneWay([first, second, third], 'down', thresholds)) {
    found.push('three black crows');
  }

  // #741: two rising candles with a gap between them, then a fall back into
  // the gap. Whether the gap survives is the whole of what the two names say,
  // so both are returned rather than a flag on one.
  if (
    first.close > first.open
    && second.close > second.open && second.low > first.high
    && third.close < third.open
    && third.open >= second.open && third.open <= second.close
  ) {
    found.push(
      third.close > first.high ? 'upside tasuki gap' : 'upside tasuki gap filled',
    );
  }

  // #742: a rise, then a turn either tucked inside it or swallowing it, then
  // a lower close confirming the turn.
  if (
    first.close > first.open
    && second.close < second.open
    && first.open <= second.close && second.open <= first.close
    && third.close < second.close
  ) {
    found.push('three inside down');
  }
  if (
    first.close > first.open
    && second.close < second.open
    && second.open > first.close && second.close < first.open
    && third.close < second.close
  ) {
    found.push('three outside down');
  }

  return found;
}
