import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Two lines that meet at their first point, neither of them named.
 */
function layer(data: LinePoint[][]): MaidrLayer {
  return {
    id: 'lines',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

function textOf(trace: LineTrace): TextState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text;
}

describe('an intersection of unnamed lines', () => {
  test('names the lines the way every other announcement does', () => {
    const trace = new LineTrace(layer([
      [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      [{ x: 1, y: 1 }, { x: 2, y: 3 }],
    ]));
    trace.moveToIndex(0, 0);

    const { z } = textOf(trace);

    // The position announcement, the description table and the intersection
    // label all say "Line 1"; the summary must not switch to an abbreviation
    // the reader has never been given.
    expect(z?.value).toBe('intersection at (Line 1, Line 2)');
  });

  test('keeps an authored name when the series has one', () => {
    const trace = new LineTrace(layer([
      [{ x: 1, y: 1, z: 'Control' }, { x: 2, y: 2, z: 'Control' }],
      [{ x: 1, y: 1, z: 'Treated' }, { x: 2, y: 3, z: 'Treated' }],
    ]));
    trace.moveToIndex(0, 0);

    const { z } = textOf(trace);

    expect(z?.value).toBe('intersection at (Control, Treated)');
  });
});
