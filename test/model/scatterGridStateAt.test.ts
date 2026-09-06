import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * A live-data append is announced through `getStateAt(row, col)`, which reads
 * the state positionally. Grid mode reshapes every getter onto the grid
 * cursor, so unless it is suspended for the read the monitor announces the
 * cell the reader is sitting on instead of the point that just arrived.
 */
function gridLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'grid-scatter',
    type: TraceType.SCATTER,
    title: 'Scatter',
    axes: {
      x: { label: 'X', min: 0, max: 4, tickStep: 2 },
      y: { label: 'Y', min: 0, max: 4, tickStep: 2 },
    },
    data,
  };
}

function textAt(trace: ScatterTrace, row: number, col: number): TextState {
  const state = trace.getStateAt(row, col);
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text;
}

describe('reading a position while grid mode is active', () => {
  test('answers for that position rather than for the current cell', () => {
    const trace = new ScatterTrace(gridLayer([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]));
    trace.isInitialEntry = false;
    trace.setGridMode(true);

    const text = textAt(trace, 0, 2);

    expect(text.main.value).toBe(3);
    expect(text.gridPosition).toBeUndefined();
  });

  test('restores grid mode once the read is over', () => {
    const trace = new ScatterTrace(gridLayer([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]));
    trace.isInitialEntry = false;
    trace.setGridMode(true);

    textAt(trace, 0, 2);
    const state = trace.state;

    expect(state.empty).toBe(false);
    expect(!state.empty && state.text.range).toBeDefined();
  });
});
