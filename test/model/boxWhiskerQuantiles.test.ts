import type { BoxPoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A box layer whose whiskers end at quantiles rather than at the data's
 * extremes -- Nivo's box plot, whose default whiskers are the 10th and 90th
 * percentiles -- names those ends as percentiles, not as a minimum and
 * maximum. Without `whiskerQuantiles` every label is as it always was.
 */

function box(z: string, base: number): BoxPoint {
  return { z, lowerOutliers: [], min: base, q1: base + 1, q2: base + 2, q3: base + 3, max: base + 4, upperOutliers: [] };
}

function layerOf(
  points: BoxPoint[],
  extra: Partial<MaidrLayer> = {},
): MaidrLayer {
  return {
    id: 'box',
    type: TraceType.BOX,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data: points,
    ...extra,
  };
}

/** The section the trace announces at a grid position. */
function sectionAt(trace: BoxTrace, row: number, col: number): string | undefined {
  trace.moveToIndex(row, col);
  const { state } = trace;
  if (state.empty) {
    throw new Error('expected a non-empty trace state');
  }
  return (state.text as TextState).section;
}

function statLabels(trace: BoxTrace): string[] {
  return trace.description.stats.map(s => String(s.label));
}

describe('boxTrace whisker quantiles', () => {
  test('announces whisker ends at quantiles as percentiles', () => {
    const trace = new BoxTrace(layerOf([box('A', 0), box('B', 10)], { whiskerQuantiles: [0.1, 0.9] }));

    // Vertical: rows are sections (1 = lower whisker, 5 = upper), columns boxes.
    expect(sectionAt(trace, 1, 0)).toBe('10th percentile');
    expect(sectionAt(trace, 5, 1)).toBe('90th percentile');
    // The quartiles are untouched.
    expect(sectionAt(trace, 2, 0)).toBe('25%');
  });

  test('names them the same way on a horizontal layer', () => {
    const trace = new BoxTrace(layerOf([box('A', 0)], {
      orientation: Orientation.HORIZONTAL,
      whiskerQuantiles: [0.05, 0.95],
    }));

    expect(sectionAt(trace, 0, 1)).toBe('5th percentile');
    expect(sectionAt(trace, 0, 5)).toBe('95th percentile');
  });

  test('names the table columns and the summary after the percentiles', () => {
    const grouped = new BoxTrace(layerOf([box('A', 0), box('B', 10)], { whiskerQuantiles: [0.1, 0.9] }));
    const single = new BoxTrace(layerOf([box('A', 0)], { whiskerQuantiles: [0.1, 0.9] }));

    expect(grouped.description.dataTable.headers).toEqual([
      'Group',
      'Lower outlier(s)',
      '10th percentile',
      '25%',
      '50%',
      '75%',
      '90th percentile',
      'Upper outlier(s)',
    ]);
    expect(grouped.description.stats).toEqual(expect.arrayContaining([
      { label: 'Lowest 10th percentile', value: '0 (A)' },
      { label: 'Highest 90th percentile', value: '14 (B)' },
    ]));
    expect(single.description.stats).toEqual(expect.arrayContaining([
      { label: '10th percentile', value: 0 },
      { label: '90th percentile', value: 4 },
    ]));
    for (const labels of [statLabels(grouped), statLabels(single)]) {
      expect(labels.filter(label => /minimum|maximum/i.test(label))).toEqual([]);
    }
  });

  test('keeps the name of an end that is still the extreme on its side', () => {
    const upperIsMax = new BoxTrace(layerOf([box('A', 0), box('B', 10)], { whiskerQuantiles: [0.05, 1] }));
    const lowerIsMin = new BoxTrace(layerOf([box('A', 0), box('B', 10)], { whiskerQuantiles: [0, 0.9] }));

    expect(sectionAt(upperIsMax, 1, 0)).toBe('5th percentile');
    expect(sectionAt(upperIsMax, 5, 1)).toBe('Maximum');
    expect(upperIsMax.description.dataTable.headers).toContain('Maximum');
    expect(statLabels(upperIsMax)).toEqual(expect.arrayContaining(['Lowest 5th percentile', 'Highest maximum']));

    expect(sectionAt(lowerIsMin, 1, 0)).toBe('Minimum');
    expect(sectionAt(lowerIsMin, 5, 1)).toBe('90th percentile');
    expect(statLabels(lowerIsMin)).toEqual(expect.arrayContaining(['Lowest minimum', 'Highest 90th percentile']));
    for (const trace of [upperIsMax, lowerIsMin]) {
      expect(statLabels(trace).filter(label => /\b(?:0th|100th)\b/.test(label))).toEqual([]);
    }
  });

  test('gives each percentile its English ordinal', () => {
    const trace = new BoxTrace(layerOf([box('A', 0), box('B', 10)], { whiskerQuantiles: [0.02, 0.98] }));

    expect(sectionAt(trace, 1, 0)).toBe('2nd percentile');
    expect(sectionAt(trace, 5, 1)).toBe('98th percentile');
    expect(statLabels(trace)).toEqual(expect.arrayContaining(['Lowest 2nd percentile', 'Highest 98th percentile']));

    const ordinals = ([[0.01, 0.99], [0.03, 0.97], [0.11, 0.21], [0.12, 0.22], [0.13, 0.23]] as [number, number][])
      .flatMap((quantiles) => {
        const pair = new BoxTrace(layerOf([box('A', 0)], { whiskerQuantiles: quantiles }));
        return [sectionAt(pair, 1, 0), sectionAt(pair, 5, 0)];
      });
    expect(ordinals).toEqual([
      '1st percentile',
      '99th percentile',
      '3rd percentile',
      '97th percentile',
      '11th percentile',
      '21st percentile',
      '12th percentile',
      '22nd percentile',
      '13th percentile',
      '23rd percentile',
    ]);
  });

  test.each([
    ['absent', {}],
    ['the extremes', { whiskerQuantiles: [0, 1] as [number, number] }],
    ['decreasing', { whiskerQuantiles: [0.9, 0.1] as [number, number] }],
    ['out of range', { whiskerQuantiles: [-0.1, 1.2] as [number, number] }],
  ])('keeps Minimum and Maximum when the quantiles are %s', (_, extra) => {
    const trace = new BoxTrace(layerOf([box('A', 0), box('B', 10)], extra));
    const plain = new BoxTrace(layerOf([box('A', 0), box('B', 10)]));

    expect(sectionAt(trace, 1, 0)).toBe('Minimum');
    expect(sectionAt(trace, 5, 1)).toBe('Maximum');
    expect(trace.description).toEqual(plain.description);
    expect(statLabels(trace)).toEqual(expect.arrayContaining(['Lowest minimum', 'Highest maximum']));
  });
});
