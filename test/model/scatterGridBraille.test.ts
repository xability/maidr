/**
 * The braille surface of a binned scatter is a count per cell, and the cells
 * are fixed when the trace is built. Rebuilding the whole matrix on every
 * state read put a full grid scan and a row of allocations on the keypress
 * path -- on a 100 x 100 grid, ten thousand cell reads per arrow key, feeding
 * the garbage collector on the same tick the audio scheduler runs.
 */

import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { BrailleState, TraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * A scatter over a 2 x 2 grid, with two points in one cell and one in another.
 * @returns The layer definition
 */
function gridLayer(): MaidrLayer {
  const data: ScatterPoint[] = [
    { x: 1, y: 1 },
    { x: 1.5, y: 1.5 },
    { x: 3, y: 3 },
  ];
  return {
    id: 'grid-braille-layer',
    type: TraceType.SCATTER,
    title: 'Grid braille',
    axes: {
      x: { label: 'X', min: 0, max: 4, tickStep: 2 },
      y: { label: 'Y', min: 0, max: 4, tickStep: 2 },
    },
    data,
  };
}

/**
 * A grid-mode scatter trace positioned on its first cell.
 *
 * The first `moveOnce` is the trace's initial entry, which lands the cursor
 * rather than stepping it.
 * @returns The trace
 */
function gridTrace(): ScatterTrace {
  const trace = new ScatterTrace(gridLayer());
  trace.setGridMode(true);
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The braille state the trace currently reports.
 * @param trace The trace to read
 * @returns Its braille state
 */
function brailleOf(trace: ScatterTrace): BrailleState {
  const state = trace.state as Extract<TraceState, { empty: false }>;
  return state.braille;
}

describe('a grid-mode scatter reports its cell counts', () => {
  it('builds the count matrix once rather than per state read', () => {
    const trace = gridTrace();

    const first = brailleOf(trace);
    trace.moveOnce('FORWARD');
    const second = brailleOf(trace);

    expect(first.empty).toBe(false);
    if (!first.empty && !second.empty) {
      expect(second.values).toBe(first.values);
    }
  });

  it('counts the points in every cell and takes the busiest as the maximum', () => {
    const trace = gridTrace();

    const braille = brailleOf(trace);

    expect(braille.empty).toBe(false);
    if (!braille.empty) {
      expect(braille.values).toEqual([[2, 0], [0, 1]]);
      expect(braille.min).toBe(0);
      expect(braille.max).toBe(2);
    }
  });

  it('moves the cursor over the cells without changing the counts', () => {
    const trace = gridTrace();
    const before = brailleOf(trace);

    trace.moveOnce('FORWARD');
    const after = brailleOf(trace);

    expect(before.empty).toBe(false);
    if (!before.empty && !after.empty) {
      expect(after.values).toEqual([[2, 0], [0, 1]]);
      expect(after.col).not.toBe(before.col);
    }
  });

  it('releases the matrix when the trace is disposed', () => {
    // dispose() empties every cell, and this class's dispose exists to let go
    // of exactly this kind of retained array. A matrix kept past it would both
    // leak and disagree with the cells it was counted from.
    const trace = gridTrace();
    const before = brailleOf(trace);

    trace.dispose();
    const after = brailleOf(trace);

    expect(before.empty).toBe(false);
    if (!before.empty && !after.empty) {
      expect(after.values).not.toBe(before.values);
      expect(after.values).toEqual([[0, 0], [0, 0]]);
    }
  });
});
