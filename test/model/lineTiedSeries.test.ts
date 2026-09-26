import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Up and Down at a point several series share (#1270).
 *
 * Every series here meets the others at x = 0 and is told apart by its y at
 * x = 1, which is the series index times ten, so the row the cursor is on
 * can be read back off its neighbour.
 */

/**
 * Build a line layer from each series' y at x = 0 and x = 1.
 * @param series One `[y0, y1]` pair per series
 * @returns A line layer
 */
function lineLayer(series: [number, number][]): MaidrLayer {
  return {
    id: 'tied-series',
    type: TraceType.LINE,
    title: 'Tied series',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: series.map(([y0, y1]) => [{ x: 0, y: y0 }, { x: 1, y: y1 }]),
  };
}

/**
 * The series the cursor is on, read from its y at x = 1.
 * @param trace The trace
 * @returns That y, which names the series
 */
function seriesOf(trace: LineTrace): number {
  const col = trace.col;
  trace.moveOnce('FORWARD');
  const state = trace.state;
  trace.moveToIndex(trace.row, col);
  if (state.empty) {
    throw new Error('no point at x = 1');
  }
  return Number(state.text.cross?.value);
}

/**
 * Press one arrow until it is refused, reading the series after each move.
 * @param trace The trace, cursor already placed
 * @param direction The arrow
 * @returns The series visited, in order
 */
function walk(trace: LineTrace, direction: 'UPWARD' | 'DOWNWARD'): number[] {
  const visited: number[] = [];
  while (trace.moveOnce(direction)) {
    visited.push(seriesOf(trace));
  }
  return visited;
}

describe('up and down at a point series share', () => {
  test('move between two series level with each other', () => {
    const trace = new LineTrace(lineLayer([[5, 0], [5, 10]]));
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(true);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(seriesOf(trace)).toBe(10);
    expect(trace.isMovable('UPWARD')).toBe(false);

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(seriesOf(trace)).toBe(0);
    expect(trace.isMovable('DOWNWARD')).toBe(false);
  });

  test('walk a tie one series at a time in series order', () => {
    const trace = new LineTrace(lineLayer([[5, 0], [5, 10], [5, 20], [5, 30]]));
    trace.moveToIndex(1, 0);

    expect(walk(trace, 'UPWARD')).toEqual([20, 30]);
    expect(walk(trace, 'DOWNWARD')).toEqual([20, 10, 0]);
  });

  test('pass through a tie on the way to the series beyond it', () => {
    // Series 0 is below, 1 and 2 are level, 3 is above.
    const trace = new LineTrace(lineLayer([[1, 0], [5, 10], [5, 20], [9, 30]]));
    trace.moveToIndex(0, 0);

    expect(walk(trace, 'UPWARD')).toEqual([10, 20, 30]);
    expect(walk(trace, 'DOWNWARD')).toEqual([20, 10, 0]);
  });

  test('agree with the column top and bottom about which tied series is highest', () => {
    const trace = new LineTrace(lineLayer([[5, 0], [5, 10], [5, 20]]));
    trace.moveToIndex(0, 0);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(seriesOf(trace)).toBe(20);
    expect(trace.isMovable('UPWARD')).toBe(false);

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(seriesOf(trace)).toBe(0);
    expect(trace.isMovable('DOWNWARD')).toBe(false);
  });

  test('still refuses where no other series has a point', () => {
    const trace = new LineTrace(lineLayer([[5, 0]]));
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.isMovable('DOWNWARD')).toBe(false);
  });
});
