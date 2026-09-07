import type { DisplayService } from '@service/display';
import type { RotorNavigationService } from '@service/rotor';
import type { Maidr } from '@type/grammar';
import type { DisplayDescriptionState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { DescriptionService } from '@service/description';
import { FormatterService } from '@service/formatter';
import { TraceType } from '@type/grammar';

/**
 * The dialog and the announcements, over a chart whose author formatted it.
 *
 * A layer may declare a `format` per axis, and every announcement has honoured
 * it for a long time -- walking a chart shaped like
 * `examples/vertical-candlestick.html` announces "Jan 3" and a price in
 * dollars. The table in the same dialog printed `2023-01-03` and `180.2534`,
 * because nothing told it which column sat on which axis: one dialog
 * describing one value two ways, with nothing to say which was meant.
 *
 * Driven through a real `Figure`, `Context`, `FormatterService` and
 * `DescriptionService` rather than mocks, because the defect lived in the
 * seam between them and a mocked formatter is exactly the thing that cannot
 * prove it closed.
 */

/** The sessions the shipped example opens on, in the shape it carries them. */
const JAN_3 = '2023-01-03';
const JAN_4 = '2023-01-04';

/**
 * A one-layer candlestick figure, formatted the way the shipped example is:
 * a date function on the period axis, currency on the price axis.
 * @param formatted Whether the layer declares any format at all
 * @returns The figure and a formatter service built from the same data
 */
function candlestickFigure(formatted: boolean): {
  figure: Figure;
  formatter: FormatterService;
} {
  const maidr: Maidr = {
    id: 'chart',
    subplots: [[{
      layers: [{
        id: 'candles',
        type: TraceType.CANDLESTICK,
        axes: {
          x: {
            label: 'Date',
            // The shipped example's own format, which is what makes the
            // announcement say "Jan 3" where the payload says "2023-01-03".
            ...(formatted
              ? { format: { function: 'return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })' } }
              : {}),
          },
          y: {
            label: 'Price',
            ...(formatted ? { format: { type: 'currency', decimals: 2 } } : {}),
          },
        },
        data: [
          { value: JAN_3, open: 180.2534, high: 184.117, low: 179.5, close: 183.9, volatility: 4.617 },
          { value: JAN_4, open: 183.9, high: 186.25, low: 182.1, close: 185.75, volatility: 4.15 },
        ],
      }],
    }]],
  };
  return { figure: new Figure(maidr), formatter: new FormatterService(maidr) };
}

/**
 * Reads the description the dialog would render for that figure.
 * @param formatted Whether the layer declares any format at all
 * @returns The description as the dialog receives it
 */
function describeCandlestick(formatted: boolean): DisplayDescriptionState {
  const { figure, formatter } = candlestickFigure(formatted);
  const service = new DescriptionService(
    new Context(figure),
    { toggleFocus: jest.fn() } as unknown as DisplayService,
    { resetToDataMode: jest.fn() } as unknown as RotorNavigationService,
    formatter,
  );
  const description = service.getDescription();
  expect(description).not.toBeNull();
  return description as DisplayDescriptionState;
}

/**
 * One column of the table, by its header.
 * @param description The description under test
 * @param header The column heading to read
 * @returns Every cell under that heading, in row order
 */
function column(description: DisplayDescriptionState, header: string): unknown[] {
  const index = description.dataTable.headers.indexOf(header);
  expect(index).toBeGreaterThanOrEqual(0);
  return description.dataTable.rows.map(row => row[index]);
}

describe('the description table over an authored axis format', () => {
  test('prints the dates the chart announces, not the payload behind them', () => {
    const description = describeCandlestick(true);

    expect(column(description, 'Date')).toEqual(['Jan 3', 'Jan 4']);
  });

  test('prints every price column as the currency the layer declared', () => {
    const description = describeCandlestick(true);

    expect(column(description, 'Open')).toEqual(['$180.25', '$183.90']);
    expect(column(description, 'High')).toEqual(['$184.12', '$186.25']);
    expect(column(description, 'Low')).toEqual(['$179.50', '$182.10']);
    expect(column(description, 'Close')).toEqual(['$183.90', '$185.75']);
  });

  test('formats the volatility too, which the cursor announces on that same axis', () => {
    const description = describeCandlestick(true);

    expect(column(description, 'Volatility')).toEqual(['$4.62', '$4.15']);
  });

  test('leaves the trend a word, since a price format says nothing about one', () => {
    const description = describeCandlestick(true);

    // Every cell of this column is a word the chart computed, not a reading on
    // an axis. A built-in formatter would hand it straight back, but only
    // because they all pass a non-numeric value through -- a `format.function`
    // need not, and this column must not depend on which kind it meets.
    expect(column(description, 'Trend')).toEqual(['Bull', 'Bull']);
  });

  test('reads a chart nobody formatted exactly as it did before', () => {
    const description = describeCandlestick(false);

    // The service's own rounding, which is what these columns showed until the
    // table learned which axis each one sat on.
    expect(column(description, 'Date')).toEqual([JAN_3, JAN_4]);
    expect(column(description, 'Open')).toEqual(['180.25', '183.9']);
  });
});
