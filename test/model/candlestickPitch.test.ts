import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Candlestick, candlestickSectionsOf } from '@model/candlestick';
import { TraceType } from '@type/grammar';

/**
 * The registers a candlestick is pitched on.
 *
 * Open, high, low and close are prices on one axis, and share one register,
 * from the lowest low to the highest high. Volatility is a high-minus-low
 * difference, a few points where the prices are tens or thousands, and has a
 * register of its own. On one register with the prices it took the bottom of
 * the range, and every price was squeezed into the top few percent of it.
 *
 * Three candles: the lowest low is 9 (the first candle), the highest high 19
 * (the third), and the volatilities are 6, 5 and 7.
 */
const CANDLES: CandlestickPoint[] = [
  { value: '2026-01-01', open: 10, high: 15, low: 9, close: 14, volume: 100, trend: 'Bull', volatility: 6 },
  { value: '2026-01-02', open: 14, high: 18, low: 13, close: 17, volume: 120, trend: 'Bull', volatility: 5 },
  { value: '2026-01-03', open: 17, high: 19, low: 12, close: 13, volume: 90, trend: 'Bear', volatility: 7 },
];

/**
 * A candlestick over the given candles.
 * @param data - The candles
 * @returns The trace
 */
function candlestick(data: CandlestickPoint[] = CANDLES): Candlestick {
  const layer: MaidrLayer = {
    id: 'candles',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
  return new Candlestick(layer);
}

/**
 * The tone of one section of one candle.
 * @param data - The candles
 * @param section - The section
 * @param candle - The candle's index
 * @returns The tone's frequency state
 */
function toneOf(
  data: CandlestickPoint[],
  section: 'volatility' | 'open' | 'high' | 'low' | 'close',
  candle: number,
): AudioState['freq'] {
  const row = candlestickSectionsOf(data).indexOf(section);
  const state = candlestick(data).getStateAt(row, candle);
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return (state as NonEmptyTraceState).audio.freq;
}

/**
 * Where a tone sits in its register, from 0 (the bottom note) to 1 (the top).
 * @param freq - The tone's frequency state
 * @returns The position in the register
 */
function placeOf(freq: AudioState['freq']): number {
  return ((freq.raw as number) - freq.min) / (freq.max - freq.min);
}

describe('a candlestick\'s prices', () => {
  test('are pitched from the lowest low to the highest high', () => {
    expect(toneOf(CANDLES, 'close', 1)).toEqual({ min: 9, max: 19, raw: 17 });
  });

  test('span the whole register', () => {
    // The lowest low the bottom note and the highest high the top. On the
    // register the volatility shared, the lowest low sat 29% of the way up.
    expect(placeOf(toneOf(CANDLES, 'low', 0))).toBe(0);
    expect(placeOf(toneOf(CANDLES, 'high', 2))).toBe(1);
  });

  test('share one register across every section', () => {
    for (const section of ['open', 'high', 'low', 'close'] as const) {
      const { min, max } = toneOf(CANDLES, section, 2);

      expect([min, max]).toEqual([9, 19]);
    }
  });

  test('share it on a chart that records no open', () => {
    const noOpen = CANDLES.map(({ open: _open, ...candle }) => candle);

    expect(toneOf(noOpen, 'close', 0)).toEqual({ min: 9, max: 19, raw: 14 });
  });
});

describe('a candlestick\'s volatility', () => {
  test('is pitched on a register of its own', () => {
    expect(toneOf(CANDLES, 'volatility', 1)).toEqual({ min: 5, max: 7, raw: 5 });
    expect(placeOf(toneOf(CANDLES, 'volatility', 2))).toBe(1);
  });
});
