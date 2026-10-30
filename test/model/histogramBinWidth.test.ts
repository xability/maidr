import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { Orientation, TraceType } from '@type/grammar';

/**
 * How the description reads the width of a histogram's bins.
 *
 * Equal-width bins are what almost every histogram draws, and the producers
 * compute their edges in floating point: numpy's `start + i * step`, or R's
 * own edges written out to fifteen significant figures. The widths taken from
 * those edges agree in every digit a reader is shown and differ in the last
 * few bits, and the description compared them exactly -- so a Bokeh
 * histogram of twelve equal bins read "Bin width: 4.92 to 4.92", a range
 * with two identical ends where a Plotly one with exact edges reads
 * "constant 0.5".
 */

/**
 * A histogram layer over bins given as `[low, high, count]`.
 *
 * @param bins - Each bin's edges and count
 * @param orientation - Which way the bars run
 * @returns The layer
 */
function histogram(bins: [number, number, number][], orientation = Orientation.VERTICAL): MaidrLayer {
  const vertical = orientation === Orientation.VERTICAL;
  const data: HistogramPoint[] = bins.map(([low, high, count]) => vertical
    ? { x: (low + high) / 2, y: count, xMin: low, xMax: high, yMin: 0, yMax: count }
    : { x: count, y: (low + high) / 2, xMin: 0, xMax: count, yMin: low, yMax: high });
  return {
    id: 'histogram',
    type: TraceType.HISTOGRAM,
    orientation,
    axes: vertical
      ? { x: { label: 'Flipper Length (mm)' }, y: { label: 'Count' } }
      : { x: { label: 'Count' }, y: { label: 'Flipper Length (mm)' } },
    data,
  };
}

/**
 * The value of the description's `Bin width` stat.
 *
 * @param layer - The layer to describe
 * @returns The stat's value
 */
function binWidth(layer: MaidrLayer): string | number | undefined {
  return new Histogram(layer).description.stats.find(stat => stat.label === 'Bin width')?.value;
}

/** The first bins of the Bokeh gallery's histogram, edges as numpy wrote them. */
const NUMPY_BINS: [number, number, number][] = [
  [172, 176.91666666666666, 3],
  [176.91666666666666, 181.83333333333334, 15],
  [181.83333333333334, 186.75, 27],
  [186.75, 191.66666666666666, 63],
  [191.66666666666666, 196.58333333333334, 53],
];

/** Bins from an r-maidr ggplot2 histogram, edges at R's fifteen figures. */
const R_BINS: [number, number, number][] = [
  [94.0625310636914, 97.7512577720714, 53],
  [97.7512577720714, 101.439984480451, 51],
  [101.439984480451, 105.128711188832, 50],
  [105.128711188832, 108.817437897212, 41],
];

describe('the width of a histogram\'s bins', () => {
  test('reads equal bins as constant when their edges carry float noise', () => {
    // 4.916666666666657 and 4.916666666666686: the same width.
    expect(binWidth(histogram(NUMPY_BINS))).toBe('constant 4.92');
  });

  test('reads equal bins as constant at the precision R writes edges', () => {
    // 3.6887267083796047 and 3.6887267083809974, about 1e-12 apart.
    expect(binWidth(histogram(R_BINS))).toBe('constant 3.69');
  });

  test('reads equal bins as constant on a histogram drawn on its side', () => {
    expect(binWidth(histogram(NUMPY_BINS, Orientation.HORIZONTAL))).toBe('constant 4.92');
  });

  test('still reads bins of different widths as a range', () => {
    const bins: [number, number, number][] = [[0, 1, 4], [1, 3, 9], [3, 7, 2]];

    expect(binWidth(histogram(bins))).toBe('1 to 4');
  });

  test('still reads a range for unequal bins far from zero', () => {
    // Epoch seconds: a billionth of the largest edge is 1.7 seconds, more
    // than either bin is wide, so a tolerance taken from the edges alone
    // would call a quarter-second bin and a half-second bin equal.
    const start = 1.7e9;
    const bins: [number, number, number][] = [[start, start + 0.25, 4], [start + 0.25, start + 0.75, 9]];

    expect(binWidth(histogram(bins))).toBe('0.25 to 0.5');
  });

  test('does not call bins equal that differ by less than the shown precision', () => {
    // 1 and 1.001 both print as 1, but they are not the same width: only
    // agreement down to float noise makes bins equal.
    const bins: [number, number, number][] = [[0, 1, 4], [1, 2.001, 9]];

    expect(binWidth(histogram(bins))).not.toMatch(/^constant/);
  });
});
