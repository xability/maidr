import type { LineTrace } from '@model/line';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Up and Down between series whose values are close: a few doubles apart, or
 * equal up to float noise.
 */

/**
 * A layer of one type.
 * @param type - The layer type
 * @param data - The series
 * @returns The layer definition
 */
function layer(type: TraceType, data: LinePoint[][]): MaidrLayer {
  return {
    id: 'series',
    type,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/**
 * A trace on one point.
 * @param type - The layer type
 * @param data - The series
 * @param row - The series the cursor is on
 * @param col - The point along it
 * @returns The positioned trace
 */
function traceAt(type: TraceType, data: LinePoint[][], row: number, col: number): LineTrace {
  const trace = TraceFactory.create(layer(type, data)) as LineTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * The name of the series the cursor is on.
 * @param trace - The trace to read
 * @returns The series' name
 */
function seriesOf(trace: LineTrace): unknown {
  const state: NonEmptyTraceState | { empty: true } = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state.group?.value;
}

/**
 * Press one arrow until it is refused, naming the series after each press.
 * @param trace - The trace, cursor placed
 * @param direction - The arrow
 * @returns The series reached, in order
 */
function walk(trace: LineTrace, direction: 'UPWARD' | 'DOWNWARD'): unknown[] {
  const reached: unknown[] = [];
  for (let step = 0; step < 10 && trace.moveOnce(direction); step++) {
    reached.push(seriesOf(trace));
  }
  return reached;
}

/**
 * Three densities at the left edge of a KDE like the Altair example's: a
 * tail of 9.4e-28, a curve that is exactly 0 there, and one at 0.0102. The
 * distances from 0.0102 to the first two are one double.
 */
const DENSITIES: LinePoint[][] = [
  [{ x: -6.57, y: 9.4e-28, z: 'Group 1' }, { x: -6.52, y: 3.7e-27, z: 'Group 1' }, { x: 0, y: 0.4, z: 'Group 1' }],
  [{ x: -6.57, y: 0, z: 'Group 2' }, { x: -6.52, y: 0, z: 'Group 2' }, { x: 0, y: 0.2, z: 'Group 2' }],
  [{ x: -6.57, y: 0.0102, z: 'Group 3' }, { x: -6.52, y: 0.011, z: 'Group 3' }, { x: 0, y: 0.1, z: 'Group 3' }],
];

/**
 * Three series of p-values, listed out of value order: in series order they
 * would read High, Low, Middle from the bottom.
 */
const P_VALUES: LinePoint[][] = [
  [{ x: 1, y: 1e-10, z: 'High' }, { x: 2, y: 2e-10, z: 'High' }],
  [{ x: 1, y: 1e-12, z: 'Low' }, { x: 2, y: 3e-12, z: 'Low' }],
  [{ x: 1, y: 5e-11, z: 'Middle' }, { x: 2, y: 6e-11, z: 'Middle' }],
];

describe('a line chart ranks values a double apart by value', () => {
  test('down from the top reaches every curve, in value order', () => {
    const trace = traceAt(TraceType.LINE, DENSITIES, 2, 0);

    expect(walk(trace, 'DOWNWARD')).toEqual(['Group 1', 'Group 2']);
  });

  test('up from the bottom walks the same order back', () => {
    const trace = traceAt(TraceType.LINE, DENSITIES, 1, 0);

    expect(walk(trace, 'UPWARD')).toEqual(['Group 1', 'Group 3']);
  });

  test('control + up and down land where up and down stop', () => {
    const trace = traceAt(TraceType.LINE, DENSITIES, 2, 0);

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(seriesOf(trace)).toBe('Group 2');
    expect(trace.isMovable('DOWNWARD')).toBe(false);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(seriesOf(trace)).toBe('Group 3');
    expect(trace.isMovable('UPWARD')).toBe(false);
  });
});

describe('small values keep their order however small they are', () => {
  test('up and down walk p-values by value, not in series order', () => {
    expect(walk(traceAt(TraceType.LINE, P_VALUES, 0, 0), 'DOWNWARD')).toEqual(['Middle', 'Low']);
    expect(walk(traceAt(TraceType.LINE, P_VALUES, 1, 0), 'UPWARD')).toEqual(['Middle', 'High']);
  });

  test('control + up and down jump to the highest and the lowest p-value', () => {
    const trace = traceAt(TraceType.LINE, P_VALUES, 2, 0);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(seriesOf(trace)).toBe('High');

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(seriesOf(trace)).toBe('Low');
  });
});

describe('values equal but for float noise are level', () => {
  test('a sum carrying float noise is stacked with the value it stands for as an exact tie is', () => {
    // 0.1 + 0.2 is 0.30000000000000004. Equal to 0.3 as drawn, the two are
    // stacked as an exact tie is, the later series above.
    const trace = traceAt(TraceType.LINE, [
      [{ x: 1, y: 0.1 + 0.2, z: 'Sum' }, { x: 2, y: 0.5, z: 'Sum' }],
      [{ x: 1, y: 0.3, z: 'Value' }, { x: 2, y: 0.6, z: 'Value' }],
    ], 0, 0);

    expect(walk(trace, 'UPWARD')).toEqual(['Value']);
    expect(walk(trace, 'DOWNWARD')).toEqual(['Sum']);
  });

  test('values that differ by more than float noise keep their order', () => {
    const trace = traceAt(TraceType.LINE, [
      [{ x: 1, y: 0.001, z: 'Low' }, { x: 2, y: 0.4, z: 'Low' }],
      [{ x: 1, y: 0, z: 'Floor' }, { x: 2, y: 0.2, z: 'Floor' }],
      [{ x: 1, y: 0.0102, z: 'High' }, { x: 2, y: 0.1, z: 'High' }],
    ], 2, 0);

    expect(walk(trace, 'DOWNWARD')).toEqual(['Low', 'Floor']);
  });
});

/**
 * Three curves at a rate of 0.5 on the x axis. A runs vertically there from
 * 0.3 to 0.6, B passes through 0.3, and C through 0.1 + 0.2. The cursor on C
 * is inside A's run, so A is level with it at the cursor's own value, and B
 * is level with it but for float noise.
 */
const VERTICAL_RUN: LinePoint[][] = [
  [{ x: 0, y: 0.1, z: 'A' }, { x: 0.5, y: 0.3, z: 'A' }, { x: 0.5, y: 0.6, z: 'A' }, { x: 1, y: 1, z: 'A' }],
  [{ x: 0, y: 0.1, z: 'B' }, { x: 0.5, y: 0.3, z: 'B' }, { x: 1, y: 1, z: 'B' }],
  [{ x: 0, y: 0.1, z: 'C' }, { x: 0.5, y: 0.1 + 0.2, z: 'C' }, { x: 1, y: 1, z: 'C' }],
];

describe('a rate curve ranks its curves the same way', () => {
  test('down from the top reaches every curve, in value order', () => {
    const trace = traceAt(TraceType.ROC, [
      [{ x: 0, y: 0, z: 'A' }, { x: 0.5, y: 9.4e-28, z: 'A' }, { x: 1, y: 1, z: 'A' }],
      [{ x: 0, y: 0, z: 'B' }, { x: 0.5, y: 0, z: 'B' }, { x: 1, y: 1, z: 'B' }],
      [{ x: 0, y: 0, z: 'C' }, { x: 0.5, y: 0.0102, z: 'C' }, { x: 1, y: 1, z: 'C' }],
    ], 2, 1);

    expect(walk(trace, 'DOWNWARD')).toEqual(['A', 'B']);
  });

  test.each([TraceType.ROC, TraceType.PR_CURVE])(
    'on a %s chart, a vertical run through the cursor and a float-noise tie are both level with it',
    (type) => {
      const trace = traceAt(type, VERTICAL_RUN, 2, 1);

      // Level, the three are stacked with the first curve on top.
      expect(walk(trace, 'UPWARD')).toEqual(['B', 'A']);
      expect(walk(trace, 'DOWNWARD')).toEqual(['B', 'C']);
    },
  );
});

describe('values equal but for float noise are level on a survival chart', () => {
  test('two estimates equal up to float noise are stacked as an exact tie is', () => {
    const trace = traceAt(TraceType.SURVIVAL, [
      [{ x: 0, y: 1, z: 'Sum' }, { x: 6, y: 0.1 + 0.2, z: 'Sum' }],
      [{ x: 0, y: 1, z: 'Value' }, { x: 6, y: 0.3, z: 'Value' }],
    ], 0, 1);

    expect(walk(trace, 'UPWARD')).toEqual(['Value']);
  });
});
