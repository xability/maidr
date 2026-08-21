/**
 * The candle's shape reaches the announcement (#731, #732, #733).
 *
 * `candleShape` decides the name; these cases are about where it lands. It
 * travels as an **aside** rather than in `z` or `section`, because those two
 * are taken and neither would carry it correctly: `z` is the candle's trend,
 * and `section` fuses onto the cross-axis label, so a shape put there would
 * read as though the price were the shape.
 *
 * The shape repeats across the five segments of one candle. That is the same
 * choice the trend already makes, and for the same reason: both are facts
 * about the candle, and which of its prices the cursor is reading does not
 * change either of them.
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

/** One doji, one marubozu, one spinning top and one ordinary candle. */
const CANDLES = [
  candle('d0', { open: 100, high: 105, low: 95, close: 100.2 }),
  candle('d1', { open: 10, high: 20, low: 10, close: 20 }),
  candle('d2', { open: 100, high: 106, low: 96, close: 102 }),
  candle('d3', { open: 100, high: 105, low: 99, close: 104 }),
];

/**
 * The trace over {@link CANDLES}.
 *
 * @returns A candlestick trace positioned on its first candle
 */
function trace(): Candlestick {
  const layer: MaidrLayer = {
    id: 'candle',
    type: TraceType.CANDLESTICK,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: CANDLES,
  };
  return new Candlestick(layer);
}

/**
 * What a trace announces as asides where it sits.
 *
 * @param subject - The trace to read
 * @returns The aside label/value pairs, or undefined when there are none
 */
function asidesOf(subject: Candlestick): { label: string; value: string }[] | undefined {
  const state = subject.state as Extract<TraceState, { empty: false }>;
  return state.text.asides;
}

/**
 * Walks the cursor forward by `steps` candles.
 *
 * The first `FORWARD` is the trace's initial entry and lands on the candle
 * the cursor already reports, so it is spent before any stepping begins.
 *
 * @param subject - The trace to move
 * @param steps   - How many candles to advance
 */
function forward(subject: Candlestick, steps: number): void {
  subject.moveOnce('FORWARD');
  for (let i = 0; i < steps; i++) {
    subject.moveOnce('FORWARD');
  }
}

describe('a candlestick announces the shape it is drawn in', () => {
  it('names the doji it opens on', () => {
    expect(asidesOf(trace())).toEqual([{ label: 'shape', value: 'doji' }]);
  });

  it('names each candle as the cursor reaches it', () => {
    const subject = trace();

    forward(subject, 1);
    expect(asidesOf(subject)).toEqual([{ label: 'shape', value: 'marubozu' }]);

    subject.moveOnce('FORWARD');
    expect(asidesOf(subject)).toEqual([{ label: 'shape', value: 'spinning top' }]);
  });

  it('says nothing at all about an ordinary candle', () => {
    // The half that keeps the announcement worth listening to: most candles
    // on most charts are no named shape, and a trailing clause on every one
    // of them would bury the ones that are.
    const subject = trace();

    forward(subject, 3);
    expect(asidesOf(subject)).toBeUndefined();
  });

  it('keeps saying it as the cursor moves between the candle\'s prices', () => {
    // The same choice the trend already makes. A reader who arrows down from
    // the close to the low has not moved to a different candle.
    const subject = trace();
    const named = [{ label: 'shape', value: 'doji' }];

    // Named outright rather than compared against whatever the previous
    // reading was: two `undefined`s are equal too, and this case has to fail
    // when the shape stops being announced at all.
    expect(asidesOf(subject)).toEqual(named);

    subject.moveOnce('DOWNWARD');
    expect(asidesOf(subject)).toEqual(named);
  });

  it('leaves the prices and the trend where they were', () => {
    // An aside is an addition, not a replacement: nothing that was announced
    // before stops being announced.
    const state = trace().state as Extract<TraceState, { empty: false }>;

    expect(state.text.main.value).toBe('d0');
    expect(state.text.z).toEqual({ label: 'trend', value: 'Bull' });
  });
});
