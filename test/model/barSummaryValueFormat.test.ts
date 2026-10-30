import type { AxisConfig, BarPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A bar summary's magnitudes, on a layer whose author formatted its value
 * axis.
 *
 * py-maidr declares `{ type: 'fixed', decimals: 1 }` on its multipanel bar
 * panels, and the table and every announcement read the bars to one
 * decimal. The summary above them printed `Max value: 7.04` and
 * `Largest: 7.04 at D` over a table row `D 7.0`.
 */

/** The matplotlib multipanel's bar panel. */
const BARS: BarPoint[] = [
  { x: 'A', y: 4.9 },
  { x: 'B', y: 1.32 },
  { x: 'D', y: 7.04 },
];

/**
 * The stats of a bar layer's description.
 *
 * @param data - The bars
 * @param axes - The layer's axes
 * @param axes.x - The x axis
 * @param axes.y - The y axis
 * @param orientation - Which way the bars run
 * @returns The stats
 */
function statsOf(
  data: BarPoint[],
  axes: { x: AxisConfig; y: AxisConfig },
  orientation = Orientation.VERTICAL,
): DescriptionStat[] {
  const layer: MaidrLayer = { id: 'bars', type: TraceType.BAR, orientation, axes, data };
  return (TraceFactory.create(layer) as unknown as { description: { stats: DescriptionStat[] } })
    .description
    .stats;
}

describe('the magnitudes a bar summary states', () => {
  test('read in the value axis\'s format when the layer declares one', () => {
    const stats = statsOf(BARS, {
      x: { label: 'Categories' },
      y: { label: 'Values', format: { type: 'fixed', decimals: 1 } },
    });

    expect(stats).toContainEqual({ label: 'Min value', value: '1.3' });
    expect(stats).toContainEqual({ label: 'Max value', value: '7.0' });
    expect(stats).toContainEqual({ label: 'Largest', value: '7.0 at D' });
    expect(stats).toContainEqual({ label: 'Smallest', value: '1.3 at B' });
  });

  test('read in the x axis\'s format on bars drawn sideways', () => {
    const sideways: BarPoint[] = BARS.map(bar => ({ x: bar.y, y: bar.x }));

    const stats = statsOf(
      sideways,
      { x: { label: 'Values', format: { type: 'fixed', decimals: 1 } }, y: { label: 'Categories' } },
      Orientation.HORIZONTAL,
    );

    expect(stats).toContainEqual({ label: 'Max value', value: '7.0' });
    expect(stats).toContainEqual({ label: 'Largest', value: '7.0 at D' });
  });

  test('are left to the dialog\'s rounding when the layer declares no format', () => {
    const stats = statsOf(BARS, { x: { label: 'Categories' }, y: { label: 'Values' } });

    expect(stats).toContainEqual({ label: 'Max value', value: 7.04 });
    expect(stats).toContainEqual({ label: 'Largest', value: '7.04 at D' });
  });
});
