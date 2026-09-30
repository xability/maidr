import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { TraceType } from '@type/grammar';

/**
 * Re-entering a candlestick panel from the lobby kept the old candle for the
 * text and braille but not for the highlight and pan.
 *
 * `resetToInitialEntry` zeroes `row` and `col` and leaves the candle index
 * alone, and the candlestick's initial entry deliberately keeps that index.
 * It only recomputed the segment row, though, so `col` -- which the highlight
 * and the audio pan read -- stayed on candle 0 while the announcement and the
 * braille read the remembered candle.
 */
function createCandlestickLayer(): MaidrLayer {
  const data: CandlestickPoint[] = Array.from({ length: 6 }, (_, i) => ({
    value: `d${i}`,
    open: 10 + i,
    high: 20 + i,
    low: 5 + i,
    close: 12 + (i % 3) * 3,
    volume: 100,
    trend: 'Bull',
    volatility: 15,
  }));
  return {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
}

describe('candlestick re-entry', () => {
  test('the first arrow after re-entry keeps every surface on the same candle', () => {
    const trace = new Candlestick(createCandlestickLayer());
    trace.moveOnce('FORWARD');
    for (let i = 0; i < 4; i++) {
      trace.moveOnce('FORWARD');
    }
    expect(trace.col).toBe(4);

    trace.resetToInitialEntry();
    trace.moveOnce('FORWARD');

    const state = trace.state;
    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.main.value).toBe('d4');
    expect(trace.col).toBe(4);
    expect(state.audio.panning.x).toBe(4);
    expect(state.braille.empty).toBe(false);
    if (!state.braille.empty) {
      expect(state.braille.col).toBe(4);
    }
  });
});
