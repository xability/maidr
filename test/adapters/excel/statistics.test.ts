import type { QuartileMethod } from '@adapters/excel/statistics';
import {
  binValues,
  boxSummary,
  quantile,
  sampleDeviation,
  scottWidth,
  tidy,
} from '@adapters/excel/statistics';
import { describe, expect, it } from '@jest/globals';

/**
 * What Excel computes before it draws a histogram or a box and whisker chart.
 *
 * The quartile cases are numpy's `percentile` with `method='linear'` (Excel's
 * inclusive calculation, `QUARTILE.INC`) and `method='weibull'` (exclusive,
 * `QUARTILE.EXC`), worked out with numpy 2.4 and written down here.
 */

const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);

const QUARTILES: [number[], QuartileMethod, number[]][] = [
  [[3, 7, 8, 5, 12, 14, 21, 13, 18], 'Inclusive', [7, 12, 14]],
  [[3, 7, 8, 5, 12, 14, 21, 13, 18], 'Exclusive', [6, 12, 16]],
  [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40], 'Inclusive', [3.5, 6, 8.5]],
  [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40], 'Exclusive', [3, 6, 9]],
  [[2, 4], 'Inclusive', [2.5, 3, 3.5]],
  [[2, 4], 'Exclusive', [2, 3, 4]],
  [[5], 'Inclusive', [5, 5, 5]],
  [[5], 'Exclusive', [5, 5, 5]],
];

describe('quantile', () => {
  it.each(QUARTILES)('of %j, %s, are numpy\'s', (values, method, expected) => {
    const ordered = sorted(values);

    expect([0.25, 0.5, 0.75].map(p => quantile(ordered, p, method))).toEqual(expected);
  });
});

describe('boxSummary', () => {
  it('reaches each whisker to the furthest value within 1.5 IQR, and calls the rest outliers', () => {
    const box = boxSummary([-30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40], 'Inclusive');

    expect(box.lowerOutliers).toEqual([-30]);
    expect(box.upperOutliers).toEqual([40]);
    expect(box.min).toBe(1);
    expect(box.max).toBe(10);
  });

  it('reads one value as a box of no width', () => {
    expect(boxSummary([7], 'Exclusive')).toEqual({ min: 7, q1: 7, q2: 7, q3: 7, max: 7, lowerOutliers: [], upperOutliers: [] });
  });
});

describe('scottWidth', () => {
  it('is 3.5 sample standard deviations over the cube root of the count', () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 4, 5, 9];

    expect(sampleDeviation(values)).toBeCloseTo(2.2211108331943574, 12);
    expect(scottWidth(values)).toBeCloseTo(3.608319134549957, 12);
  });

  it('is no width for values that do not spread', () => {
    expect(scottWidth([4, 4, 4])).toBe(0);
    expect(scottWidth([])).toBe(0);
  });
});

describe('binValues', () => {
  it('has no bins for no values', () => {
    expect(binValues([], { type: 'Auto' })).toEqual([]);
  });

  it('puts identical values in one bin', () => {
    expect(binValues([4, 4, 4], { type: 'Auto' })).toEqual([{ min: 4, max: 4, count: 3, label: '[4, 4]' }]);
  });

  it('closes the first bin on both sides and every other on the right', () => {
    const bins = binValues([1, 3, 3.5, 5], { type: 'BinWidth', width: 2 });

    expect(bins.map(bin => bin.label)).toEqual(['[1, 3]', '(3, 5]']);
    expect(bins.map(bin => bin.count)).toEqual([2, 2]);
  });

  it('labels edges with as many decimals as the width needs', () => {
    const bins = binValues([0, 0.25, 0.3], { type: 'BinWidth', width: 0.1 });

    expect(bins.map(bin => bin.label)).toEqual(['[0, 0.1]', '(0.1, 0.2]', '(0.2, 0.3]']);
  });

  it('announces edges at the place of the width\'s third significant figure, and counts against the exact ones', () => {
    // 1.237 is above the exact edge, 1.2366, and below the announced one.
    const bins = binValues([0, 1.237, 2], { type: 'BinWidth', width: 1.2366 });

    expect(bins).toEqual([
      { min: 0, max: 1.24, count: 1, label: '[0, 1.24]' },
      { min: 1.24, max: 2.47, count: 2, label: '(1.24, 2.47]' },
    ]);
  });

  it('rounds an automatic width\'s edges the same way', () => {
    const bins = binValues([1, 2, 2, 3, 3, 3, 4, 4, 5, 9], { type: 'Auto' });

    expect(bins.map(bin => [bin.min, bin.max, bin.count])).toEqual([[1, 4.61, 8], [4.61, 8.22, 1], [8.22, 11.82, 1]]);
  });

  it('builds edges without the noise of adding a width', () => {
    const bins = binValues([0.1, 0.7], { type: 'BinWidth', width: 0.2 });

    expect(bins.map(bin => bin.max)).toEqual([0.3, 0.5, 0.7]);
  });

  it('keeps an underflow bin above every value as the only bin', () => {
    expect(binValues([1, 2], { type: 'Auto', underflow: 5 })).toEqual([{ min: 1, max: 5, count: 2, label: '≤5' }]);
  });

  it('keeps empty underflow and overflow bins, as Excel draws them', () => {
    const bins = binValues([3, 4], { type: 'BinWidth', width: 1, underflow: 0, overflow: 10 });

    expect(bins[0]).toEqual({ min: 0, max: 0, count: 0, label: '≤0' });
    expect(bins.at(-1)).toEqual({ min: 10, max: 10, count: 0, label: '>10' });
  });

  it('reads a width that is no width as one bin', () => {
    expect(binValues([1, 5], { type: 'BinWidth', width: 0 })).toEqual([{ min: 1, max: 5, count: 2, label: '[1, 5]' }]);
  });
});

describe('tidy', () => {
  it('takes binary noise out of a sum', () => {
    expect(tidy(0.1 + 0.2)).toBe(0.3);
    expect(tidy(Number.NaN)).toBeNaN();
  });
});
