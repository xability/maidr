import type { BoxPoint, MaidrLayer, ViolinOptions } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ViolinBoxTrace } from '@model/violinBox';
import { TraceType } from '@type/grammar';

/**
 * Builds a violin's summary-statistics group. Violins produce no outliers, so
 * both outlier lists stay empty.
 */
function group(
  z: string,
  min: number,
  q1: number,
  q2: number,
  q3: number,
  max: number,
): BoxPoint {
  return { z, lowerOutliers: [], min, q1, q2, q3, max, upperOutliers: [] };
}

/**
 * Builds a violin box layer with no selectors, so the trace skips SVG
 * resolution and the test needs no DOM.
 */
function makeViolinBoxLayer(
  data: BoxPoint[],
  violinOptions?: ViolinOptions,
): MaidrLayer {
  return {
    id: 'violin-box',
    type: TraceType.VIOLIN_BOX,
    title: 'Violins',
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data,
    ...(violinOptions ? { violinOptions } : {}),
  };
}

/**
 * Reads a summary row by label, or undefined when the summary has no such row.
 */
function stat(
  trace: ViolinBoxTrace,
  label: string,
): string | number | undefined {
  return trace.description.stats.find(s => s.label === label)?.value;
}

describe('violinBoxTrace description summary', () => {
  test('attributes each extreme to its violin when several are present', () => {
    const trace = new ViolinBoxTrace(makeViolinBoxLayer([
      group('A', 5, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 12),
      group('C', 3, 9, 14, 22, 40),
    ]));

    expect(stat(trace, 'Lowest minimum')).toBe('1 (B)');
    expect(stat(trace, 'Highest maximum')).toBe('40 (C)');
    expect(stat(trace, 'Min')).toBeUndefined();
    expect(stat(trace, 'Max')).toBeUndefined();
  });

  test('reports plain ends when there is only one violin', () => {
    const trace = new ViolinBoxTrace(makeViolinBoxLayer([
      group('Only', 2, 4, 6, 8, 10),
    ]));

    expect(stat(trace, 'Minimum')).toBe(2);
    expect(stat(trace, 'Maximum')).toBe(10);
  });

  test('omits the maximum row when the violin does not draw extrema', () => {
    const trace = new ViolinBoxTrace(makeViolinBoxLayer([
      group('A', 5, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 12),
    ], { showExtrema: false }));

    // Naming a maximum would describe a section the user cannot navigate to.
    expect(trace.description.dataTable.headers).not.toContain('Maximum');
    expect(stat(trace, 'Highest maximum')).toBeUndefined();
    // The minimum is drawn unconditionally, so its row stays.
    expect(stat(trace, 'Lowest minimum')).toBe('1 (B)');
  });

  test('keeps the maximum row when extrema are drawn explicitly', () => {
    const trace = new ViolinBoxTrace(makeViolinBoxLayer([
      group('A', 5, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 12),
    ], { showExtrema: true }));

    expect(stat(trace, 'Highest maximum')).toBe('25 (A)');
  });

  test('marks a range as missing when no violin carries the end', () => {
    const trace = new ViolinBoxTrace(makeViolinBoxLayer([
      group('A', Number.NaN, 10, 15, 20, Number.NaN),
      group('B', Number.NaN, 4, 6, 8, Number.NaN),
    ]));

    expect(stat(trace, 'Lowest minimum')).toBe('missing');
    expect(stat(trace, 'Highest maximum')).toBe('missing');
  });

  test('falls back to the bare value when the violins carry no group name', () => {
    // Violin layers carry their group under `fill` and leave `z` unset, so the
    // real examples reach here — reading out "326 (undefined)" would be worse
    // than reading out "326".
    const unnamed = [group('A', 326, 878, 1810, 4678, 10378), group('B', 336, 912, 2648, 5372, 12060)]
      .map(p => ({ ...p, z: undefined as unknown as string }));
    const trace = new ViolinBoxTrace(makeViolinBoxLayer(unnamed));

    expect(stat(trace, 'Lowest minimum')).toBe(326);
    expect(stat(trace, 'Highest maximum')).toBe(12060);
  });

  test('trims a padded group name rather than announcing the padding', () => {
    const padded = [group('  A  ', 5, 10, 15, 20, 25), group('B', 1, 4, 6, 8, 12)];
    const trace = new ViolinBoxTrace(makeViolinBoxLayer(padded));

    // The blank check already judges the name by its trimmed form, so the
    // printed name has to match, or "25 (  A  )" reads the padding as a pause.
    expect(stat(trace, 'Highest maximum')).toBe('25 (A)');
  });

  test('still counts the groups and lists the sections', () => {
    const trace = new ViolinBoxTrace(makeViolinBoxLayer([
      group('A', 5, 10, 15, 20, 25),
      group('B', 1, 4, 6, 8, 12),
    ]));

    expect(stat(trace, 'Number of groups')).toBe(2);
    expect(stat(trace, 'Sections')).toBe('Minimum, 25%, 50%, 75%, Maximum');
  });
});
