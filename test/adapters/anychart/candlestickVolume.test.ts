/**
 * The volume of an AnyChart candlestick, which most charts do not record.
 *
 * Core lists a Volume column in the description's table only when a candle
 * carries a number there. A missing volume read as zero put a column of zeros
 * under "Volume" on a chart that draws none.
 */

import type { AnyChartInstance, AnyChartSeries } from '@adapters/anychart/types';
import type { CandlestickPoint } from '@type/grammar';
import { anyChartToMaidr } from '@adapters/anychart/converters';
import { describe, expect, it } from '@jest/globals';

function candlesFrom(rows: Array<Record<string, unknown>>): CandlestickPoint[] {
  const series: AnyChartSeries = {
    id: () => 0,
    name: () => 'Price',
    seriesType: () => 'candlestick',
    getIterator: () => {
      let index = -1;
      return {
        advance: () => ++index < rows.length,
        get: (field: string) => rows[index]?.[field],
        getIndex: () => index,
        getRowsCount: () => rows.length,
        reset: () => {
          index = -1;
        },
      };
    },
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
  const chart: AnyChartInstance = {
    title: () => 'Daily prices',
    container: () => '',
    getSeriesCount: () => 1,
    getSeriesAt: (i: number) => (i === 0 ? series : null),
  };
  return anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as CandlestickPoint[];
}

describe('an anychart candlestick', () => {
  it('carries no volume on a candle whose row records none', () => {
    // `[x, open, high, low, close]`, as the example writes its rows.
    const candles = candlesFrom([
      { x: '2024-01-01', open: 100, high: 110, low: 95, close: 108 },
      { x: '2024-01-02', open: 108, high: 112, low: 101, close: 103 },
    ]);

    expect(candles.map(candle => 'volume' in candle)).toEqual([false, false]);
  });

  it('keeps the volume a row records', () => {
    const candles = candlesFrom([
      { x: '2024-01-01', open: 100, high: 110, low: 95, close: 108, volume: 1200 },
      { x: '2024-01-02', open: 108, high: 112, low: 101, close: 103, volume: '950' },
      { x: '2024-01-03', open: 103, high: 106, low: 99, close: 104 },
    ]);

    expect(candles.map(candle => candle.volume)).toEqual([1200, 950, undefined]);
  });
});
