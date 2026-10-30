import type { LineTrace } from '@model/line';
import type { LinePoint, MaidrLayer, PrCurvePoint, RocPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Control + Up and Down on a ROC or precision-recall curve go where Up and
 * Down stop.
 */

/** Two classifiers' ROC curves, which share their two corners. */
const LOGISTIC: RocPoint[] = [
  { x: 0, y: 0, threshold: 1, z: 'Logistic' },
  { x: 0.05, y: 0.55, threshold: 0.8, z: 'Logistic' },
  { x: 0.1, y: 0.75, threshold: 0.6, z: 'Logistic' },
  { x: 0.2, y: 0.86, threshold: 0.45, z: 'Logistic' },
  { x: 0.35, y: 0.93, threshold: 0.3, z: 'Logistic' },
  { x: 0.6, y: 0.98, threshold: 0.15, z: 'Logistic' },
  { x: 1, y: 1, threshold: 0, z: 'Logistic' },
];

const FOREST: RocPoint[] = [
  { x: 0, y: 0, threshold: 1, z: 'Forest' },
  { x: 0.1, y: 0.4, threshold: 0.7, z: 'Forest' },
  { x: 0.25, y: 0.6, threshold: 0.5, z: 'Forest' },
  { x: 0.45, y: 0.78, threshold: 0.35, z: 'Forest' },
  { x: 0.7, y: 0.9, threshold: 0.2, z: 'Forest' },
  { x: 1, y: 1, threshold: 0, z: 'Forest' },
];

/**
 * Two precision-recall curves listed from a recall of 0 up, which share
 * both ends: (0, 1) and the baseline at (1, 0.3).
 */
const PR_LOGISTIC: PrCurvePoint[] = [
  { x: 0, y: 1, z: 'Logistic' },
  { x: 0.3, y: 0.95, threshold: 0.8, z: 'Logistic' },
  { x: 0.6, y: 0.85, threshold: 0.6, z: 'Logistic' },
  { x: 0.8, y: 0.7, threshold: 0.4, z: 'Logistic' },
  { x: 0.9, y: 0.5, threshold: 0.2, z: 'Logistic' },
  { x: 1, y: 0.3, threshold: 0.05, z: 'Logistic', prevalence: 0.3 },
];

const PR_FOREST: PrCurvePoint[] = [
  { x: 0, y: 1, z: 'Forest' },
  { x: 0.35, y: 0.72, threshold: 0.7, z: 'Forest' },
  { x: 0.6, y: 0.56, threshold: 0.5, z: 'Forest' },
  { x: 0.8, y: 0.4, threshold: 0.3, z: 'Forest' },
  { x: 1, y: 0.3, threshold: 0.1, z: 'Forest', prevalence: 0.3 },
];

/**
 * A layer of rate curves.
 * @param type - ROC or precision-recall
 * @param data - The curves
 * @returns The layer definition
 */
function layer(type: TraceType, data: LinePoint[][]): MaidrLayer {
  return {
    id: 'curves',
    type,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/**
 * A trace on one point.
 * @param type - ROC or precision-recall
 * @param data - The curves
 * @param row - The curve
 * @param col - The point along it
 * @returns The positioned trace
 */
function traceAt(type: TraceType, data: LinePoint[][], row: number, col: number): LineTrace {
  const trace = TraceFactory.create(layer(type, data)) as LineTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * The state the trace announces.
 * @param trace - The trace to read
 * @returns The state, asserted populated
 */
function stateOf(trace: LineTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Where pressing one arrow until it is refused leaves the cursor.
 * @param trace - The trace, cursor placed; moved by the walk
 * @param direction - The arrow
 * @returns The curve and point the walk stopped on
 */
function walkEnd(trace: LineTrace, direction: 'UPWARD' | 'DOWNWARD'): [number, number] {
  // Bounded: a walk longer than every point of the chart has gone round.
  for (let step = 0; step < 100 && trace.moveOnce(direction); step++) {
    // keep pressing
  }
  return [trace.row, trace.col];
}

const CHARTS: [string, TraceType, LinePoint[][]][] = [
  ['ROC', TraceType.ROC, [LOGISTIC, FOREST]],
  ['precision-recall', TraceType.PR_CURVE, [PR_LOGISTIC, PR_FOREST]],
];

describe.each(CHARTS)('control + up and down on a %s chart', (_name, type, data) => {
  const everyPoint = data.flatMap((curve, row) => curve.map((_point, col) => [row, col] as const));

  test.each(['UPWARD', 'DOWNWARD'] as const)('%s lands where pressing the arrow stops, from every point', (direction) => {
    for (const [row, col] of everyPoint) {
      const jumped = traceAt(type, data, row, col);
      const walked = traceAt(type, data, row, col);

      expect(jumped.moveToExtreme(direction)).toBe(true);
      expect([jumped.row, jumped.col]).toEqual(walkEnd(walked, direction));
      // So the next arrow that way sounds the edge rather than moving.
      expect(jumped.isMovable(direction)).toBe(false);
    }
  });
});

describe('control + up and down where curves are level', () => {
  test('stay on the top curve of a tie, where up is refused', () => {
    // Both curves start at (0, 0); the first curve is the top of the tie.
    const trace = traceAt(TraceType.ROC, [LOGISTIC, FOREST], 0, 0);
    expect(trace.isMovable('UPWARD')).toBe(false);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);

    expect(stateOf(trace).group?.value).toBe('Logistic');
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });

  test('go to the bottom curve of a tie, where down is refused', () => {
    const trace = traceAt(TraceType.ROC, [LOGISTIC, FOREST], 0, 0);

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);

    expect(stateOf(trace).group?.value).toBe('Forest');
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    // The point is the corner both curves share, and sounds as both.
    expect(stateOf(trace).intersections?.map(tone => tone.group)).toEqual([0, 1]);
  });

  test('cross a tie of three curves in one press', () => {
    const third: RocPoint[] = [{ x: 0, y: 0, z: 'Third' }, { x: 0.5, y: 0.5, z: 'Third' }, { x: 1, y: 1, z: 'Third' }];
    const trace = traceAt(TraceType.ROC, [LOGISTIC, FOREST, third], 2, 0);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);

    expect(stateOf(trace).group?.value).toBe('Logistic');
  });
});

describe('control + up and down compare the curves at the cursor\'s own rate', () => {
  test('do not leave for a curve that is higher only at the same column', () => {
    // Column 1 of the first curve is (0.5, 0.9), above column 1 of the
    // second, (0.05, 0.5). At 0.05, though, the first curve is drawn at
    // 0.09, below the cursor, and Up is refused.
    const steep: RocPoint[] = [{ x: 0, y: 0, z: 'A' }, { x: 0.5, y: 0.9, z: 'A' }, { x: 1, y: 1, z: 'A' }];
    const early: RocPoint[] = [
      { x: 0, y: 0, z: 'B' },
      { x: 0.05, y: 0.5, z: 'B' },
      { x: 0.1, y: 0.6, z: 'B' },
      { x: 1, y: 1, z: 'B' },
    ];
    const trace = traceAt(TraceType.ROC, [steep, early], 1, 1);
    expect(trace.isMovable('UPWARD')).toBe(false);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);

    expect(stateOf(trace).group?.value).toBe('B');
    expect(stateOf(trace).text.main.value).toBe(0.05);
  });
});

describe('control + arrows as the first key', () => {
  test('enter on the first point and go on from there', () => {
    const trace = TraceFactory.create(layer(TraceType.ROC, [LOGISTIC, FOREST])) as LineTrace;

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);

    expect(stateOf(trace).group?.value).toBe('Forest');
    expect(stateOf(trace).text.main.value).toBe(0);
  });

  test('left and right still go to the ends of the curve', () => {
    const trace = traceAt(TraceType.ROC, [LOGISTIC, FOREST], 1, 2);

    expect(trace.moveToExtreme('FORWARD')).toBe(true);

    expect(stateOf(trace).text.main.value).toBe(1);
    expect(stateOf(trace).group?.value).toBe('Forest');
  });
});
