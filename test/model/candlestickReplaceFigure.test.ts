import type { CandlestickPoint, Maidr } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * A live data update rebuilds the candlestick trace, which navigates by its
 * own candle index and segment rather than by `row`/`col`. Restoring only
 * `row`/`col` left the rebuilt trace on the first candle's close, so every
 * redraw of a bound chart (a resize included) sent the reader back to the
 * start.
 */

const CANDLES: CandlestickPoint[] = [
  { value: 'Mar 3', open: 52.1, high: 53.4, low: 51.8, close: 52.9, volume: 0, trend: 'Bull', volatility: 1.6 },
  { value: 'Mar 4', open: 52.9, high: 55.0, low: 52.5, close: 54.6, volume: 0, trend: 'Bull', volatility: 2.5 },
  { value: 'Mar 5', open: 53.6, high: 54.8, low: 52.7, close: 53.1, volume: 0, trend: 'Bear', volatility: 2.1 },
  { value: 'Mar 6', open: 53.1, high: 56.2, low: 53.0, close: 55.9, volume: 0, trend: 'Bull', volatility: 3.2 },
];

/**
 * A single-candlestick-layer figure.
 * @param candles - The candles
 * @returns The MAIDR data
 */
function candlestickMaidr(candles: CandlestickPoint[]): Maidr {
  return {
    id: 'candles',
    subplots: [[{
      layers: [{
        id: 'layer',
        type: TraceType.CANDLESTICK,
        axes: { x: { label: 'Day' }, y: { label: 'Price' } },
        data: candles,
      }],
    }]],
  };
}

/**
 * What the reader is on: the candle and the segment.
 * @param state - The active element's state
 * @returns The candle's label and the segment
 */
function position(state: Context['active']['state']): { candle: unknown; section: unknown } {
  if (state.empty || state.type !== 'trace') {
    throw new Error('The reader is not on a point');
  }
  return { candle: state.text.main.value, section: state.text.section };
}

describe('candlestick position across a live data update', () => {
  test('keeps the reader on their candle and segment when the same data is redrawn', () => {
    const context = new Context(new Figure(candlestickMaidr(CANDLES)));
    for (let i = 0; i < 3; i++) {
      context.moveOnce('FORWARD');
    }
    context.moveOnce('UPWARD');
    const before = position(context.active.state);

    context.replaceFigure(() => new Figure(candlestickMaidr(CANDLES)));

    expect(before).toEqual({ candle: 'Mar 5', section: 'open' });
    expect(position(context.active.state)).toEqual(before);
    // The next key moves on from there, not from the first candle.
    context.moveOnce('FORWARD');
    expect(position(context.active.state).candle).toBe('Mar 6');
  });

  test('keeps the candle when the data changes', () => {
    const context = new Context(new Figure(candlestickMaidr(CANDLES)));
    context.moveOnce('FORWARD');
    context.moveOnce('FORWARD');

    const shifted = CANDLES.map(candle => ({
      ...candle,
      open: (candle.open ?? 0) + 1,
      high: candle.high + 1,
      low: candle.low + 1,
      close: candle.close + 1,
    }));
    context.replaceFigure(() => new Figure(candlestickMaidr(shifted)));

    expect(position(context.active.state)).toEqual({ candle: 'Mar 4', section: 'close' });
  });
});
