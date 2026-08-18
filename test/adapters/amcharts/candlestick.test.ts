/**
 * An amCharts candlestick or OHLC chart is a candlestick, and used to be
 * nothing at all (#1053).
 *
 * `classifySeriesKind` names every series class it can read.
 * `CandlestickSeries` and `OHLCSeries` were in none of the sets, so they fell
 * through to the closing `return 'bar'` — and a bar has no marks to find on a
 * chart with no category axis, so the series was dropped as empty and
 * `fromXYChart` threw.
 *
 * Measured on real amCharts 5 (`index.js` + `xy.js`) in Chromium, three days
 * of OHLC on a `DateAxis`:
 *
 *   am5xy.CandlestickSeries   className CandlestickSeries   layers: none, threw
 *   am5xy.OHLCSeries          className OHLCSeries          layers: none, threw
 *
 *   Error: maidr amCharts binder: no supported series with data found
 *
 * and everything the trace needs was already on the data item:
 *
 *   item.get:  { valueX: 1704067200000, valueY: 12,
 *                openValueY: 10, highValueY: 14, lowValueY: 9 }
 *   settings:  { valueXField: 'date', valueYField: 'close',
 *                openValueYField: 'open', highValueYField: 'high',
 *                lowValueYField: 'low' }
 *
 * The closing `bar` default is what makes this worth pinning rather than just
 * fixing: it *describes* an unknown series rather than declining it. A
 * financial series escaped it only by accident — drawn against a `DateAxis`
 * there are no categories for the bar path to find, so the chart failed loudly
 * instead of quietly. On a `CategoryAxis` it would have been announced as a
 * bar chart of its closing prices.
 */
import type { AmXYSeries } from '@adapters/amcharts/types';
import type { CandlestickPoint } from '@type/grammar';
import { fromXYChart } from '@adapters/amcharts/adapter';
import { classifySeriesKind } from '@adapters/amcharts/extractor';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeContainerEl, fakeSeries } from './helpers';

/** Three days, measured: two up and one down, so a Bear cannot hide. */
const DAYS = [
  { date: Date.UTC(2024, 0, 1), open: 10, high: 14, low: 9, close: 12 },
  { date: Date.UTC(2024, 0, 2), open: 12, high: 16, low: 11, close: 15 },
  { date: Date.UTC(2024, 0, 3), open: 15, high: 15, low: 12, close: 13 },
];

/**
 * A financial series, with the prices on the item fields amCharts binds them
 * to and the date on `valueX` as epoch milliseconds.
 * @param className - `'CandlestickSeries'` or `'OHLCSeries'`
 * @param days - The candles to draw
 * @returns The fake series
 */
function financialSeries(className: string, days = DAYS): AmXYSeries {
  return fakeSeries({
    className,
    name: 'ACME',
    settings: {
      valueXField: 'date',
      valueYField: 'close',
      openValueYField: 'open',
      highValueYField: 'high',
      lowValueYField: 'low',
    },
    data: days.map(day => ({
      valueX: day.date,
      valueY: day.close,
      openValueY: day.open,
      highValueY: day.high,
      lowValueY: day.low,
    })),
  });
}

/** The candles a chart of the given series converts to. */
function candlesOf(className: string, days = DAYS): CandlestickPoint[] {
  const chart = fakeChart({ series: [financialSeries(className, days)] });
  const layer = fromXYChart(chart, fakeContainerEl()).subplots[0][0].layers[0];
  expect(layer.type).toBe(TraceType.CANDLESTICK);
  return layer.data as CandlestickPoint[];
}

describe('amcharts candlestick', () => {
  it('classifies both financial series as candlesticks', () => {
    // Not as bars, which is what the closing default answers for anything
    // unlisted.
    expect(classifySeriesKind(financialSeries('CandlestickSeries'))).toBe('candlestick');
    expect(classifySeriesKind(financialSeries('OHLCSeries'))).toBe('candlestick');
  });

  it('reads the four prices, the trend and the volatility', () => {
    expect(candlesOf('CandlestickSeries')).toEqual([
      { value: '2024-01-01', open: 10, high: 14, low: 9, close: 12, trend: 'Bull', volatility: 5 },
      { value: '2024-01-02', open: 12, high: 16, low: 11, close: 15, trend: 'Bull', volatility: 5 },
      { value: '2024-01-03', open: 15, high: 15, low: 12, close: 13, trend: 'Bear', volatility: 3 },
    ]);
  });

  it('reads an OHLC the same way: the same numbers, a different mark', () => {
    expect(candlesOf('OHLCSeries')).toEqual(candlesOf('CandlestickSeries'));
  });

  it('announces a date rather than the epoch milliseconds behind it', () => {
    // The same threshold and the same format `formatCandlestickValue` uses for
    // Chart.js, so the two adapters do not disagree about what a date is.
    expect(candlesOf('CandlestickSeries')[0].value).toBe('2024-01-01');
  });

  it('calls a candle that closes where it opened neither bull nor bear', () => {
    const flat = [{ date: Date.UTC(2024, 0, 1), open: 10, high: 12, low: 8, close: 10 }];
    expect(candlesOf('CandlestickSeries', flat)[0].trend).toBe('Neutral');
  });

  it('leaves volume undefined rather than claiming zero', () => {
    // amCharts keeps volume on a separate series when a chart draws one at
    // all, so a zero here would report a measurement nobody took.
    expect(candlesOf('CandlestickSeries')[0].volume).toBeUndefined();
  });

  it('skips a candle missing one of its four prices', () => {
    // The extractor drops it, so an index into the result keeps naming the
    // candle it addresses -- the rule `readCategoryValues` follows.
    const series = fakeSeries({
      className: 'CandlestickSeries',
      name: 'ACME',
      settings: {
        valueXField: 'date',
        valueYField: 'close',
        openValueYField: 'open',
        highValueYField: 'high',
        lowValueYField: 'low',
      },
      data: [
        { valueX: Date.UTC(2024, 0, 1), valueY: 12, openValueY: 10, highValueY: 14, lowValueY: 9 },
        { valueX: Date.UTC(2024, 0, 2), valueY: 15, openValueY: 12, highValueY: 16 },
        { valueX: Date.UTC(2024, 0, 3), valueY: 13, openValueY: 15, highValueY: 15, lowValueY: 12 },
      ],
    });
    const chart = fakeChart({ series: [series] });
    const layer = fromXYChart(chart, fakeContainerEl()).subplots[0][0].layers[0];

    expect((layer.data as CandlestickPoint[]).map(c => c.value))
      .toEqual(['2024-01-01', '2024-01-03']);
  });
});
