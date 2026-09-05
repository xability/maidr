import type { MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { TraceType } from '@type/grammar';

/**
 * A candlestick layer with no candles threw on the first keypress.
 *
 * `Subplot` constructs every layer without an empty-data filter and
 * `AbstractTrace.state` tolerates an empty series (#905), so the layer
 * renders. But `Candlestick` overrides `moveOnce` and `moveToExtreme` without
 * the `elements.length === 0` guard `MovableGrid` has, and its initial entry
 * clamps the candle index to 0 and reads `sortedSegmentsByPoint[0]` -- which
 * does not exist. The `TypeError` escaped the keybinding handler, so where
 * every other trace reports out of bounds, this one went silent.
 */
function emptyLayer(): MaidrLayer {
  return {
    id: 'no-candles',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: [],
  };
}

describe('a candlestick layer with no candles', () => {
  test('constructs and reports empty', () => {
    const trace = new Candlestick(emptyLayer());

    expect(trace.state.empty).toBe(true);
  });

  test.each(['FORWARD', 'BACKWARD', 'UPWARD', 'DOWNWARD'] as const)(
    'the first %s arrow reports out of bounds rather than throwing',
    (direction) => {
      const trace = new Candlestick(emptyLayer());
      const update = jest.fn();
      trace.addObserver({ update });

      expect(() => trace.moveOnce(direction)).not.toThrow();
      expect(trace.moveOnce(direction)).toBe(false);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ empty: true }));
    },
  );

  test.each(['FORWARD', 'BACKWARD', 'UPWARD', 'DOWNWARD'] as const)(
    'jumping to the %s extreme reports out of bounds rather than throwing',
    (direction) => {
      const trace = new Candlestick(emptyLayer());
      const update = jest.fn();
      trace.addObserver({ update });

      expect(() => trace.moveToExtreme(direction)).not.toThrow();
      expect(trace.moveToExtreme(direction)).toBe(false);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ empty: true }));
    },
  );

  test('a compare jump finds nothing rather than throwing', () => {
    const trace = new Candlestick(emptyLayer());

    expect(() => trace.moveToNextCompareValue('right', 'higher')).not.toThrow();
    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(false);
  });

  test('a trend filter jump finds nothing rather than throwing', () => {
    const trace = new Candlestick(emptyLayer());

    expect(() => trace.moveToRotorFilter('Bull', 'right')).not.toThrow();
    expect(trace.moveToRotorFilter('Bull', 'right')).toBe(false);
  });

  test('the state after an attempted move is still empty', () => {
    const trace = new Candlestick(emptyLayer());

    trace.moveOnce('FORWARD');
    trace.moveToNextCompareValue('left', 'lower');

    expect(trace.state.empty).toBe(true);
  });
});
