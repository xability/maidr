import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Builds a candle with a chosen close. open === close (neutral) keeps the
 * default entry segment ('close') the comparison target; the model recomputes
 * trend/volatility, so the placeholders here are ignored.
 * @param value - The x label (date)
 * @param close - The closing price used by the compare search
 * @returns A candlestick point
 */
function candle(value: string, close: number): CandlestickPoint {
  return {
    value,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100,
    trend: 'Neutral',
    volatility: 4,
  };
}

// Close values across d0..d4. From d0 (10): the next HIGHER close is d2 (12,
// skipping d1's 8); the next LOWER close is d1 (8).
const CLOSES = [10, 8, 12, 9, 14];

/**
 * Creates a candlestick layer in the given orientation.
 * @param orientation - Vertical or horizontal layout
 * @returns A candlestick layer definition
 */
function makeLayer(orientation: Orientation): MaidrLayer {
  return {
    id: 'candle',
    type: TraceType.CANDLESTICK,
    orientation,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: CLOSES.map((c, i) => candle(`d${i}`, c)),
  };
}

/**
 * Reads the x label of the candle the cursor currently sits on, via the
 * public trace state (orientation-independent — main.value is the candle's
 * value in both layouts).
 * @param trace - The trace to inspect
 * @returns The current candle's x label
 */
function currentDate(trace: Candlestick): string | number | number[] | undefined {
  const state = trace.state;
  return state.empty ? undefined : state.text.main.value;
}

describe('candlestick compare navigation is orientation-independent', () => {
  test('vertical: moveRight/higher lands on the next higher-close candle', () => {
    const trace = new Candlestick(makeLayer(Orientation.VERTICAL));
    // Default entry segment is 'close'; start at d0 (close 10).
    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(currentDate(trace)).toBe('d2'); // close 12, skipping d1 (8)
    expect(trace.col).toBe(2); // candle index lives in col when vertical
  });

  test('horizontal: moveRight/higher lands on the same candle as vertical', () => {
    // Regression guard for the orientation bug: before the fix this read
    // this.col (the segment position in horizontal layout) as the candle
    // index and jumped to the wrong candle.
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL));
    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(currentDate(trace)).toBe('d2');
    expect(trace.row).toBe(2); // candle index lives in row when horizontal
  });

  test('horizontal: moveRight/lower finds the next lower-close candle', () => {
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL));
    expect(trace.moveToNextCompareValue('right', 'lower')).toBe(true);
    expect(currentDate(trace)).toBe('d1'); // close 8 < 10
    expect(trace.row).toBe(1);
  });

  test('horizontal: compare works after navigating in, not only from entry', () => {
    // Exercises the currentPointIndex path from a moved position (this.col
    // holds the segment index here, this.row the candle index), so it guards
    // the fix independently of the initial-entry code path.
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL));
    trace.moveOnce('FORWARD'); // initial entry -> d0
    trace.moveOnce('FORWARD'); // d0 -> d1
    expect(currentDate(trace)).toBe('d1');

    // From d1 (close 8) the next higher close to the right is d2 (12).
    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(currentDate(trace)).toBe('d2');
    expect(trace.row).toBe(2);
  });

  test('horizontal: boundary returns false and stays on the current candle', () => {
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL));
    // From d0 there is nothing further left.
    expect(trace.moveToNextCompareValue('left', 'higher')).toBe(false);
    expect(currentDate(trace)).toBe('d0');
  });
});
