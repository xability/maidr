/**
 * The three-candle formations reach the announcement (#739, #740, #741,
 * #742).
 *
 * `candleTrioPatterns` decides the names; these cases are about the trace
 * handing it the right three candles, in the right order, and only where
 * there are three to hand.
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

/** A morning star: decisive fall, pause below it, decisive rise back through. */
const MORNING: Ohlc[] = [
  { open: 120, high: 121, low: 99, close: 100 },
  { open: 95, high: 96, low: 90, close: 94 },
  { open: 100, high: 116, low: 99, close: 115 },
];

describe('a candlestick announces the formation three candles make', () => {
  it('names the morning star on its third candle', () => {
    expect(asidesAt(trace(MORNING), 2))
      .toContainEqual({ label: 'pattern', value: 'morning star' });
  });

  it('names nothing about it on the second, which has only one behind it', () => {
    // The formation is real by the time the third candle is drawn and not
    // before; announcing it early would name a chart that does not exist yet.
    const asides = asidesAt(trace(MORNING), 1) ?? [];

    expect(asides.map(aside => aside.value)).not.toContain('morning star');
  });

  it('reads the three in chart order', () => {
    // The same three candles reversed are no formation at all -- a decisive
    // rise, a pause *below* rather than after it, a decisive fall. If the
    // trace handed them over in any other order this would still find one.
    expect(asidesAt(trace([...MORNING].reverse()), 2) ?? [])
      .not
      .toContainEqual({ label: 'pattern', value: 'morning star' });
  });

  it('announces a formation beside whatever else the candle carries', () => {
    // Three white soldiers whose last candle is itself a marubozu -- a body
    // filling 10 of its 10.4 range. The two are different statements about
    // different things, one about how this candle is drawn and one about what
    // the three of them did, so both are made.
    const soldiers: Ohlc[] = [
      { open: 100, high: 110.5, low: 99, close: 110 },
      { open: 105, high: 115.5, low: 104, close: 115 },
      { open: 112, high: 122.2, low: 111.8, close: 122 },
    ];

    expect(asidesAt(trace(soldiers), 2)).toEqual([
      { label: 'shape', value: 'marubozu' },
      { label: 'pattern', value: 'three white soldiers' },
    ]);
  });
});
