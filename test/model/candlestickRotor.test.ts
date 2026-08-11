import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
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
  test('exposes bullish, bearish, and neutral units alongside compare mode', () => {
    const trace = new Candlestick(createLayer());

    // Trend units are additive: the built-in lower/higher value compare
    // units remain available too.
    expect(trace.supportsCompareMode()).toBe(true);

    const units = trace.getRotorFilterUnits();
    expect(units.map(u => u.label)).toEqual([
      BULLISH_POINT_MODE,
      BEARISH_POINT_MODE,
      NEUTRAL_POINT_MODE,
    ]);
    expect(units.map(u => u.key)).toEqual(['Bull', 'Bear', 'Neutral']);
  });

  test('omits trend units with no matching candles', () => {
    // An all-bullish chart should advertise only the bullish unit, so the
    // rotor never cycles into a dead-end bearish/neutral mode.
    const allBull: CandlestickPoint[] = [
      candle('2026-01-01', 10, 12),
      candle('2026-01-02', 12, 15),
      candle('2026-01-03', 15, 18),
    ];
    const trace = new Candlestick({
      id: 'candle-layer',
      type: TraceType.CANDLESTICK,
      axes: { x: { label: 'Date' }, y: { label: 'Price' } },
      data: allBull,
    });

    expect(trace.getRotorFilterUnits().map(u => u.label)).toEqual([
      BULLISH_POINT_MODE,
    ]);
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

  test('first filtered move clears initial entry so it is not swallowed later', () => {
    const trace = new Candlestick(createLayer());
    expect(trace.isInitialEntry).toBe(true);

    // Reaching a trend unit and pressing a direction is a valid first move —
    // no plain arrow press is required first.
    expect(trace.moveToRotorFilter('Bull', 'right')).toBe(true);
    expect(trace.isInitialEntry).toBe(false);
    expect(trace.col).toBe(3);

    // Because initial entry was consumed, a following ordinary move navigates
    // instead of being absorbed by the initial-entry branch of moveOnce.
    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.col).toBe(4);
  });
});
