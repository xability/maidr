import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Switching layers keeps the reader at the same X, which asks the outgoing
 * trace for its current X. A scatter reads it off whichever axis the reader
 * is walking: the column's x in COL mode, and in ROW mode the x it would land
 * on when switching back to columns -- never a y value dressed up as an x,
 * and never nothing.
 */
function scatterLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'scatter',
    type: TraceType.SCATTER,
    title: 'Scatter',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

function textOf(trace: ScatterTrace): TextState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text;
}

/** Three points stacked at x=1, then a row y=3 spanning x=1, 5 and 9. */
const POINTS: ScatterPoint[] = [
  { x: 1, y: 1 },
  { x: 1, y: 2 },
  { x: 1, y: 3 },
  { x: 5, y: 3 },
  { x: 9, y: 3 },
];

describe('the current x of a scatter', () => {
  test('is the column x in COL mode', () => {
    const trace = new ScatterTrace(scatterLayer(POINTS));
    trace.moveToIndex(0, 1);

    expect(trace.getCurrentXValue()).toBe(5);
  });

  test('is an x of the row, not its y, in ROW mode', () => {
    const trace = new ScatterTrace(scatterLayer(POINTS));
    // Entry, then a toggle into ROW mode at the column's middle y (2), then
    // one row up to y=3 -- whose x values are 1, 5 and 9.
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    expect(textOf(trace).main.value).toBe(3);

    const x = trace.getCurrentXValue();

    expect(x).toBe(5);
  });

  test('moving to an x lands on that column in COL mode', () => {
    const trace = new ScatterTrace(scatterLayer(POINTS));
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    expect(trace.moveToXValue(9)).toBe(true);
    expect(textOf(trace).main.value).toBe(9);
    expect(textOf(trace).cross?.value).toEqual([3]);
  });
});
