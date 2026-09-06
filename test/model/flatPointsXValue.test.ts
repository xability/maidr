import type { DumbbellData, ErrorBarPoint, MaidrLayer, WaterfallPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { DumbbellTrace } from '@model/dumbbell';
import { ErrorBarTrace } from '@model/errorBar';
import { WaterfallTrace } from '@model/waterfall';
import { TraceType } from '@type/grammar';

/**
 * Waterfall, error bar and dumbbell keep their points in a flat list rather
 * than one list per row. The base X-value helpers only understand the nested
 * shape, so without their own answer these traces report no X at all: the
 * rotor's LOWER / HIGHER VALUE modes are offered and then go silent, and a
 * layer switch cannot keep the reader on the same category.
 */

const STEPS: WaterfallPoint[] = [
  { x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' },
  { x: 'Marketing', start: 1200, end: 950, delta: -250, kind: 'decrease' },
  { x: 'Sales', start: 950, end: 1430, delta: 480, kind: 'increase' },
  { x: 'Support', start: 1430, end: 1360, delta: -70, kind: 'decrease' },
  { x: 'Closing', start: 0, end: 1360, delta: 1360, kind: 'total' },
];

const GAINS: DumbbellData = {
  startLabel: '1990',
  endLabel: '2020',
  points: [
    { x: 'Denmark', start: 71.2, end: 78.4 },
    { x: 'Latvia', start: 74.6, end: 69.5 },
    { x: 'Malta', start: 76.0, end: 76.0 },
  ],
};

const CONTROL: ErrorBarPoint[] = [
  { x: 'a', y: 2, yMin: 1.5, yMax: 2.9, z: 'control' },
  { x: 'b', y: 4, yMin: 3.2, yMax: 5.5, z: 'control' },
  { x: 'c', y: 3, yMin: 2.7, yMax: 3.2, z: 'control' },
];

const TREATED: ErrorBarPoint[] = [
  { x: 'a', y: 3, yMin: 2.4, yMax: 3.6, z: 'treated' },
  { x: 'b', y: 5, yMin: 4.1, yMax: 6.0, z: 'treated' },
  { x: 'c', y: 6, yMin: 5.2, yMax: 6.9, z: 'treated' },
];

function layer(type: TraceType, data: MaidrLayer['data']): MaidrLayer {
  return {
    id: `${type}-layer`,
    type,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

function crossValue(trace: { state: TraceState }): unknown {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text.cross?.value;
}

describe('waterfall x values', () => {
  test('reports the step under the cursor', () => {
    const trace = new WaterfallTrace(layer(TraceType.WATERFALL, STEPS));
    trace.moveToIndex(0, 1);

    expect(trace.getCurrentXValue()).toBe('Marketing');
  });

  test('moves to a named step', () => {
    const trace = new WaterfallTrace(layer(TraceType.WATERFALL, STEPS));

    expect(trace.moveToXValue('Sales')).toBe(true);
    expect(trace.col).toBe(2);
    expect(trace.moveToXValue('Nowhere')).toBe(false);
  });

  test('finds the next higher delta in rotor compare mode', () => {
    const trace = new WaterfallTrace(layer(TraceType.WATERFALL, STEPS));
    trace.moveToIndex(0, 1);

    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Sales');
    expect(trace.moveToNextCompareValue('right', 'lower')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Support');
  });

  test('reports the boundary when nothing further qualifies', () => {
    const trace = new WaterfallTrace(layer(TraceType.WATERFALL, STEPS));
    trace.moveToIndex(0, 4);

    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(false);
    expect(trace.col).toBe(4);
  });
});

describe('dumbbell x values', () => {
  test('reports the pair under the cursor on either end', () => {
    const trace = new DumbbellTrace(layer(TraceType.DUMBBELL, GAINS));

    trace.moveToIndex(1, 1);

    expect(trace.getCurrentXValue()).toBe('Latvia');
  });

  test('moves to a named pair without leaving the current end', () => {
    const trace = new DumbbellTrace(layer(TraceType.DUMBBELL, GAINS));
    trace.moveToIndex(1, 0);

    expect(trace.moveToXValue('Malta')).toBe(true);
    expect(trace.row).toBe(1);
    expect(trace.col).toBe(2);
  });

  test('compares along the current end', () => {
    const trace = new DumbbellTrace(layer(TraceType.DUMBBELL, GAINS));
    trace.moveToIndex(0, 0);

    // Starts: 71.2, 74.6, 76.0 — every step right is higher.
    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Latvia');
    expect(trace.moveToNextCompareValue('right', 'lower')).toBe(false);
  });
});

describe('error bar x values', () => {
  test('reports the category under the cursor within the current group', () => {
    const trace = new ErrorBarTrace(layer(TraceType.ERROR_BAR, [CONTROL, TREATED]));

    // Rows run group-major, three sections each: row 3 is the treated group.
    trace.moveToIndex(3, 1);

    expect(trace.getCurrentXValue()).toBe('b');
  });

  test('moves to a named category without leaving the current row', () => {
    const trace = new ErrorBarTrace(layer(TraceType.ERROR_BAR, [CONTROL, TREATED]));
    trace.moveToIndex(3, 0);

    expect(trace.moveToXValue('c')).toBe(true);
    expect(trace.row).toBe(3);
    expect(trace.col).toBe(2);
  });

  test('compares along the current row', () => {
    const trace = new ErrorBarTrace(layer(TraceType.ERROR_BAR, [CONTROL, TREATED]));
    trace.moveToIndex(1, 0);
    const before = crossValue(trace) as number;

    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(crossValue(trace) as number).toBeGreaterThan(before);
    expect(trace.row).toBe(1);
  });
});
