import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Two lines sampled at the same X positions, so every X has an exact match on
 * both rows and the row the move lands on is the one the resolver chose.
 */
function twoLineTrace(): LineTrace {
  const layer: MaidrLayer = {
    id: 'lines',
    type: TraceType.LINE,
    title: 'Two lines',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [
      [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 }],
      [{ x: 0, y: 5 }, { x: 1, y: 6 }, { x: 2, y: 7 }, { x: 3, y: 8 }],
    ],
  };
  return new LineTrace(layer);
}

function cursorOf(trace: LineTrace): [number, number] {
  const state = trace.state;
  if (state.empty || state.braille.empty) {
    throw new Error('Expected a populated trace state');
  }
  return [state.braille.row, state.braille.col];
}

describe('NavigationService.moveToXValueInPoints keeps the current row', () => {
  test('an exact X match lands on the row the cursor is already on', () => {
    // A layer switch away and back calls moveToXValue with the X the reader
    // left at; resolving it to the first row would silently change series.
    const trace = twoLineTrace();
    trace.moveToIndex(1, 2);

    const moved = trace.moveToXValue(2);

    expect(moved).toBe(true);
    expect(cursorOf(trace)).toEqual([1, 2]);
  });

  test('a different X on the same row stays on that row', () => {
    const trace = twoLineTrace();
    trace.moveToIndex(1, 0);

    trace.moveToXValue(3);

    expect(cursorOf(trace)).toEqual([1, 3]);
  });

  test('falls back to another row only when the current row has no such X', () => {
    const trace = new LineTrace({
      id: 'ragged',
      type: TraceType.LINE,
      title: 'Ragged lines',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: [
        [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }],
        [{ x: 0, y: 5 }, { x: 1, y: 6 }],
      ],
    });
    trace.moveToIndex(1, 1);

    trace.moveToXValue(2);

    expect(cursorOf(trace)).toEqual([0, 2]);
  });
});
