import type { AxisConfig, HeatmapData, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

/**
 * A heatmap's description, on a layer whose author formatted its z axis.
 *
 * The data table and every announcement read a cell through the z axis's
 * declared format, and the description's range printed the raw number. That
 * left a chart of categories with numbers it does not have: r-maidr stores
 * each cell of one as its category's place in the legend, 1 for the first,
 * and names the place through the z axis's `format.function` (r-maidr #441).
 * The cursor said "Mid" and the table "Mid", and the description said
 * "Min value: 1" and "Max value: 3".
 */

/** r-maidr's `heat_level_format()` for a legend of Low, Mid and High. */
const LEVELS = 'var names = ["Low","Mid","High"]; var name = names[value - 1]; '
  + 'return name === undefined ? String(value) : name;';

/**
 * A two-row, three-column heatmap.
 *
 * @param points - The cells, top row first
 * @param z - The z axis
 * @returns The layer
 */
function heatmap(points: (number | null)[][], z: AxisConfig): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    axes: { x: { label: 'Day' }, y: { label: 'Shift' }, z },
    data: {
      x: ['Mon', 'Tue', 'Wed'],
      y: ['PM', 'AM'],
      points,
    } satisfies HeatmapData,
  };
}

/**
 * The stats of a layer's description.
 *
 * @param layer - The layer to describe
 * @returns Its stats
 */
function statsOf(layer: MaidrLayer): DescriptionStat[] {
  return new Heatmap(layer).description.stats;
}

describe('a heatmap description on a formatted z axis', () => {
  test('names the range of a heatmap of categories by its categories', () => {
    const stats = statsOf(heatmap(
      [[1, 2, 3], [2, 2, 2]],
      { label: 'Load', format: { function: LEVELS } },
    ));

    // Every stat, so none of the others is left stating a place either: the
    // counts are counts, and the cells are named by their labels, as the
    // extrema menu names them.
    expect(stats).toEqual([
      { label: 'Rows', value: 2 },
      { label: 'Columns', value: 3 },
      { label: 'Min value', value: 'Low' },
      { label: 'Max value', value: 'High' },
      { label: 'Highest cell', value: 'Wed, PM' },
      { label: 'Lowest cell', value: 'Mon, PM' },
    ]);
  });

  test('reads a numeric range in the z axis\'s format', () => {
    const stats = statsOf(heatmap(
      [[0.12, 0.18, 0.24], [0.15, 0.2, 0.21]],
      { label: 'Margin', format: { type: 'percent', decimals: 0 } },
    ));

    expect(stats).toContainEqual({ label: 'Min value', value: '12%' });
    expect(stats).toContainEqual({ label: 'Max value', value: '24%' });
  });

  test('still says a grid of holes has no range', () => {
    const stats = statsOf(heatmap(
      [[null, null, null], [null, null, null]],
      { label: 'Load', format: { function: LEVELS } },
    ));

    expect(stats).toContainEqual({ label: 'Min value', value: 'missing' });
    expect(stats).toContainEqual({ label: 'Max value', value: 'missing' });
  });

  test('leaves the range a bare number where the z axis declares no format', () => {
    // The description service rounds it, as it did before.
    const stats = statsOf(heatmap([[1, 2, 3], [2, 2, 2]], { label: 'Count' }));

    expect(stats).toContainEqual({ label: 'Min value', value: 1 });
    expect(stats).toContainEqual({ label: 'Max value', value: 3 });
  });
});
