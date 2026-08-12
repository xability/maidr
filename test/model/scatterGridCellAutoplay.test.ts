import type { Scope } from '@type/event';
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { TraceType } from '@type/grammar';

/**
 * A scatter layer carrying the six axis values `resolveGridConfig` requires,
 * so the trace advertises grid mode and a cell can be entered.
 */
function gridScatterLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'grid-cell-autoplay-layer',
    type: TraceType.SCATTER,
    title: 'Grid cell autoplay',
    axes: {
      x: { label: 'X', min: 0, max: 4, tickStep: 2 },
      y: { label: 'Y', min: 0, max: 4, tickStep: 2 },
    },
    data,
  };
}

/** A trace sitting inside a cell that holds three points at distinct x. */
function traceInsideCell(): ScatterTrace {
  const trace = new ScatterTrace(gridScatterLayer([
    { x: 0.5, y: 0.5 },
    { x: 1.0, y: 0.7 },
    { x: 1.5, y: 0.9 },
    { x: 3, y: 3 },
  ]));
  trace.isInitialEntry = false;
  trace.setGridMode(true);
  expect(trace.enterGridCell()).toBe(true);
  expect(trace.getCellPointCount()).toBe(3);
  return trace;
}

describe('autoplay inside an entered grid cell', () => {
  // Autoplay drives movement through context.moveOnce / isMovable rather than
  // the cell's own commands, so both have to know the cursor is the cell's
  // point index — not the grid selection the cell sits in.

  test('moveOnce walks the cell points and bounds at the last one', () => {
    const trace = traceInsideCell();

    expect(trace.getCellPointIndex()).toBe(0);
    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.getCellPointIndex()).toBe(1);
    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.getCellPointIndex()).toBe(2);

    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(trace.getCellPointIndex()).toBe(2);
  });

  test('moveOnce leaves the grid selection alone while inside a cell', () => {
    // The defect: the grid branch ran first, so an autoplay step moved the
    // cell *selection* while the user believed they were inside one — with no
    // announcement that the context had changed under them.
    const trace = traceInsideCell();
    const before = trace.getGridPosition();

    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(trace.getGridPosition()).toEqual(before);
    expect(trace.isInCellMode()).toBe(true);
  });

  test('isMovable describes the cell, and never allows vertical movement', () => {
    const trace = traceInsideCell();

    expect(trace.isMovable('BACKWARD')).toBe(false); // at the first point
    expect(trace.isMovable('FORWARD')).toBe(true);
    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.isMovable('DOWNWARD')).toBe(false);

    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(trace.isMovable('FORWARD')).toBe(false); // at the last point
    expect(trace.isMovable('BACKWARD')).toBe(true);
  });

  test('autoplay is paced over the cell points, not the grid cells', () => {
    // AutoplayService divides its duration budget by these counts. Reporting
    // the 2x2 grid would pace a three-point sweep against two steps.
    const trace = traceInsideCell();
    const state = trace.state;
    if (state.empty || state.type !== 'trace') {
      throw new Error('expected a populated trace state');
    }

    expect(state.autoplay.FORWARD).toBe(3);
    expect(state.autoplay.BACKWARD).toBe(3);
  });

  test('the boundary chime pans at the cell cursor, not at the cell in the grid', () => {
    const trace = traceInsideCell();
    const update = jest.fn();
    trace.addObserver({ update });

    while (trace.isMovable('FORWARD')) {
      trace.moveOnce('FORWARD');
    }
    update.mockClear();

    expect(trace.moveOnce('FORWARD')).toBe(false);

    const bounds = update.mock.calls[0][0] as {
      empty: boolean;
      audio: { x: number; cols: number };
    };
    expect(bounds.empty).toBe(true);
    expect(bounds.audio.x).toBe(2); // the last point in the cell
    expect(bounds.audio.cols).toBe(3);
  });

  test('vertical movement inside a cell reports out of bounds rather than moving', () => {
    const trace = traceInsideCell();
    const update = jest.fn();
    trace.addObserver({ update });
    const before = trace.getGridPosition();

    expect(trace.moveOnce('UPWARD')).toBe(false);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ empty: true });
    expect(trace.getGridPosition()).toEqual(before);
    expect(trace.isInCellMode()).toBe(true);
  });
});

describe('grid cell keyboard scope', () => {
  test('binds autoplay, so a dense cell can be swept rather than stepped', () => {
    // Entering a cell switches the scope to GRID_CELL. A key bound only in
    // TRACE does nothing there, which is why Ctrl+Shift+arrow was silent.
    const keymap = SCOPED_KEYMAP['GRID_CELL' as Scope] as Record<string, unknown>;

    expect(keymap).toHaveProperty('AUTOPLAY_FORWARD');
    expect(keymap).toHaveProperty('AUTOPLAY_BACKWARD');
    expect(keymap).toHaveProperty('STOP_AUTOPLAY');
    expect(keymap).toHaveProperty('SPEED_UP_AUTOPLAY');
    expect(keymap).toHaveProperty('SPEED_DOWN_AUTOPLAY');
    expect(keymap).toHaveProperty('RESET_AUTOPLAY_SPEED');
  });

  test('does not bind vertical autoplay, matching the cell\'s horizontal navigation', () => {
    const keymap = SCOPED_KEYMAP['GRID_CELL' as Scope] as Record<string, unknown>;

    expect(keymap).not.toHaveProperty('AUTOPLAY_UPWARD');
    expect(keymap).not.toHaveProperty('AUTOPLAY_DOWNWARD');
  });
});
