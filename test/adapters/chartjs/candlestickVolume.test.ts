/**
 * A Chart.js candlestick carries no volume, so its description has no Volume
 * column.
 *
 * `chartjs-chart-financial` draws open, high, low and close and nothing else.
 * The extractor wrote `volume: 0` on every candle, which defeated the core's
 * rule of leaving the column out when no candle has a volume: the data table
 * carried a Volume column of zeros, read as volume that was measured.
 */
import type { ChartJsChart } from '@adapters/chartjs/types';
import type { AbstractTrace } from '@model/abstract';
import type { CandlestickPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { TraceFactory } from '@model/factory';

/**
 * A two-candle chart on a time scale, as the financial plugin is drawn.
 *
 * @returns A chart shaped the way the extractor expects
 */
function candlestickChart(): ChartJsChart {
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data: {
      datasets: [{
        label: 'Stock Price',
        data: [
          { x: Date.UTC(2024, 0, 1), o: 100, h: 110, l: 95, c: 105 },
          { x: Date.UTC(2024, 0, 2), o: 105, h: 115, l: 100, c: 112 },
        ],
      }],
    },
    options: { scales: { x: { type: 'time', title: { display: true, text: 'Day' } } } },
    config: { type: 'candlestick' },
    getDatasetMeta: () => ({ data: [], type: 'candlestick' }),
    setActiveElements: () => {},
    update: () => {},
  };
}

describe('chart.js candlestick volume', () => {
  it('records no volume for a chart that draws none', () => {
    const layer = extractChartData(candlestickChart()).maidr.subplots[0][0].layers[0];

    const candles = layer.data as CandlestickPoint[];

    expect(candles.map(candle => candle.volume)).toEqual([undefined, undefined]);
  });

  it('leaves the Volume column out of the description\'s data table', () => {
    const layer = extractChartData(candlestickChart()).maidr.subplots[0][0].layers[0];

    const table = (TraceFactory.create(layer) as AbstractTrace).description.dataTable;

    expect(table?.headers).toEqual(['Day', 'Volatility', 'Open', 'High', 'Low', 'Close', 'Trend']);
  });
});
