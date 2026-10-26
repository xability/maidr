import type { AxisConfig, LinePoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * A line's summary, on a layer whose author formatted its axes.
 *
 * The data table and every announcement read a line's values through the
 * layer's own axis formats; the summary above the table printed them raw. A
 * margin drawn as a percentage was "Min value: 0.12" over a table and a cursor
 * saying 12%, and a volume chart over dates was "Date range: 18,628 to
 * 18,717" -- matplotlib's day numbers -- over a table of 2021-01-01.
 */

/** py-maidr's matplotlib date axis: day numbers to ISO dates. */
const DATE_FORMAT = 'var n=Number(value);if(!isFinite(n))return String(value);'
  + 'var d=new Date(Math.round(0+n*86400000));'
  + 'return d.getUTCFullYear()+\'-\'+String(d.getUTCMonth()+1).padStart(2,\'0\')+\'-\'+String(d.getUTCDate()).padStart(2,\'0\')';

/**
 * A one-series line layer.
 *
 * @param points - The series
 * @param x - The x axis
 * @param y - The y axis
 * @returns The layer
 */
function line(points: LinePoint[], x: AxisConfig, y: AxisConfig): MaidrLayer {
  return { id: 'line', type: TraceType.LINE, axes: { x, y }, data: [points] };
}

/**
 * The stats of a layer's description.
 *
 * @param layer - The layer to describe
 * @returns Its stats
 */
function statsOf(layer: MaidrLayer): DescriptionStat[] {
  return new LineTrace(layer).description.stats;
}

/** A quarterly margin, as the Excel and Office galleries draw it. */
const MARGIN: LinePoint[] = [
  { x: 'Q1', y: 0.18 },
  { x: 'Q2', y: 0.21 },
  { x: 'Q3', y: 0.12 },
  { x: 'Q4', y: 0.24 },
];

/** A volume series over matplotlib day numbers, 2021-01-01 to 2021-03-31. */
const VOLUME: LinePoint[] = [
  { x: 18628, y: 171914 },
  { x: 18631, y: 438280 },
  { x: 18717, y: 86821 },
];

describe('a line summary on a formatted layer', () => {
  test('reads the minimum and maximum in the value axis\'s format', () => {
    const stats = statsOf(line(
      MARGIN,
      { label: 'Quarter' },
      { label: 'Margin', format: { type: 'percent', decimals: 0 } },
    ));

    expect(stats).toContainEqual({ label: 'Min value', value: '12%' });
    expect(stats).toContainEqual({ label: 'Max value', value: '24%' });
  });

  test('reads the x range in the x axis\'s format', () => {
    const stats = statsOf(line(
      VOLUME,
      { label: 'Date', format: { function: DATE_FORMAT } },
      { label: 'Volume' },
    ));

    expect(stats).toContainEqual({ label: 'Date range', value: '2021-01-01 to 2021-03-31' });
  });

  test('reads a one-sample x range as constant in the x axis\'s format', () => {
    const stats = statsOf(line(
      VOLUME.slice(0, 1),
      { label: 'Date', format: { function: DATE_FORMAT } },
      { label: 'Volume' },
    ));

    expect(stats).toContainEqual({ label: 'Date range', value: 'constant 2021-01-01' });
  });

  test('leaves an unformatted layer\'s numbers to the dialog\'s rounding', () => {
    const stats = statsOf(line(VOLUME, { label: 'Date' }, { label: 'Volume' }));

    expect(stats).toContainEqual({ label: 'Date range', value: '18,628 to 18,717' });
    expect(stats).toContainEqual({ label: 'Min value', value: 86821 });
    expect(stats).toContainEqual({ label: 'Max value', value: 438280 });
  });
});
