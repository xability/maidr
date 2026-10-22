/**
 * Opening a grid cell from braille mode, and leaving it again.
 *
 * A quadrant chart or a Wardley map is read cell by cell in grid navigation,
 * and Enter steps into the cell under the reader. With braille on, the reader
 * reads the grid from the braille field, in the braille scope, and Enter was
 * bound only in the trace scope: it answered "Invalid key" and the cell stayed
 * shut. Once Enter opens it, Escape has to bring the reader back to braille,
 * not to the trace scope, which would leave the braille field showing while
 * the chart's keys, not braille's, answer it.
 */

import type { ScatterTrace } from '@model/scatter';
import type { Maidr } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/** A 2 x 2 grid with a point in its lower-left cell, as a quadrant chart draws. */
const MAIDR: Maidr = {
  id: 'grid-cell-scope',
  subplots: [[{
    layers: [{
      id: 'points',
      type: TraceType.SCATTER,
      axes: {
        x: { label: 'Reach', min: 0, max: 1, tickStep: 0.5 },
        y: { label: 'Engagement', min: 0, max: 1, tickStep: 0.5 },
      },
      data: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.9 }],
    }],
  }]],
};

/**
 * A context on the grid, in grid navigation, with the reader in `scope`.
 * @param scope - Where the reader is when they press Enter
 * @returns The context and its scatter trace
 */
function onTheGrid(scope: Scope): { context: Context; trace: ScatterTrace } {
  const context = new Context(new Figure(MAIDR));
  const trace = context.active as ScatterTrace;
  trace.setGridMode(true);
  context.toggleScope(scope);
  return { context, trace };
}

describe('a grid cell opened from braille mode', () => {
  it('binds Enter in braille mode to the same command as in the chart', () => {
    const braille = getKeymapForScope(Scope.BRAILLE);
    const trace = getKeymapForScope(Scope.TRACE);

    expect(braille.ENTER_GRID_CELL?.hotkey).toBe(trace.ENTER_GRID_CELL.hotkey);
  });

  it('goes back to braille mode when the cell is left', () => {
    const { context, trace } = onTheGrid(Scope.BRAILLE);

    expect(context.enterGridCell()).toBe(true);
    expect(context.scope).toBe(Scope.GRID_CELL);

    context.exitGridCell();

    expect(trace.isInCellMode()).toBe(false);
    expect(context.scope).toBe(Scope.BRAILLE);
  });

  it('still goes back to the chart when the cell was opened there', () => {
    const { context } = onTheGrid(Scope.TRACE);

    context.enterGridCell();
    context.exitGridCell();

    expect(context.scope).toBe(Scope.TRACE);
  });

  it('stays where the reader was when the cell is empty', () => {
    const { context, trace } = onTheGrid(Scope.BRAILLE);
    trace.moveGridRight();

    expect(context.enterGridCell()).toBe(false);

    expect(context.scope).toBe(Scope.BRAILLE);
  });
});
