/**
 * The run of closes a candlestick hands to the trend test (#734).
 *
 * `candleTrendPattern` reads only the last `trendLookback` closes, so the
 * trace has no reason to build the whole history before it on every keypress.
 * These cases pin the size of what it hands over and that trimming it did not
 * change which closes decide the name.
 */

import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import type { Ohlc } from '@util/candlePattern';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { Orientation, TraceType } from '@type/grammar';
import * as candlePattern from '@util/candlePattern';

/**
 * A candle carrying whatever prices a case needs.
 * @param value The x label
 * @param ohlc The four prices
 * @returns A candlestick point
 */
function candle(value: string, ohlc: Ohlc): CandlestickPoint {
  return { value, ...ohlc, trend: 'Neutral', volatility: 0 };
}

/**
 * The trace over a series of candles, before its first move.
 * @param prices The candles' prices in x order
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

/** The hammer shape: body 2 high in a range of 10.5, over a shadow of 8. */
const SHAPED: Ohlc = { open: 108, high: 110.5, low: 100, close: 110 };

/**
 * A chart of `count` candles whose closes fall steadily, ending on a hammer.
 * @param count How many ordinary candles precede the hammer
 * @returns The prices in x order
 */
function fallingRun(count: number): Ohlc[] {
  const falling = Array.from({ length: count }, (_, index) => {
    const close = 400 - index;
    return { open: close + 2, high: close + 3, low: close - 1, close };
  });
  return [...falling, SHAPED];
}

/**
 * The closes the trace handed the trend test on its last call.
 * @param spy The spy standing in for `candleTrendPattern`
 * @returns The run of closes, oldest first
 */
function lastRun(
  spy: jest.SpiedFunction<typeof candlePattern.candleTrendPattern>,
): readonly number[] {
  const call = spy.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('The trend test was never consulted');
  }
  return call[0];
}

/**
 * The asides the trace announces at its current position.
 * @param subject The trace to read
 * @returns The aside label/value pairs, or undefined when there are none
 */
function asides(
  subject: Candlestick,
): { label: string; value: string }[] | undefined {
  const state = subject.state as Extract<TraceState, { empty: false }>;
  return state.text.asides;
}

describe('a candlestick hands the trend test only the closes it reads', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the run at the lookback however deep the cursor is', () => {
    const spy = jest.spyOn(candlePattern, 'candleTrendPattern');
    const subject = trace(fallingRun(200));
    subject.moveOnce('FORWARD');
    for (let step = 0; step < 200; step++) {
      subject.moveOnce('FORWARD');
    }

    spy.mockClear();
    subject.moveOnce('BACKWARD');

    expect(lastRun(spy).length).toBeLessThanOrEqual(
      candlePattern.DEFAULT_CANDLE_SHAPE_THRESHOLDS.trendLookback,
    );
  });

  it('hands over the closes immediately before the cursor, in chart order', () => {
    const spy = jest.spyOn(candlePattern, 'candleTrendPattern');
    const subject = trace(fallingRun(6));
    subject.moveOnce('FORWARD');
    for (let step = 0; step < 6; step++) {
      subject.moveOnce('FORWARD');
    }

    expect(lastRun(spy)).toEqual([397, 396, 395]);
  });

  it('still names a hammer at the end of a long fall', () => {
    const subject = trace(fallingRun(50));
    subject.moveOnce('FORWARD');
    for (let step = 0; step < 50; step++) {
      subject.moveOnce('FORWARD');
    }

    expect(asides(subject)).toEqual([{ label: 'pattern', value: 'hammer' }]);
  });

  it('still refuses the name when the chart is shorter than the lookback', () => {
    const subject = trace(fallingRun(2));
    subject.moveOnce('FORWARD');
    subject.moveOnce('FORWARD');
    subject.moveOnce('FORWARD');

    expect(asides(subject)).toBeUndefined();
  });
});
