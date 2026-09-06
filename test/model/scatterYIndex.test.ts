/**
 * Switching a scatter between column and row navigation must not walk the
 * y axis.
 *
 * The COL -> ROW half located the target row with `yValues.indexOf(...)`,
 * which on a continuous y axis is one entry per point: on the Manhattan and
 * volcano charts this trace is documented for, up to 100,000 numbers scanned
 * on every Up or Down arrow. The mirror direction was already indexed --
 * `xIndexByValue` exists precisely so `xIndexOf` is a lookup.
 */

import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * A scatter whose points all have distinct x and y, so the y axis is as long
 * as the data.
 * @param points How many points the chart holds
 * @returns The layer definition
 */
function scatterLayer(points: number): MaidrLayer {
  const data: ScatterPoint[] = Array.from({ length: points }, (_, index) => ({
    x: index,
    y: index * 2,
  }));
  return {
    id: 'y-index-layer',
    type: TraceType.SCATTER,
    title: 'Y index',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/**
 * How many array entries `indexOf` walks over during one vertical keypress.
 *
 * Counting the entries rather than the calls is what separates a lookup from
 * a scan: an `indexOf` over a two-element array is not the cost this is about.
 * @param points How many points the chart holds
 * @returns The number of entries walked
 */
function entriesScannedByOneVerticalMove(points: number): number {
  const trace = new ScatterTrace(scatterLayer(points));
  trace.moveOnce('FORWARD');

  const indexOf = jest.spyOn(Array.prototype, 'indexOf');
  let scanned = 0;
  try {
    trace.moveOnce('UPWARD');
    // Read before restoring: mockRestore() clears the recorded calls.
    scanned = indexOf.mock.contexts.reduce<number>(
      (total, context) => total + (context as unknown[]).length,
      0,
    );
  } finally {
    indexOf.mockRestore();
  }

  return scanned;
}

describe('a scatter switching to row navigation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds the target row without walking the y axis', () => {
    const small = entriesScannedByOneVerticalMove(20);
    const large = entriesScannedByOneVerticalMove(200);

    expect(large).toBe(small);
  });

  it('still lands on the row holding the column it left', () => {
    const trace = new ScatterTrace(scatterLayer(20));
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    trace.moveOnce('UPWARD');
    const state = trace.state as Extract<TraceState, { empty: false }>;

    // Column 1 holds the single point (1, 2), so the row landed on is the one
    // whose only x is 1.
    expect(state.text.main.value).toBe(2);
    expect(state.text.cross?.value).toEqual([1]);
  });

  it('reports the row of a data index in row mode', () => {
    const trace = new ScatterTrace(scatterLayer(20));
    trace.moveOnce('FORWARD');
    trace.moveOnce('UPWARD');

    expect(trace.positionOfDataIndex(5)).toEqual({ row: 5, col: 5 });
  });

  it('falls back to the first row for a y the axis does not carry', () => {
    // A NaN y groups into its own bucket but can never be matched by value,
    // which is what the -1 fallback in the toggle is written for.
    const trace = new ScatterTrace({
      id: 'nan-y',
      type: TraceType.SCATTER,
      title: 'NaN y',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: [{ x: 0, y: Number.NaN }, { x: 1, y: 4 }],
    });
    trace.moveOnce('FORWARD');

    const moved = trace.moveOnce('UPWARD');

    expect(moved).toBe(true);
  });
});
