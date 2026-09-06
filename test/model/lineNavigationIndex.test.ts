import type { MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * How many times any point's `x` has been read since the last reset.
 *
 * Vertical navigation and intersection detection both answer "which column of
 * series `r` sits at this x?". Every answer they get by scanning a series
 * shows up here as one read per point examined, so the counter measures the
 * algorithmic shape of a keypress rather than its wall-clock cost.
 */
let xReads = 0;

/**
 * Build a line point whose `x` is counted each time it is read.
 * @param x The x value of the point
 * @param y The y value of the point
 * @returns A point that increments {@link xReads} on every `x` read
 */
function countingPoint(x: number, y: number): { x: number; y: number } {
  return {
    get x(): number {
      xReads += 1;
      return x;
    },
    y,
  };
}

/**
 * Build a multi-series line layer whose series never cross.
 * @param rows Number of series
 * @param cols Number of points per series
 * @returns A line layer of counting points
 */
function createLayer(rows: number, cols: number): MaidrLayer {
  const data = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => countingPoint(col, row + col / 1000)));

  return {
    id: 'test-line-layer',
    type: TraceType.LINE,
    title: 'Navigation index layer',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: data as unknown as MaidrLayer['data'],
  };
}

/**
 * Count the point reads one Up arrow costs with the cursor on the last column.
 * @param rows Number of series
 * @param cols Number of points per series
 * @returns The number of `x` reads the keypress performed
 */
function readsForOneUpwardMove(rows: number, cols: number): number {
  const trace = new LineTrace(createLayer(rows, cols));
  trace.moveToIndex(0, cols - 1);

  xReads = 0;
  trace.moveOnce('UPWARD');

  return xReads;
}

describe('lineTrace navigation cost', () => {
  beforeEach(() => {
    xReads = 0;
  });

  test('answers a vertical move without rescanning the series', () => {
    const short = readsForOneUpwardMove(4, 40);
    const long = readsForOneUpwardMove(4, 400);

    expect(long).toBe(short);
  });

  test('answers a horizontal move without rescanning the series', () => {
    const shortTrace = new LineTrace(createLayer(4, 40));
    shortTrace.moveToIndex(0, 20);
    const longTrace = new LineTrace(createLayer(4, 400));
    longTrace.moveToIndex(0, 20);

    xReads = 0;
    shortTrace.moveOnce('FORWARD');
    const short = xReads;
    xReads = 0;
    longTrace.moveOnce('FORWARD');
    const long = xReads;

    expect(long).toBe(short);
  });

  test('still lands on the nearest series above the cursor', () => {
    const trace = new LineTrace(createLayer(4, 40));
    trace.moveToIndex(0, 10);

    const moved = trace.moveOnce('UPWARD');
    const state = trace.state;

    expect(moved).toBe(true);
    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.text.main.value).toBe(10);
      expect(state.text.cross?.value).toBe(1.01);
    }
  });

  test('keeps a repeated x resolving to its first column', () => {
    const trace = new LineTrace({
      id: 'repeated-x',
      type: TraceType.LINE,
      title: 'Repeated x layer',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: [
        [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 6 }],
        [{ x: 1, y: 9 }, { x: 2, y: 9 }, { x: 2, y: 1 }],
      ],
    });
    trace.moveToIndex(0, 2);

    const moved = trace.moveOnce('UPWARD');
    const state = trace.state;

    expect(moved).toBe(true);
    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.text.cross?.value).toBe(9);
    }
  });
});
