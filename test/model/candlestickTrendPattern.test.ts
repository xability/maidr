/**
 * The hammer reaches the announcement, and only where the run supports it
 * (#734).
 *
 * `candleTrendPattern` decides the name; these cases are about the trace
 * handing it the right closes. That is the part a unit test of the rule
 * cannot check: the run has to be the closes *before* the candle the cursor
 * is on, in chart order, and a hammer near the start of a chart has too few
 * of them to be named.
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
 * the cursor already reports.
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

/** Three ordinary candles closing 130, 120, 112 — a run of falls. */
const FALLING: Ohlc[] = [
  { open: 132, high: 133, low: 129, close: 130 },
  { open: 130, high: 131, low: 119, close: 120 },
  { open: 120, high: 121, low: 111, close: 112 },
];

/** The same three reversed, so the closes run 112, 120, 130 — a rise. */
const RISING: Ohlc[] = [...FALLING].reverse();

/** The hammer shape: body 2 high in a range of 10.5, over a shadow of 8. */
const SHAPED: Ohlc = { open: 108, high: 110.5, low: 100, close: 110 };

describe('a candlestick announces a hammer for the run it stands on', () => {
  it('names a hammer after three falling closes', () => {
    expect(asidesAt(trace([...FALLING, SHAPED]), 3))
      .toEqual([{ label: 'pattern', value: 'hammer' }]);
  });

  it('names the same candle a hanging man after three rising ones', () => {
    expect(asidesAt(trace([...RISING, SHAPED]), 3))
      .toEqual([{ label: 'pattern', value: 'hanging man' }]);
  });

  it('names nothing when there are too few candles before it', () => {
    // The identical hammer, one candle into the chart. The run is what is
    // missing, not the shape.
    expect(asidesAt(trace([FALLING[2], SHAPED]), 1)).toBeUndefined();
  });

  it('announces the candle\'s own shape beside the name', () => {
    // A dragonfly doji *is* the hammer shape -- body at the top of the range,
    // nothing above it, a long wick below. The two names come from different
    // vocabularies and say different things: one describes the candle, the
    // other says what standing at the end of a fall makes of it. Both are
    // true, so both are said.
    const dragonfly: Ohlc = { open: 100, high: 100.4, low: 92, close: 100 };

    expect(asidesAt(trace([...FALLING, dragonfly]), 3)).toEqual([
      { label: 'shape', value: 'dragonfly doji' },
      { label: 'pattern', value: 'hammer' },
    ]);
  });
});
