import type { AbstractTrace } from '@model/abstract';
import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * What `d` says about a price chart.
 *
 * The dialog is the only surface a reader can compare against what they heard
 * walking the chart, so every disagreement between the two is a reader unable
 * to check their own reading: a range labelled `Price range` that reports a
 * volatility as the low, a column headed for an axis the chart does not draw
 * the periods along, a braille grid with five lanes over a table with four
 * price columns, and trend tallies that do not add up to the number of
 * periods.
 *
 * The layers carry no `selectors`, so the traces need no DOM.
 */

/** A rising candle, so every candle sorts its segments the same way. */
function candle(
  value: string,
  open: number,
  close: number,
  volume?: number,
): CandlestickPoint {
  const high = Math.max(open, close) + 2;
  const low = Math.min(open, close) - 1;
  return {
    value,
    open,
    high,
    low,
    close,
    ...(volume === undefined ? {} : { volume }),
    volatility: high - low,
  };
}

const PRICES: CandlestickPoint[] = [
  candle('mon', 10, 13),
  candle('tue', 13, 12),
  candle('wed', 12, 12),
];

/**
 * Builds a candlestick layer.
 * @param data The candles the layer carries
 * @param axes The axis labels the producer authored
 * @param orientation Which way the chart is drawn
 * @returns The layer definition
 */
function layerOf(
  data: CandlestickPoint[],
  axes: MaidrLayer['axes'] = { x: { label: 'Date' }, y: { label: 'Price' } },
  orientation?: Orientation,
): MaidrLayer {
  return {
    id: 'price-layer',
    type: TraceType.CANDLESTICK,
    axes,
    data,
    ...(orientation === undefined ? {} : { orientation }),
  };
}

/**
 * The description of a candlestick built from the given layer.
 * @param layer The layer to build
 * @returns The description under test
 */
function describedBy(layer: MaidrLayer): DescriptionState {
  return (TraceFactory.create(layer) as AbstractTrace).description;
}

/**
 * Reads one stat by its label, as a reader hears it rather than by position.
 * @param description The description to read
 * @param label The stat's label
 * @returns The stat's value, or undefined when it was not reported
 */
function statOf(
  description: DescriptionState,
  label: string,
): string | number | number[] | undefined {
  return description.stats.find(stat => stat.label === label)?.value;
}

describe('the price range is a range of prices', () => {
  test('excludes the volatility row it used to take its minimum from', () => {
    // Volatility is a high-minus-low difference and sits below every price on
    // any real chart, so a range spanning it reported the widest candle's
    // spread as the cheapest the chart ever traded. Prices here run 9 to 15
    // and the volatilities are 6, 4 and 3.
    expect(statOf(describedBy(layerOf(PRICES)), 'Price range')).toBe('9 to 15');
  });

  test('reports no range at all on a chart with no candles', () => {
    // `minFrom2D` answers Infinity and -Infinity for an empty grid by design.
    // Composed into a string those reach the reader as the literal text
    // "Infinity to -Infinity", which the dialog's blanking cannot catch
    // because it tests numbers.
    expect(statOf(describedBy(layerOf([])), 'Price range')).toBe('missing');
  });
});

describe('the trend tallies account for every period', () => {
  test('counts the neutral candles beside the bull and bear ones', () => {
    const description = describedBy(layerOf(PRICES));

    // One up, one down, one unchanged. Without the third a reader hears
    // "3 periods, 1 bull, 1 bear" and cannot tell whether the remainder is a
    // neutral candle or a miscount -- while the rotor offers to walk it.
    expect(statOf(description, 'Bull count')).toBe(1);
    expect(statOf(description, 'Bear count')).toBe(1);
    expect(statOf(description, 'Neutral count')).toBe(1);
  });
});

describe('the span the chart covers', () => {
  test('names the first and last period and the move between them', () => {
    const description = describedBy(layerOf(PRICES));

    // Closes 13 and 12: down 1, which the tallies cannot say. A series can
    // close lower over more up days than down.
    expect(statOf(description, 'Period covered')).toBe('mon to wed');
    expect(statOf(description, 'Net change')).toBe('-1 (-7.69%)');
  });

  test('says nothing about a single-candle chart', () => {
    const description = describedBy(layerOf([candle('mon', 10, 13)]));

    // "mon to mon" is a window with no width, and a net change against the
    // period's own open is not what the label promises.
    expect(statOf(description, 'Period covered')).toBeUndefined();
    expect(statOf(description, 'Net change')).toBeUndefined();
  });
});

describe('the data table shows what the chart drew', () => {
  test('carries volatility, where the braille carries its row', () => {
    const description = describedBy(layerOf(PRICES));

    // Five braille lanes against four price columns was the two surfaces of
    // one chart disagreeing about how many quantities it has -- and a reader
    // arriving from the volatility lane, or from "Max Volatility at ...",
    // found nothing in the dialog to check it against.
    expect(description.dataTable.headers).toEqual([
      'Date',
      'Volatility',
      'Open',
      'High',
      'Low',
      'Close',
      'Trend',
    ]);
    expect(description.dataTable.rows[0]).toEqual([
      'mon',
      6,
      10,
      15,
      9,
      13,
      'Bull',
    ]);
  });

  test('leaves out a volume column the chart has no volume for', () => {
    const headers = describedBy(layerOf(PRICES)).dataTable.headers;

    // Plotly, Google Charts and amCharts all emit an OHLC candlestick with no
    // volume, deliberately rather than as a zero. A header announced over an
    // empty cell on every row reads as data the export lost.
    expect(headers).not.toContain('Volume');
  });

  test('keeps it where the chart does record one', () => {
    const withVolume = PRICES.map((c, index) => ({ ...c, volume: 100 + index }));
    const description = describedBy(layerOf(withVolume));

    expect(description.dataTable.headers).toContain('Volume');
    expect(description.dataTable.rows[0]).toContain(100);
  });

  test('heads the period column with the axis the announcement names', () => {
    const headers = describedBy(
      layerOf(PRICES, { x: { label: 'Session' }, y: { label: 'Price' } }),
    ).dataTable.headers;

    // The move announcement says "Session is mon". Tabulating the same column
    // under `Date` is two names for one thing in one dialog.
    expect(headers[0]).toBe('Session');
  });

  test('follows the orientation, as the announcement does', () => {
    const headers = describedBy(
      layerOf(
        PRICES,
        { x: { label: 'Price' }, y: { label: 'Session' } },
        Orientation.HORIZONTAL,
      ),
    ).dataTable.headers;

    // A horizontal chart runs its periods along y, so naming the column after
    // x names an axis the periods are not drawn along.
    expect(headers[0]).toBe('Session');
  });
});
