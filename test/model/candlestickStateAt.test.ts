import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { Candlestick, CANDLESTICK_SECTIONS } from '@model/candlestick';
import { TraceType } from '@type/grammar';

const CLOSE_ROW = CANDLESTICK_SECTIONS.indexOf('close');

/**
 * Creates a candlestick layer with three candles for state-at tests.
 * @returns A candlestick layer definition
 */
function createCandlestickLayer(): MaidrLayer {
  const data: CandlestickPoint[] = [
    { value: '2026-01-01', open: 10, high: 15, low: 9, close: 14, volume: 100, trend: 'Bull', volatility: 6 },
    { value: '2026-01-02', open: 14, high: 18, low: 13, close: 17, volume: 120, trend: 'Bull', volatility: 5 },
    { value: '2026-01-03', open: 17, high: 19, low: 12, close: 13, volume: 90, trend: 'Bear', volatility: 7 },
  ];
  return {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
}

describe('candlestick.getStateAt', () => {
  test('computes the state for the requested candle, not the cursor candle', () => {
    const trace = new Candlestick(createCandlestickLayer());

    // Cursor sits on candle 0; request the close of candle 1.
    const state = trace.getStateAt(CLOSE_ROW, 1);

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.text.main.value).toBe('2026-01-02');
      expect(state.text.cross.value).toBe(17);
      expect(state.text.section).toBe('close');
    }
  });

  test('restores the cursor and internal point index', () => {
    const trace = new Candlestick(createCandlestickLayer());

    const before = trace.getStateAt(CLOSE_ROW, 0);
    trace.getStateAt(CLOSE_ROW, 2);
    const after = trace.getStateAt(CLOSE_ROW, 0);

    // Reading state at another candle must not change what the cursor sees.
    expect(after).toEqual(before);
  });

  test('does not notify observers', () => {
    const trace = new Candlestick(createCandlestickLayer());
    const observer = { update: jest.fn() };
    trace.addObserver(observer);

    trace.getStateAt(CLOSE_ROW, 1);

    expect(observer.update).not.toHaveBeenCalled();
  });
});
