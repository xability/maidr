import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { RotorNavigationService } from '@service/rotor';
import type { AxisFormat, HistogramPoint, Maidr } from '@type/grammar';
import type { DisplayDescriptionState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Histogram } from '@model/histogram';
import { Figure } from '@model/plot';
import { DescriptionService } from '@service/description';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A histogram whose declared format is coarser than its bins.
 *
 * Bins a twentieth of a unit wide, read with the one decimal the axis
 * declares, were announced "Length is 1.1 through 1.1" on two bins in a row,
 * and the summary called the tallest of them "1.1 to 1.1". The edges now read
 * with the decimals that tell them apart, alike in the announcement, the
 * summary and the table.
 *
 * Driven through a real `Figure`, `FormatterService`, `TextService` and
 * `DescriptionService`, because the three surfaces take the axis's format by
 * different routes and the point is that they agree.
 */

/** One decimal, as py-maidr writes a Plotly `tickformat` of `.1f`. */
const ONE_DECIMAL: AxisFormat = { type: 'fixed', decimals: 1 };

/** Four bins a twentieth wide, as `[low, high, count]`; the second is the tallest. */
const BINS: [number, number, number][] = [[1, 1.05, 2], [1.05, 1.1, 7], [1.1, 1.15, 4], [1.15, 1.2, 1]];

/**
 * A one-histogram figure.
 *
 * @param format - The x axis's format
 * @returns The chart's data
 */
function chart(format: AxisFormat): Maidr {
  const data: HistogramPoint[] = BINS.map(([low, high, count]) => (
    { x: (low + high) / 2, y: count, xMin: low, xMax: high, yMin: 0, yMax: count }
  ));
  return {
    id: 'chart',
    subplots: [[{
      layers: [{
        id: 'lengths',
        type: TraceType.HISTOGRAM,
        axes: { x: { label: 'Length', format }, y: { label: 'Count' } },
        data,
      }],
    }]],
  };
}

/**
 * What the text service says on each bin, in verbose mode.
 *
 * @param maidr - The chart
 * @returns One announcement per bin
 */
function announced(maidr: Maidr): string[] {
  const text = new TextService({ notify: jest.fn() } as unknown as NotificationService, new FormatterService(maidr));
  const trace = new Histogram(maidr.subplots[0][0].layers[0]);
  return BINS.map((_bin, index) => {
    trace.moveToIndex(0, index);
    return text.format(trace.state);
  });
}

/**
 * The description the dialog shows.
 *
 * @param maidr - The chart
 * @returns The description as the dialog receives it
 */
function described(maidr: Maidr): DisplayDescriptionState {
  const service = new DescriptionService(
    new Context(new Figure(maidr)),
    { toggleFocus: jest.fn() } as unknown as DisplayService,
    { resetToDataMode: jest.fn() } as unknown as RotorNavigationService,
    new FormatterService(maidr),
  );
  return service.getDescription() as DisplayDescriptionState;
}

describe('a histogram whose declared format is coarser than its bins', () => {
  test('announces each bin by edges that read apart', () => {
    expect(announced(chart(ONE_DECIMAL))).toEqual([
      'Length is 1.00 through 1.05, Count is 2',
      'Length is 1.05 through 1.10, Count is 7',
      'Length is 1.10 through 1.15, Count is 4',
      'Length is 1.15 through 1.20, Count is 1',
    ]);
  });

  test('reads the same edges in the summary and the table', () => {
    const { stats, dataTable } = described(chart(ONE_DECIMAL));

    expect(stats).toContainEqual({ label: 'Bin range', value: '1.00 to 1.20' });
    expect(stats).toContainEqual({ label: 'Modal bin', value: '1.05 to 1.10, 7' });
    // Bin Min and Bin Max, the last two columns.
    expect(dataTable.rows.map(row => row.slice(2))).toEqual([
      ['1.00', '1.05'],
      ['1.05', '1.10'],
      ['1.10', '1.15'],
      ['1.15', '1.20'],
    ]);
  });

  test('reads bins as declared where the format already tells their edges apart', () => {
    // Two decimals part every bin, so nothing is added.
    expect(announced(chart({ type: 'fixed', decimals: 2 }))[1]).toBe('Length is 1.05 through 1.10, Count is 7');
    expect(described(chart({ type: 'fixed', decimals: 2 })).stats)
      .toContainEqual({ label: 'Bin range', value: '1.00 to 1.20' });
  });
});
