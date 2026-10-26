import type { AxisConfig, BarPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Where a bar summary says its largest and smallest bars are.
 *
 * `Largest: 2675 at ...` names the bar by its category, and the category was
 * printed as the raw value the producer sent while the value beside it was
 * rounded: a cross-correlation's lag of 4/12 read "0.333333333333333", and
 * uPlot's days, epoch milliseconds under a date format, read
 * "1772755200000" above a table of dates.
 */

/**
 * The stats of a one-series layer's description.
 *
 * @param type - Bar or lollipop
 * @param data - The bars
 * @param x - The category axis
 * @returns The stats
 */
function statsOf(type: TraceType, data: BarPoint[], x: AxisConfig): DescriptionStat[] {
  const layer: MaidrLayer = { id: 'bars', type, axes: { x, y: { label: 'Value' } }, data };
  return (TraceFactory.create(layer) as unknown as { description: { stats: DescriptionStat[] } })
    .description
    .stats;
}

describe('the category a bar summary names', () => {
  test('is rounded as the table rounds it when the axis has no format', () => {
    // r-maidr's ccf() lollipop: lags in years, a twelfth apart.
    const lags: BarPoint[] = [
      { x: -0.0833333333333333, y: 0.744309321917352 },
      { x: 0, y: 0.976241251222476 },
      { x: 0.333333333333333, y: -0.38 },
    ];

    const stats = statsOf(TraceType.LOLLIPOP, lags, { label: 'Lag' });

    expect(stats).toContainEqual({ label: 'Smallest', value: '-0.38 at 0.33' });
    expect(stats).toContainEqual({ label: 'Largest', value: '0.98 at 0' });
  });

  test('reads in the axis\'s own format when the layer declares one', () => {
    // The uPlot adapter's day-level date format over epoch milliseconds.
    const days: BarPoint[] = [
      { x: 1772668800000, y: 1500 },
      { x: 1772755200000, y: 2675 },
      { x: 1772928000000, y: 980 },
    ];
    const x: AxisConfig = {
      label: 'Day',
      format: { type: 'date', dateOptions: { year: 'numeric', month: 'short', day: 'numeric' } },
    };

    const stats = statsOf(TraceType.BAR, days, x);

    expect(stats).toContainEqual({ label: 'Largest', value: '2675 at Mar 6, 2026' });
    expect(stats).toContainEqual({ label: 'Smallest', value: '980 at Mar 8, 2026' });
  });

  test('is left as written when it is a name', () => {
    const stats = statsOf(TraceType.BAR, [{ x: 'Q1', y: 7 }, { x: 'Q2', y: 3 }], { label: 'Quarter' });

    expect(stats).toContainEqual({ label: 'Largest', value: '7 at Q1' });
  });
});
