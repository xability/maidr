import type { HighchartsPoint } from '@adapters/highcharts/types';
import type { CandlestickPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeGraphic, fakeSeries } from './helpers';

/**
 * The third of Highcharts' price series was declined outright (#1188).
 *
 * `candlestick` and `ohlc` carry an open; `hlc` draws the same high, low and
 * close without one. Measured on Highcharts 13.0.1, an `hlc` point comes
 * back as `{"x":0,"y":3,"low":1,"high":5,"close":3}` — no `open` at all, and
 * `y` is the close.
 *
 * `CandlestickPoint.open` was required and `convertCandlestickSeries`
 * filtered `p.open != null`, so dispatching it there would have emitted
 * **zero** points — a phantom layer rather than a reading. It therefore fell
 * to the adapter's `default:` and the chart was silent. Reading it as an
 * `error_bar` would have been exact in the data and wrong in the name, which
 * is the trade #1140 rules out.
 */

function priceChart(type: string, data: Partial<HighchartsPoint>[]) {
  const chart = fakeChart({
    renderToId: 'price-chart',
    series: [fakeSeries({
      index: 0,
      type,
      name: 'Price',
      data: data.map(point => ({ graphic: fakeGraphic(), ...point })) as never,
    })],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers;
}

describe('highcharts hlc series', () => {
  it('reads as a candlestick rather than registering nothing', () => {
    const layers = priceChart('hlc', [
      { x: 0, high: 5, low: 1, close: 3 },
      { x: 1, high: 7, low: 2, close: 6 },
    ]);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.CANDLESTICK);
    expect(layers[0].data).toHaveLength(2);
  });

  it('emits no open and no trend, rather than inventing either', () => {
    const [first] = priceChart('hlc', [
      { x: 0, high: 5, low: 1, close: 3 },
    ])[0].data as CandlestickPoint[];

    // Defaulting the open to the close would announce an opening price the
    // series never recorded, and would make every candle "Neutral" — a
    // finding, where the truth is that the chart never said.
    expect(first.open).toBeUndefined();
    expect(first.trend).toBeUndefined();
    expect(first).toMatchObject({ high: 5, low: 1, close: 3 });
  });

  it('leaves an ohlc series carrying both', () => {
    const [first] = priceChart('ohlc', [
      { x: 0, open: 2, high: 5, low: 1, close: 3 },
    ])[0].data as CandlestickPoint[];

    expect(first).toMatchObject({ open: 2, high: 5, low: 1, close: 3, trend: 'Bull' });
  });

  it('leaves a candlestick series carrying both', () => {
    const [first] = priceChart('candlestick', [
      { x: 0, open: 4, high: 5, low: 1, close: 3 },
    ])[0].data as CandlestickPoint[];

    expect(first).toMatchObject({ open: 4, close: 3, trend: 'Bear' });
  });

  it('still declines a point with no close, which names nothing', () => {
    // The close is the one price every series in this family carries, and it
    // is what the filter now asks for. A point without it has no value to
    // announce on any of the four rows.
    const layers = priceChart('hlc', [
      { x: 0, high: 5, low: 1, close: 3 },
      { x: 1, high: 7, low: 2 },
    ]);

    expect(layers[0].data).toHaveLength(1);
  });
});
