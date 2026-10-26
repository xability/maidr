import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * What the description calls the Sum level's extremes.
 *
 * Stacked, dodged and normalized bars share the segmented system, Sum level
 * included (docs/CONTROLS.md, "Segmented Bar Controls"; docs/BRAILLE.md,
 * "Segmented Bar Plots"). On a stacked chart the Sum level is each bar's
 * height. A dodged chart draws its series side by side, so no bar is that
 * tall, and "Largest bar total" named a bar the chart does not have: on
 * the penguin gallery's grouped bars it reported 10,165 grams beside bars
 * of average masses near 5,000.
 */

/** Two series of average body mass, side by side per species. */
const MASSES: SegmentedPoint[][] = [
  [
    { x: 'Adelie', y: 4043.5, z: 'Male' },
    { x: 'Gentoo', y: 5484.8, z: 'Male' },
  ],
  [
    { x: 'Adelie', y: 3368.8, z: 'Female' },
    { x: 'Gentoo', y: 4679.7, z: 'Female' },
  ],
];

/**
 * A segmented layer of the given type over {@link MASSES}.
 *
 * @param type - Dodged or stacked
 * @returns The layer
 */
function layer(type: TraceType): MaidrLayer {
  return {
    id: 'masses',
    type,
    axes: { x: { label: 'Species' }, y: { label: 'Body Mass (g)' }, z: { label: 'Sex' } },
    data: MASSES,
  };
}

/**
 * The stats of a layer's description.
 *
 * @param type - Dodged or stacked
 * @returns The stats
 */
function statsOf(type: TraceType): DescriptionStat[] {
  return (TraceFactory.create(layer(type)) as unknown as { description: { stats: DescriptionStat[] } })
    .description
    .stats;
}

describe('the Sum level\'s extremes in a segmented bar description', () => {
  test('are category sums on a dodged chart, not bar totals', () => {
    const stats = statsOf(TraceType.DODGED);

    expect(stats).toContainEqual({ label: 'Largest category sum', value: 10164.5 });
    expect(stats).toContainEqual({ label: 'Smallest category sum', value: 7412.3 });
    expect(stats.map(stat => stat.label)).not.toContain('Largest bar total');
    expect(stats.map(stat => stat.label)).not.toContain('Smallest bar total');
  });

  test('are still bar totals on a stacked chart', () => {
    const stats = statsOf(TraceType.STACKED);

    expect(stats).toContainEqual({ label: 'Largest bar total', value: 10164.5 });
    expect(stats).toContainEqual({ label: 'Smallest bar total', value: 7412.3 });
  });
});
