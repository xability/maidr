import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import {
  BEARISH_POINT_MODE,
  BULLISH_POINT_MODE,
  Candlestick,
  NEUTRAL_POINT_MODE,
} from '@model/candlestick';
import { TraceType } from '@type/grammar';

/**
 * Builds a candle. The Candlestick constructor derives `trend` from
 * open/close, so the values here choose the trend: close > open is bullish,
 * close < open bearish, close === open neutral. The passed trend/volatility
 * are placeholders the model recomputes.
 * @param value - The x label (e.g. date)
 * @param open - Opening price
 * @param close - Closing price
 * @returns A candlestick point
 */
function candle(value: string, open: number, close: number): CandlestickPoint {
  const high = Math.max(open, close) + 1;
  const low = Math.min(open, close) - 1;
  return { value, open, high, low, close, volume: 100, trend: 'Bull', volatility: high - low };
}

/**
 * Creates a candlestick layer whose five candles are, in order:
 * Bull, Bear, Neutral, Bull, Bear.
 * @returns A candlestick layer definition
 */
function createLayer(): MaidrLayer {
  const data: CandlestickPoint[] = [
    candle('2026-01-01', 10, 14), // Bull
    candle('2026-01-02', 14, 12), // Bear
    candle('2026-01-03', 12, 12), // Neutral
    candle('2026-01-04', 12, 16), // Bull
    candle('2026-01-05', 16, 13), // Bear
  ];
  return {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
}

describe('candlestick rotor filter units', () => {
  test('exposes bullish, bearish, and neutral units and hides compare mode', () => {
    const trace = new Candlestick(createLayer());

    expect(trace.supportsCompareMode()).toBe(false);

    const units = trace.getRotorFilterUnits();
    expect(units.map(u => u.label)).toEqual([
      BULLISH_POINT_MODE,
      BEARISH_POINT_MODE,
      NEUTRAL_POINT_MODE,
    ]);
    expect(units.map(u => u.key)).toEqual(['Bull', 'Bear', 'Neutral']);
  });

  test('bullish unit skips to the next bullish candle to the right', () => {
    const trace = new Candlestick(createLayer());
    // Cursor starts on candle 0 (Bull); the next bullish candle is index 3.
    expect(trace.moveToRotorFilter('Bull', 'right')).toBe(true);
    expect(trace.col).toBe(3);

    // No bullish candle further right.
    expect(trace.moveToRotorFilter('Bull', 'right')).toBe(false);
    expect(trace.col).toBe(3);
  });

  test('bearish unit navigates in both directions', () => {
    const trace = new Candlestick(createLayer());

    expect(trace.moveToRotorFilter('Bear', 'right')).toBe(true);
    expect(trace.col).toBe(1);
    expect(trace.moveToRotorFilter('Bear', 'right')).toBe(true);
    expect(trace.col).toBe(4);
    expect(trace.moveToRotorFilter('Bear', 'left')).toBe(true);
    expect(trace.col).toBe(1);
  });

  test('neutral unit finds the single neutral candle then reports bounds', () => {
    const trace = new Candlestick(createLayer());

    expect(trace.moveToRotorFilter('Neutral', 'right')).toBe(true);
    expect(trace.col).toBe(2);
    expect(trace.moveToRotorFilter('Neutral', 'right')).toBe(false);
    expect(trace.col).toBe(2);
  });

  test('preserves the active segment while filtering candles', () => {
    const trace = new Candlestick(createLayer());
    trace.moveToRotorFilter('Bear', 'right');

    const state = trace.state;
    expect(state.empty).toBe(false);
    if (!state.empty) {
      // Default entry segment is 'close'; it must carry across a filter jump.
      expect(state.text.section).toBe('close');
      expect(state.text.main.value).toBe('2026-01-02');
    }
  });

  test('vertical movement is out of bounds and warns without moving', () => {
    const trace = new Candlestick(createLayer());
    const observer = { update: jest.fn() };
    trace.addObserver(observer);

    expect(trace.moveToRotorFilter('Bull', 'up')).toBe(false);
    expect(trace.moveToRotorFilter('Bull', 'down')).toBe(false);
    expect(trace.col).toBe(0);
    // notifyRotorBounds fires an update carrying the warning flag.
    expect(observer.update).toHaveBeenCalled();
  });
});
