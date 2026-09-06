import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * What wiring a line's navigation graph costs to build.
 *
 * The graph is built in the constructor, once per series and again on every
 * live-data append, since the controller rebuilds the figure from the full
 * series. A chart of a few series over ten thousand samples has ten thousand
 * columns, so anything done per column is done ten thousand times before the
 * reader hears the first point.
 *
 * `LineTrace` navigates up and down by comparing y values at the cursor's own
 * x (`findLineByXAndYDirection`) and left and right by moving the column
 * index, overriding `moveOnce` and `isMovable` for every direction. What the
 * graph is actually read for is the extremes — the top and bottom of a
 * column, the start and end of a series — and whether a cell exists at all.
 * These count the work and pin the four answers that are read.
 */

/**
 * A line layer of `series` series over `columns` columns.
 * @param series - The y of each series, one array per series
 * @returns The layer
 */
function lineLayer(series: readonly (readonly number[])[]): MaidrLayer {
  return {
    id: 'series',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: series.map(ys => ys.map((y, x): LinePoint => ({ x, y }))),
  };
}

/**
 * One series of `columns` points.
 * @param columns - How many points the series carries
 * @returns The layer
 */
function oneSeriesOf(columns: number): MaidrLayer {
  return lineLayer([Array.from({ length: columns }, (_, i) => i)]);
}

/**
 * How many times the body of `build` sorts an array.
 * @param build - The work to measure
 * @returns The number of `Array.prototype.sort` calls it made
 */
function countSorts(build: () => void): number {
  const sort = jest.spyOn(Array.prototype, 'sort');
  try {
    build();
    return sort.mock.calls.length;
  } finally {
    sort.mockRestore();
  }
}

/**
 * The y announced at the cursor, which says which series it is on: every
 * fixture below gives its series distinct y values.
 * @param trace - The trace to read
 * @returns The cross-axis value
 */
function yAt(trace: LineTrace): unknown {
  return (trace.state as NonEmptyTraceState).text.cross?.value;
}

/**
 * Drive a trace and report the y each move landed on.
 * @param trace - The trace to drive
 * @param directions - The moves to make
 * @returns The y after each move, or null where the move was refused
 */
function walk(trace: LineTrace, ...directions: MovableDirection[]): unknown[] {
  return directions.map(direction => (trace.moveOnce(direction) ? yAt(trace) : null));
}

describe('the cost of wiring a line for navigation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not sort a column of the chart once per column', () => {
    const small = countSorts(() => {
      void new LineTrace(oneSeriesOf(50));
    });
    const large = countSorts(() => {
      void new LineTrace(oneSeriesOf(100));
    });

    // The top and the bottom of a column are its highest and lowest point,
    // which one pass finds; ordering the whole column answered a question
    // nothing asks.
    expect(small).toBe(0);
    expect(large).toBe(0);
  });

  test('still jumps to the highest and lowest series at the cursor', () => {
    // Three series crossing at x = 1: the middle series is highest there and
    // the first is lowest, which is not their order anywhere else.
    const trace = new LineTrace(lineLayer([
      [9, 0, 9],
      [5, 7, 5],
      [6, 4, 6],
    ]));
    trace.moveOnce('FORWARD'); // initial entry, lands on (0, 0)
    trace.moveOnce('FORWARD'); // to x = 1, where the series cross

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(yAt(trace)).toBe(7);

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(yAt(trace)).toBe(0);
  });

  test('still steps between series by the y values at the cursor', () => {
    const trace = new LineTrace(lineLayer([
      [0, 0],
      [1, 1],
      [2, 2],
    ]));
    trace.moveOnce('FORWARD');

    // Up walks the series in ascending y, and stops at the top of them.
    expect(walk(trace, 'UPWARD', 'UPWARD', 'UPWARD')).toEqual([1, 2, null]);
  });

  test('still walks a series and stops at both of its ends', () => {
    const trace = new LineTrace(oneSeriesOf(3));
    trace.moveOnce('FORWARD');

    expect(walk(trace, 'FORWARD', 'FORWARD', 'FORWARD')).toEqual([1, 2, null]);
    expect(walk(trace, 'BACKWARD', 'BACKWARD', 'BACKWARD')).toEqual([1, 0, null]);
  });

  test('still jumps to the ends of a series', () => {
    const trace = new LineTrace(oneSeriesOf(4));
    trace.moveOnce('FORWARD');

    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(yAt(trace)).toBe(3);

    expect(trace.moveToExtreme('BACKWARD')).toBe(true);
    expect(yAt(trace)).toBe(0);
  });

  test('still takes the last of a column\'s joint highest as its top', () => {
    // Two series are equal at the cursor and one is lower. Ordering the
    // column and reading its ends gave the last of the tied rows as the top
    // and the first as the bottom; a single pass has to agree. The series
    // are told apart by their second point, which differs.
    const trace = new LineTrace(lineLayer([
      [4, 10],
      [4, 20],
      [1, 30],
    ]));
    trace.moveOnce('FORWARD');

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(walk(trace, 'FORWARD')).toEqual([20]);
  });

  test('still takes the first of a column\'s joint lowest as its bottom', () => {
    const trace = new LineTrace(lineLayer([
      [9, 10],
      [1, 20],
      [1, 30],
    ]));
    trace.moveOnce('FORWARD');

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(walk(trace, 'FORWARD')).toEqual([20]);
  });
});
