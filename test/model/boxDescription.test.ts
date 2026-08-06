import type { BoxPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Builds a box plot group. Outliers default to none so a test only spells out
 * the ones it cares about.
 */
function group(
  z: string,
  min: number,
  q1: number,
  q2: number,
  q3: number,
  max: number,
  outliers: { lower?: number[]; upper?: number[] } = {},
): BoxPoint {
  return {
    z,
    lowerOutliers: outliers.lower ?? [],
    min,
    q1,
    q2,
    q3,
    max,
    upperOutliers: outliers.upper ?? [],
  };
}

/**
 * Builds a box layer with no selectors, so the trace skips SVG resolution and
 * the test needs no DOM.
 */
function makeBoxLayer(data: BoxPoint[], orientation?: Orientation): MaidrLayer {
  return {
    id: 'box',
    type: TraceType.BOX,
    title: 'Boxes',
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data,
    ...(orientation ? { orientation } : {}),
  };
}

/**
 * Reads a summary row by label, or undefined when the summary has no such row.
 */
function stat(trace: BoxTrace, label: string): string | number | undefined {
  return trace.description.stats.find(s => s.label === label)?.value;
}

describe('boxTrace description summary', () => {
  test('attributes each extreme to its group when several boxes are present', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', 5, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 12),
      group('C', 3, 9, 14, 22, 40),
    ]));

    // A single chart-wide "Min: 1 / Max: 40" leaves the user unable to tell
    // which of the three boxes those ends belong to.
    expect(stat(trace, 'Lowest minimum')).toBe('1 (B)');
    expect(stat(trace, 'Highest maximum')).toBe('40 (C)');
    expect(stat(trace, 'Min')).toBeUndefined();
    expect(stat(trace, 'Max')).toBeUndefined();
  });

  test('reports plain whisker ends when there is only one box', () => {
    const trace = new BoxTrace(makeBoxLayer([group('Only', 2, 4, 6, 8, 10)]));

    // Nothing to disambiguate, so no group name and the raw numbers survive.
    expect(stat(trace, 'Minimum')).toBe(2);
    expect(stat(trace, 'Maximum')).toBe(10);
  });

  test('reports whisker ends rather than the outlier-inclusive audio range', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', 5, 10, 15, 20, 25, { lower: [-40], upper: [90] }),
    ]));

    // -40 and 90 drive the sonification range, but reporting them as the
    // minimum and maximum would contradict the table's own Minimum/Maximum
    // columns directly underneath.
    expect(stat(trace, 'Minimum')).toBe(5);
    expect(stat(trace, 'Maximum')).toBe(25);
  });

  test('marks a range as missing when no group carries the whisker end', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', Number.NaN, 10, 15, 20, Number.NaN),
      group('B', Number.NaN, 4, 6, 8, Number.NaN),
    ]));

    expect(stat(trace, 'Lowest minimum')).toBe('missing');
    expect(stat(trace, 'Highest maximum')).toBe('missing');
  });

  test('skips groups without a whisker end instead of losing the range', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', Number.NaN, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, Number.NaN),
    ]));

    expect(stat(trace, 'Lowest minimum')).toBe('1 (B)');
    expect(stat(trace, 'Highest maximum')).toBe('25 (A)');
  });

  test('names the first group in navigation order when boxes tie', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', 1, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 25),
      group('C', 7, 9, 14, 22, 19),
    ]));

    // Boxes bottoming out at the same floor is the ordinary case, so the rule
    // has to be stated: the earliest group wins, which is the first one the
    // user reaches by navigating.
    expect(stat(trace, 'Lowest minimum')).toBe('1 (A)');
    expect(stat(trace, 'Highest maximum')).toBe('25 (A)');
  });

  test('still counts and names the groups', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', 5, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 12),
    ]));

    expect(stat(trace, 'Number of groups')).toBe(2);
    expect(stat(trace, 'Group names')).toBe('A, B');
  });
});

describe('boxTrace description data table', () => {
  test('gives the outlier sections their own columns', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', 5, 10, 15, 20, 25, { lower: [-2, 0], upper: [31] }),
      group('B', 1, 4, 6, 8, 12),
    ]));
    const { headers, rows } = trace.description.dataTable;

    expect(headers).toEqual([
      'Group',
      'Lower outlier(s)',
      'Minimum',
      '25%',
      '50%',
      '75%',
      'Maximum',
      'Upper outlier(s)',
    ]);
    expect(rows).toEqual([
      ['A', '-2, 0', 5, 10, 15, 20, 25, '31'],
      // A group with no outliers leaves the cell blank rather than showing an
      // empty list.
      ['B', '', 1, 4, 6, 8, 12, ''],
    ]);
  });

  test('keeps the horizontal table in the order the user navigates', () => {
    const trace = new BoxTrace(makeBoxLayer([
      group('A', 5, 10, 15, 20, 25, { upper: [30] }),
      group('B', 1, 4, 6, 8, 12, { lower: [-1] }),
    ], Orientation.HORIZONTAL));
    const { rows } = trace.description.dataTable;

    // A horizontal box plot reverses its groups so navigation starts at the
    // lower-left box; the table follows that same order.
    expect(rows).toEqual([
      ['B', '-1', 1, 4, 6, 8, 12, ''],
      ['A', '', 5, 10, 15, 20, 25, '30'],
    ]);
  });
});
