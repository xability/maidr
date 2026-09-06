import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Ctrl+Arrow is bound whatever rotor mode is active. Inside point or grid
 * mode the extreme has to be taken within that mode: jumping the base row /
 * column cursor instead re-announces the unchanged point and leaves the
 * reader somewhere else, unannounced, the moment they leave the mode.
 */
function scatterLayer(data: ScatterPoint[], withGrid = false): MaidrLayer {
  return {
    id: 'scatter',
    type: TraceType.SCATTER,
    title: 'Scatter',
    axes: withGrid
      ? { x: { label: 'X', min: 0, max: 4, tickStep: 2 }, y: { label: 'Y', min: 0, max: 4, tickStep: 2 } }
      : { x: { label: 'X' }, y: { label: 'Y' } },
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

/** A trace sitting in point mode on its entry point. */
function inPointMode(): ScatterTrace {
  const trace = new ScatterTrace(scatterLayer([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]));
  trace.isInitialEntry = false;
  trace.setPointMode(true);
  return trace;
}

/** Walks a stepper to its bound and reports the point it ends on. */
function walkToEnd(trace: ScatterTrace, step: (t: ScatterTrace) => boolean): unknown {
  while (step(trace)) {
    // Keep stepping; the stepper reports the bound by returning false.
  }
  return textOf(trace).main.value;
}

describe('an extreme jump in point mode', () => {
  test('lands where walking right would end, and leaves the base cursor alone', () => {
    const end = walkToEnd(inPointMode(), t => t.movePointRight());
    const trace = inPointMode();
    const baseRow = trace.row;
    const baseCol = trace.col;

    const moved = trace.moveToExtreme('FORWARD');

    expect(moved).toBe(true);
    expect(textOf(trace).main.value).toBe(end);
    expect(trace.row).toBe(baseRow);
    expect(trace.col).toBe(baseCol);
  });

  test('lands where walking left would end', () => {
    const end = walkToEnd(inPointMode(), t => t.movePointLeft());
    const trace = inPointMode();
    trace.movePointRight();

    expect(trace.moveToExtreme('BACKWARD')).toBe(true);
    expect(textOf(trace).main.value).toBe(end);
  });

  test('lands where walking down would end', () => {
    const end = walkToEnd(inPointMode(), t => t.movePointDown());
    const trace = inPointMode();

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(textOf(trace).main.value).toBe(end);
  });
});

describe('an extreme jump in grid mode', () => {
  test('reaches the last cell column and leaves the base cursor alone', () => {
    const trace = new ScatterTrace(scatterLayer([{ x: 0.5, y: 0.5 }, { x: 3, y: 3 }], true));
    trace.isInitialEntry = false;
    trace.setGridMode(true);

    const moved = trace.moveToExtreme('FORWARD');

    expect(moved).toBe(true);
    expect(trace.getGridPosition()).toEqual({ row: 1, col: 2 });
    trace.setGridMode(false);
    expect(textOf(trace).main.value).toBe(0.5);
  });

  test('reaches the top cell row', () => {
    const trace = new ScatterTrace(scatterLayer([{ x: 0.5, y: 0.5 }, { x: 3, y: 3 }], true));
    trace.isInitialEntry = false;
    trace.setGridMode(true);

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(trace.getGridPosition()).toEqual({ row: 2, col: 1 });
  });
});
