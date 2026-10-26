/**
 * A candlestick's date is the day the chart draws it on.
 *
 * Chart.js's date adapters draw a time scale in the reader's own time zone,
 * and a page that builds its candles with Luxon's `DateTime.fromISO` puts each
 * one at local midnight. The extractor read the date in UTC instead, which
 * east of UTC is the day before: a reader in Berlin or Seoul heard every
 * candle one day early.
 */
import type { ChartJsChart } from '@adapters/chartjs/types';
import type { CandlestickPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';

/** Seoul's offset from UTC: nine hours, with no daylight saving. */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Runs `read` with the calendar a reader in Seoul has.
 *
 * The suite runs in UTC, where the two readings agree, and Jest cannot move
 * the process to another zone mid-run: the `process.env` a test sees is a
 * copy, so setting `TZ` there changes nothing. The global `Date` is swapped
 * instead for one whose local year, month and day are Seoul's.
 *
 * @param read - The reading to take
 * @returns What `read` returned
 */
function inSeoul<T>(read: () => T): T {
  const RealDate = Date;
  class SeoulDate extends RealDate {
    override getFullYear(): number {
      return new RealDate(this.getTime() + SEOUL_OFFSET_MS).getUTCFullYear();
    }

    override getMonth(): number {
      return new RealDate(this.getTime() + SEOUL_OFFSET_MS).getUTCMonth();
    }

    override getDate(): number {
      return new RealDate(this.getTime() + SEOUL_OFFSET_MS).getUTCDate();
    }
  }

  globalThis.Date = SeoulDate as DateConstructor;
  try {
    return read();
  } finally {
    globalThis.Date = RealDate;
  }
}

/**
 * A candlestick chart on a time scale, one candle per instant.
 *
 * @param instants - Each candle's `x`, in epoch milliseconds
 * @returns A chart shaped the way the extractor expects
 */
function candlestickChart(instants: number[]): ChartJsChart {
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data: {
      datasets: [{
        label: 'Stock Price',
        data: instants.map(x => ({ x, o: 100, h: 110, l: 95, c: 105 })),
      }],
    },
    options: { scales: { x: { type: 'time' } } },
    config: { type: 'candlestick' },
    getDatasetMeta: () => ({ data: [], type: 'candlestick' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The dates the extractor gives the candles, in order. */
function candleDates(chart: ChartJsChart): string[] {
  const layer = extractChartData(chart).maidr.subplots[0][0].layers[0];
  return (layer.data as CandlestickPoint[]).map(candle => candle.value);
}

describe('chart.js candlestick dates', () => {
  it('reads each candle on the day a reader east of UTC sees it drawn', () => {
    // Midnight on 1 and 2 January 2024 in Seoul, which is 15:00 UTC the day
    // before: what `DateTime.fromISO('2024-01-01')` gives a page there.
    const chart = candlestickChart([
      Date.UTC(2023, 11, 31, 15),
      Date.UTC(2024, 0, 1, 15),
    ]);

    const dates = inSeoul(() => candleDates(chart));

    expect(dates).toEqual(['2024-01-01', '2024-01-02']);
  });
});
