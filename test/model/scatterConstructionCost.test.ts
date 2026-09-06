/**
 * @jest-environment jsdom
 */

import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * What a scatter costs to build.
 *
 * A reader waits through the constructor twice over: once when the chart
 * appears, and again on every live-data append, because the controller
 * rebuilds the whole figure from the full series. Work that grows faster
 * than the data is felt as the chart taking longer and longer to become
 * usable as points stream in.
 *
 * These pin the shape of that work by counting, not by timing: a wall-clock
 * assertion measures the machine, whereas a call count measures the
 * algorithm.
 */

/**
 * A scatter with no axis ranges, so grid mode stays out of the way and the
 * constructor takes the plain column-building path.
 * @param data - The points the layer carries
 * @returns The layer
 */
function createLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'points',
    type: TraceType.SCATTER,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/**
 * `count` points stacked on a single x — a strip plot, or one chromosome of
 * a Manhattan plot: the shape where every point shares its column with
 * every other.
 * @param count - How many points to stack
 * @returns The points
 */
function stackedAtOneX(count: number): ScatterPoint[] {
  return Array.from({ length: count }, (_, i) => ({ x: 0, y: i }));
}

/**
 * How many times the body of `build` scans an array with `indexOf`.
 * @param build - The work to measure
 * @returns The number of `Array.prototype.indexOf` calls it made
 */
function countArrayScans(build: () => void): number {
  const scan = jest.spyOn(Array.prototype, 'indexOf');
  try {
    build();
    return scan.mock.calls.length;
  } finally {
    scan.mockRestore();
  }
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

describe('the cost of building a scatter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not scan a column once per point in it', () => {
    const small = countArrayScans(() => {
      void new ScatterTrace(createLayer(stackedAtOneX(50)));
    });
    const large = countArrayScans(() => {
      void new ScatterTrace(createLayer(stackedAtOneX(200)));
    });

    // Locating a point inside its own column is a lookup, not a search, so
    // quadrupling the column does not quadruple the scanning.
    expect(small).toBe(0);
    expect(large).toBe(0);
  });

  test('orders the points four times, not six', () => {
    const sorts = countSorts(() => {
      void new ScatterTrace(createLayer(stackedAtOneX(50)));
    });

    // The columns and their index twins are the same order, as are the rows
    // and theirs, so one ordering serves each pair. The two reading orders
    // are their own.
    expect(sorts).toBe(4);
  });

  test('still groups the points into the columns and rows they belong to', () => {
    const trace = new ScatterTrace(createLayer([
      { x: 5, y: 3 },
      { x: 1, y: 7 },
      { x: 5, y: 1 },
    ]));

    // Columns are unique x ascending, rows unique y ascending, and a point
    // reads at its place in whichever the mode is on.
    expect(trace.positionOfDataIndex(1)).toEqual({ row: 0, col: 0 });
    expect(trace.positionOfDataIndex(2)).toEqual({ row: 0, col: 1 });
    expect(trace.positionOfDataIndex(0)).toEqual({ row: 1, col: 1 });
  });

  test('still reads a point at its own place in its column', () => {
    // Correctness first: the position must survive the faster derivation,
    // duplicated points included. Points at one x stack in ascending y, and
    // a repeated y reads at the first slot holding it.
    const trace = new ScatterTrace(createLayer([
      { x: 5, y: 3 },
      { x: 5, y: 1 },
      { x: 5, y: 3 },
      { x: 1, y: 7 },
    ]));

    expect(trace.positionOfDataIndex(1)).toEqual({ row: 0, col: 1 });
    expect(trace.positionOfDataIndex(0)).toEqual({ row: 1, col: 1 });
    expect(trace.positionOfDataIndex(2)).toEqual({ row: 1, col: 1 });
    expect(trace.positionOfDataIndex(3)).toEqual({ row: 0, col: 0 });
  });
});
