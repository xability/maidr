import type { HighchartsPoint } from '@adapters/highcharts/types';
import type { CandlestickPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { fakeChart, fakeGraphic, fakeSeries } from './helpers';

/**
 * A candlestick whose candles record no volume came out with a volume of 0 on
 * every candle, so the description's data table showed a Volume column of
 * zeros for a chart that draws none. `Candlestick` leaves that column out
 * only when no candle carries a volume, and the zeros defeated it.
 */

// The fake chart draws no candles, so the adapter warns that it found none to
// stamp for highlighting; that warning is not what these cases are about.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => warn.mockRestore());

/**
 * The candles of a candlestick chart.
 *
 * @param data - The points, as Highcharts builds them
 * @returns The layer's candles
 */
function candles(data: Partial<HighchartsPoint>[]): CandlestickPoint[] {
  const chart = fakeChart({
    renderToId: 'candlestick-chart',
    series: [fakeSeries({
      index: 0,
      type: 'candlestick',
      name: 'AAPL',
      data: data.map(point => ({ graphic: fakeGraphic(), ...point })),
    })],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers[0].data as CandlestickPoint[];
}

describe('highcharts candlestick volume', () => {
  it('leaves the volume out of a candle that records none', () => {
    // `data: [[open, high, low, close], …]`, as the example page declares it.
    const read = candles([
      { x: 0, category: '2024-01-02', open: 150, high: 153, low: 149, close: 152.5, options: {} },
      { x: 1, category: '2024-01-03', open: 152.5, high: 154, low: 151, close: 151, options: {} },
    ]);

    expect(read).toHaveLength(2);
    expect(read.map(candle => 'volume' in candle)).toEqual([false, false]);
  });

  it('keeps a volume the candle declares, a zero included', () => {
    const read = candles([
      { x: 0, open: 150, high: 153, low: 149, close: 152.5, options: { volume: 1200 } },
      { x: 1, open: 152.5, high: 154, low: 151, close: 151, options: { volume: 0 } },
    ]);

    expect(read.map(candle => candle.volume)).toEqual([1200, 0]);
  });

  it('keeps the volume on the candles that declare one and leaves it off the rest', () => {
    const read = candles([
      { x: 0, open: 150, high: 153, low: 149, close: 152.5, options: { volume: 1200 } },
      { x: 1, open: 152.5, high: 154, low: 151, close: 151, options: {} },
    ]);

    expect(read.map(candle => candle.volume)).toEqual([1200, undefined]);
    expect('volume' in read[1]).toBe(false);
  });
});
