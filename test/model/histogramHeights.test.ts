import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { Orientation, TraceType } from '@type/grammar';

/**
 * What the description says a histogram's bar heights are.
 *
 * Most histograms count, and the description totals the counts as the number
 * of observations. A histogram can also be drawn as a density (Plotly's
 * `histnorm='probability density'`, matplotlib's `density=True`), a
 * probability or a weighted count. Its heights are fractions, and their sum
 * is not a number of observations: 500 samples in bins half a unit wide were
 * described as "Total observations: 2", under "Min count" and "Max count"
 * for heights that were densities.
 */

/**
 * A histogram layer over bins given as `[low, high, height]`.
 *
 * @param bins - Each bin's edges and bar height
 * @param heightLabel - The label of the axis the heights are read off
 * @param orientation - Which way the bars run
 * @returns The layer
 */
function histogram(
  bins: [number, number, number][],
  heightLabel: string,
  orientation = Orientation.VERTICAL,
): MaidrLayer {
  const vertical = orientation === Orientation.VERTICAL;
  const data: HistogramPoint[] = bins.map(([low, high, height]) => vertical
    ? { x: (low + high) / 2, y: height, xMin: low, xMax: high, yMin: 0, yMax: height }
    : { x: height, y: (low + high) / 2, xMin: 0, xMax: height, yMin: low, yMax: high });
  return {
    id: 'histogram',
    type: TraceType.HISTOGRAM,
    orientation,
    axes: vertical
      ? { x: { label: 'Value' }, y: { label: heightLabel } }
      : { x: { label: heightLabel }, y: { label: 'Value' } },
    data,
  };
}

/**
 * The stats of a layer's description.
 *
 * @param layer - The layer to describe
 * @returns Its stats
 */
function statsOf(layer: MaidrLayer): DescriptionStat[] {
  return new Histogram(layer).description.stats;
}

/** Bins of a Plotly density histogram, heights as `histnorm` scaled them. */
const DENSITIES: [number, number, number][] = [
  [-2, -1.5, 0.052],
  [-1.5, -1, 0.124],
  [-1, -0.5, 0.184],
  [-0.5, 0, 0.24],
  [0, 0.5, 0.268],
  [0.5, 1, 0.132],
];

/** The same shape counted. */
const COUNTS: [number, number, number][] = [
  [-2, -1.5, 13],
  [-1.5, -1, 31],
  [-1, -0.5, 46],
];

describe('the heights of a histogram\'s bars', () => {
  test('are not totalled as observations when they are densities', () => {
    const stats = statsOf(histogram(DENSITIES, 'Density'));

    expect(stats.map(stat => stat.label)).not.toContain('Total observations');
  });

  test('are named for their axis rather than as counts when they are densities', () => {
    const stats = statsOf(histogram(DENSITIES, 'Density'));

    expect(stats).toContainEqual({ label: 'Minimum Density', value: 0.052 });
    expect(stats).toContainEqual({ label: 'Maximum Density', value: 0.268 });
    expect(stats.map(stat => stat.label)).not.toContain('Min count');
    expect(stats.map(stat => stat.label)).not.toContain('Max count');
  });

  test('are named for the axis they run along on a histogram drawn on its side', () => {
    const stats = statsOf(histogram(DENSITIES, 'Density', Orientation.HORIZONTAL));

    expect(stats).toContainEqual({ label: 'Minimum Density', value: 0.052 });
    expect(stats).toContainEqual({ label: 'Maximum Density', value: 0.268 });
    expect(stats.map(stat => stat.label)).not.toContain('Total observations');
  });

  test('are still counts, and totalled, when they are whole numbers', () => {
    const stats = statsOf(histogram(COUNTS, 'Count'));

    expect(stats).toContainEqual({ label: 'Min count', value: 13 });
    expect(stats).toContainEqual({ label: 'Max count', value: 46 });
    expect(stats).toContainEqual({ label: 'Total observations', value: 90 });
  });

  test('still name the bin where the distribution peaks when they are densities', () => {
    const stats = statsOf(histogram(DENSITIES, 'Density'));

    expect(stats).toContainEqual({ label: 'Modal bin', value: '0 to 0.5, 0.268' });
  });
});
