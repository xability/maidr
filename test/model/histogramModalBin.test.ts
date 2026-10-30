import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { TraceType } from '@type/grammar';

/**
 * How the description names the bin a histogram peaks in.
 *
 * The modal bin was the first bin holding the largest count, so a histogram
 * with two bins of 38 penguins named one of them as the peak, while `]` said
 * "1 of 2" for the same count. Every bin holding the largest count is named
 * now, and the height in the stat is rounded the way every other number in
 * the dialog is.
 */

/**
 * A vertical histogram layer over bins given as `[low, high, height]`.
 *
 * @param bins - Each bin's edges and bar height
 * @returns The layer
 */
function histogram(bins: [number, number, number][]): MaidrLayer {
  const data: HistogramPoint[] = bins.map(([low, high, height]) => (
    { x: (low + high) / 2, y: height, xMin: low, xMax: high, yMin: 0, yMax: height }
  ));
  return {
    id: 'histogram',
    type: TraceType.HISTOGRAM,
    axes: { x: { label: 'Body Mass (g)' }, y: { label: 'Penguins' } },
    data,
  };
}

/**
 * The value of the description's `Modal bin` stat.
 *
 * @param layer - The layer to describe
 * @returns The stat's value
 */
function modalBin(layer: MaidrLayer): string | number | undefined {
  return new Histogram(layer).description.stats.find(stat => stat.label === 'Modal bin')?.value;
}

describe('the modal bin of a histogram', () => {
  test('names both bins when two hold the largest count', () => {
    // plotnine's penguin body masses: two bins of 38, either side of a 28.
    const bins: [number, number, number][] = [
      [3126.315789473684, 3315.789473684211, 23],
      [3315.78947368421, 3505.2631578947367, 38],
      [3505.2631578947367, 3694.7368421052633, 28],
      [3694.7368421052624, 3884.210526315789, 38],
      [3884.210526315789, 4073.684210526316, 32],
    ];

    expect(modalBin(histogram(bins)))
      .toBe('3315.79 to 3505.26 and 3694.74 to 3884.21, 38');
  });

  test('names the one bin when one holds the largest count', () => {
    const bins: [number, number, number][] = [[0, 1, 4], [1, 2, 9], [2, 3, 2]];

    expect(modalBin(histogram(bins))).toBe('1 to 2, 9');
  });

  test('rounds a height it composes into the stat', () => {
    // A density from matplotlib, which the dialog printed as
    // "0.384916570869134" beside a "Maximum Density" it had rounded to 0.38.
    const bins: [number, number, number][] = [
      [-0.09, 0.16, 0.3038815033177374],
      [0.16, 0.41, 0.384916570869134],
      [0.41, 0.66, 0.24311320265419],
    ];

    expect(modalBin(histogram(bins))).toBe('0.16 to 0.41, 0.38');
  });
});
