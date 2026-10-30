import type { AxisFormat, HistogramPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { Orientation, TraceType } from '@type/grammar';

/**
 * The bin edges in a histogram's summary, on a layer whose author formatted
 * the binned axis.
 *
 * The data table's bin columns and the announced bin read the edges through
 * that axis's declared format, and the summary printed them raw: bins of
 * prices in dollars read "Bin range: 0 to 6" and "Modal bin: 2 to 4, 33"
 * over a table of $0 to $2, $2 to $4 and $4 to $6.
 */

/** Prices in whole dollars. */
const DOLLARS: AxisFormat = { type: 'currency', currency: 'USD', decimals: 0 };

/** Three bins two dollars wide, the middle one the tallest, as `[low, high, count]`. */
const BINS: [number, number, number][] = [[0, 2, 4], [2, 4, 33], [4, 6, 12]];

/**
 * The stats of a histogram's description.
 *
 * @param layer - The layer to describe
 * @returns Its stats
 */
function statsOf(layer: MaidrLayer): DescriptionStat[] {
  return new Histogram(layer).description.stats;
}

describe('a histogram summary on a layer that formats its binned axis', () => {
  test('reads the bin edges in the x axis\'s format', () => {
    const data: HistogramPoint[] = BINS.map(([low, high, count]) => (
      { x: (low + high) / 2, y: count, xMin: low, xMax: high, yMin: 0, yMax: count }
    ));
    const stats = statsOf({
      id: 'prices',
      type: TraceType.HISTOGRAM,
      axes: { x: { label: 'Price', format: DOLLARS }, y: { label: 'Sales' } },
      data,
    });

    expect(stats).toContainEqual({ label: 'Bin range', value: '$0 to $6' });
    expect(stats).toContainEqual({ label: 'Modal bin', value: '$2 to $4, 33' });
    // A width is a length along the axis, not a position on it.
    expect(stats).toContainEqual({ label: 'Bin width', value: 'constant 2' });
  });

  test('reads them in the y axis\'s format on a histogram drawn sideways', () => {
    const data: HistogramPoint[] = BINS.map(([low, high, count]) => (
      { x: count, y: (low + high) / 2, xMin: 0, xMax: count, yMin: low, yMax: high }
    ));
    const stats = statsOf({
      id: 'prices',
      type: TraceType.HISTOGRAM,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Sales' }, y: { label: 'Price', format: DOLLARS } },
      data,
    });

    expect(stats).toContainEqual({ label: 'Bin range', value: '$0 to $6' });
    expect(stats).toContainEqual({ label: 'Modal bin', value: '$2 to $4, 33' });
  });
});

describe('the bin width of a histogram over dates', () => {
  const DAY = 86_400_000;
  const JAN1 = Date.UTC(2026, 0, 1);
  /** Bins `days` wide from 1 January 2026, as `[low, high, count]`. */
  const binsOf = (days: number): [number, number, number][] => [4, 9, 2].map((count, index) => (
    [JAN1 + index * days * DAY, JAN1 + (index + 1) * days * DAY, count]
  ));

  test('reads a span of time in days or weeks, not in milliseconds', () => {
    // A `date` format reads its values as epoch milliseconds, so daily bins
    // were "constant 86,400,000".
    const upright = (days: number): HistogramPoint[] => binsOf(days).map(([low, high, count]) => (
      { x: (low + high) / 2, y: count, xMin: low, xMax: high, yMin: 0, yMax: count }
    ));
    const layer = (days: number): MaidrLayer => ({
      id: 'days',
      type: TraceType.HISTOGRAM,
      axes: { x: { label: 'Day', format: { type: 'date' } }, y: { label: 'Orders' } },
      data: upright(days),
    });

    expect(statsOf(layer(1))).toContainEqual({ label: 'Bin width', value: 'constant 1 day' });
    expect(statsOf(layer(14))).toContainEqual({ label: 'Bin width', value: 'constant 2 weeks' });
  });

  test('reads it on the y axis of a histogram drawn sideways', () => {
    const data: HistogramPoint[] = binsOf(1).map(([low, high, count]) => (
      { x: count, y: (low + high) / 2, xMin: 0, xMax: count, yMin: low, yMax: high }
    ));
    const stats = statsOf({
      id: 'days',
      type: TraceType.HISTOGRAM,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Orders' }, y: { label: 'Day', format: { type: 'date' } } },
      data,
    });

    expect(stats).toContainEqual({ label: 'Bin width', value: 'constant 1 day' });
  });

  test('leaves a width a number when a function format draws the dates', () => {
    // matplotlib's day numbers through py-maidr's date function: a function
    // says nothing about its unit, so weekly bins are seven of whatever it is.
    const stats = statsOf({
      id: 'weeks',
      type: TraceType.HISTOGRAM,
      axes: {
        x: { label: 'Week', format: { function: 'return new Date(value * 86400000).toISOString().slice(0, 10)' } },
        y: { label: 'Orders' },
      },
      data: [[18628, 18635, 4], [18635, 18642, 9]].map(([low, high, count]) => (
        { x: (low + high) / 2, y: count, xMin: low, xMax: high, yMin: 0, yMax: count }
      )),
    });

    expect(stats).toContainEqual({ label: 'Bin width', value: 'constant 7' });
  });
});
