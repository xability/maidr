/**
 * @jest-environment jsdom
 */

/**
 * A host can land the reader on a mark it chose.
 *
 * `Context.navigateTo` is the inbound counterpart of `NavigateCallback`: a
 * Tableau mark a sighted colleague clicked, or a canvas hit-test, comes back
 * as a `{layerId, row, col}` or `{layerId, pointIndex}` and the cursor goes
 * there -- into another subplot or another layer if that is where the mark
 * is -- with one announcement, from the trace the reader lands on. Nothing
 * else in the figure speaks on the way through, and a target that cannot be
 * reached moves nothing at all.
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * A bar layer with three categories.
 * @param id The layer id
 * @returns The layer
 */
function barLayer(id: string): MaidrLayer {
  return {
    id,
    type: TraceType.BAR,
    data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }, { x: 'C', y: 3 }],
  };
}

/**
 * A figure of `panels` single-layer bar subplots, laid out as one column.
 * @param panels How many subplots the figure holds
 * @returns The MAIDR payload
 */
function createPanels(panels: number): Maidr {
  return {
    id: 'navigate-test',
    subplots: Array.from({ length: panels }, (_, index) => [{
      layers: [barLayer(String(index))],
    }]),
  };
}

/**
 * A figure laid out the way the controller lays one out, so a lobby state can
 * be built without complaint.
 * @param maidr The payload
 * @returns The figure
 */
function laidOut(maidr: Maidr): Figure {
  const figure = new Figure(maidr);
  figure.applyLayout(resolveSubplotLayout(figure.subplots));
  return figure;
}

/**
 * Records every state a trace announces.
 * @returns The observer and the states it saw
 */
function recorder(): { observer: Observer<TraceState>; states: TraceState[] } {
  const states: TraceState[] = [];
  const observer: Observer<TraceState> = {
    update: (state: TraceState): void => {
      states.push(state);
    },
  };
  return { observer, states };
}

/**
 * The trace at a layer of a subplot.
 * @param figure The figure
 * @param subplotRow The subplot's row
 * @param layerIndex The layer within it
 * @returns The trace
 */
function traceAt(figure: Figure, subplotRow: number, layerIndex = 0) {
  return figure.subplots[subplotRow][0].traces[layerIndex][0];
}

/**
 * The braille cell a non-empty trace state reports.
 * @param state The state
 * @returns Its row and column
 */
function cellOf(state: TraceState): { row: number; col: number } {
  if (state.empty || state.braille.empty) {
    throw new Error('expected a populated state');
  }
  return { row: state.braille.row, col: state.braille.col };
}

describe('Context.navigateTo', () => {
  describe('on a single-panel figure', () => {
    it('lands on the cell and announces it exactly once', () => {
      const figure = laidOut(createPanels(1));
      const context = new Context(figure);
      const { observer, states } = recorder();
      traceAt(figure, 0).addObserver(observer);

      expect(context.navigateTo({ layerId: '0', row: 0, col: 2 })).toBe(true);

      expect(states.map(cellOf)).toEqual([{ row: 0, col: 2 }]);
      expect(context.activeLevel).toBe('trace');
    });

    it('moves nothing for a layer the figure does not have', () => {
      const figure = laidOut(createPanels(1));
      const context = new Context(figure);
      const { observer, states } = recorder();
      traceAt(figure, 0).addObserver(observer);

      expect(context.navigateTo({ layerId: 'elsewhere', row: 0, col: 1 })).toBe(false);

      expect(states).toEqual([]);
    });

    it('moves nothing, and sounds no boundary, for a cell off the grid', () => {
      const figure = laidOut(createPanels(1));
      const context = new Context(figure);
      const { observer, states } = recorder();
      traceAt(figure, 0).addObserver(observer);

      expect(context.navigateTo({ layerId: '0', row: 0, col: 3 })).toBe(false);
      expect(context.navigateTo({ layerId: '0', row: 1, col: 0 })).toBe(false);

      // A refusal is not an out-of-bounds move: the reader did not press
      // anything, so there is nothing to warn them about.
      expect(states).toEqual([]);
    });

    it('refuses a point index on a trace that is not a point cloud', () => {
      const figure = laidOut(createPanels(1));
      const context = new Context(figure);

      expect(context.navigateTo({ layerId: '0', pointIndex: 1 })).toBe(false);
    });
  });

  describe('across the panels of a multi-panel figure', () => {
    it('enters the target subplot from the lobby without announcing the lobby', () => {
      const figure = laidOut(createPanels(3));
      const context = new Context(figure);
      const figureStates: unknown[] = [];
      figure.addObserver({
        update: (state): void => {
          figureStates.push(state);
        },
      });
      const { observer, states } = recorder();
      traceAt(figure, 2).addObserver(observer);
      const scopes: Scope[] = [];
      context.onScopeChange(scope => scopes.push(scope));
      expect(context.activeLevel).toBe('figure');

      expect(context.navigateTo({ layerId: '2', row: 0, col: 1 })).toBe(true);

      expect(states.map(cellOf)).toEqual([{ row: 0, col: 1 }]);
      expect(figureStates).toEqual([]);
      expect(figure.activeSubplot).toBe(figure.subplots[2][0]);
      expect(context.activeLevel).toBe('trace');
      expect(context.scope).toBe(Scope.TRACE);
      expect(scopes).toEqual([Scope.TRACE]);
    });

    it('leaves one subplot for another and keeps the stack deep enough to leave again', () => {
      const figure = laidOut(createPanels(2));
      const context = new Context(figure);
      expect(context.enterSubplot()).toBe(true);
      expect(figure.activeSubplot).toBe(figure.subplots[0][0]);
      const { observer: first, states: firstStates } = recorder();
      traceAt(figure, 0).addObserver(first);
      const { observer: second, states: secondStates } = recorder();
      traceAt(figure, 1).addObserver(second);

      expect(context.navigateTo({ layerId: '1', row: 0, col: 0 })).toBe(true);

      expect(firstStates).toEqual([]);
      expect(secondStates.map(cellOf)).toEqual([{ row: 0, col: 0 }]);
      expect(figure.activeSubplot).toBe(figure.subplots[1][0]);

      // The stack was rebuilt as `enterSubplot` builds it, so Escape still
      // returns the reader to the lobby.
      context.exitSubplot();
      expect(context.activeLevel).toBe('figure');
    });

    it('stays put when the target is in the subplot the reader is already in', () => {
      const figure = laidOut(createPanels(2));
      const context = new Context(figure);
      context.enterSubplot();
      const { observer, states } = recorder();
      traceAt(figure, 0).addObserver(observer);
      const scopes: Scope[] = [];
      context.onScopeChange(scope => scopes.push(scope));

      expect(context.navigateTo({ layerId: '0', row: 0, col: 2 })).toBe(true);

      expect(states.map(cellOf)).toEqual([{ row: 0, col: 2 }]);
      // No re-entry, so no scope change to disturb a mode the reader is in.
      expect(scopes).toEqual([]);
    });
  });

  describe('across the layers of a subplot', () => {
    const layered: Maidr = {
      id: 'layered',
      subplots: [[{
        layers: [
          barLayer('bars'),
          {
            id: 'line',
            type: TraceType.LINE,
            data: [[{ x: 'A', y: 5 }, { x: 'B', y: 6 }, { x: 'C', y: 7 }]],
          },
        ],
      }]],
    };

    it('switches to the target layer silently and announces from it', () => {
      const figure = laidOut(layered);
      const context = new Context(figure);
      const { observer: bars, states: barStates } = recorder();
      traceAt(figure, 0, 0).addObserver(bars);
      const { observer: line, states: lineStates } = recorder();
      traceAt(figure, 0, 1).addObserver(line);
      expect(figure.activeSubplot.activeLayerIndex).toBe(0);

      expect(context.navigateTo({ layerId: 'line', row: 0, col: 1 })).toBe(true);

      expect(figure.activeSubplot.activeLayerIndex).toBe(1);
      expect(barStates).toEqual([]);
      expect(lineStates.map(cellOf)).toEqual([{ row: 0, col: 1 }]);
      expect(context.active).toBe(traceAt(figure, 0, 1));
    });

    it('leaves the layer alone when the target cell is off that layer', () => {
      const figure = laidOut(layered);
      const context = new Context(figure);

      expect(context.navigateTo({ layerId: 'line', row: 1, col: 0 })).toBe(false);

      expect(figure.activeSubplot.activeLayerIndex).toBe(0);
    });
  });

  describe('on a point cloud', () => {
    const cloud: Maidr = {
      id: 'cloud',
      subplots: [[{
        layers: [{
          id: 'dots',
          type: TraceType.SCATTER,
          data: [{ x: 3, y: 30 }, { x: 1, y: 10 }, { x: 2, y: 20 }],
        }],
      }]],
    };

    it('translates a data index into the column that point sits in', () => {
      const figure = laidOut(cloud);
      const context = new Context(figure);
      const trace = traceAt(figure, 0);
      const { observer, states } = recorder();
      trace.addObserver(observer);

      // Data index 0 is x = 3, which the scatter sorts to its last column.
      expect(context.navigateTo({ layerId: 'dots', pointIndex: 0 })).toBe(true);

      expect(states).toHaveLength(1);
      const highlighted = (trace as unknown as { highlightedPointIndices: readonly number[] })
        .highlightedPointIndices;
      expect(highlighted).toEqual([0]);
    });

    it('refuses a data index the layer does not have', () => {
      const figure = laidOut(cloud);
      const context = new Context(figure);
      const { observer, states } = recorder();
      traceAt(figure, 0).addObserver(observer);

      expect(context.navigateTo({ layerId: 'dots', pointIndex: 3 })).toBe(false);

      expect(states).toEqual([]);
    });
  });

  it('answers whether a target can be reached without moving anything', () => {
    const figure = laidOut(createPanels(2));
    const context = new Context(figure);
    const { observer, states } = recorder();
    traceAt(figure, 1).addObserver(observer);

    expect(context.canNavigateTo({ layerId: '1', row: 0, col: 2 })).toBe(true);
    expect(context.canNavigateTo({ layerId: '1', row: 0, col: 3 })).toBe(false);
    expect(context.canNavigateTo({ layerId: 'elsewhere', row: 0, col: 0 })).toBe(false);
    expect(context.canNavigateTo({ layerId: '1', pointIndex: 0 })).toBe(false);

    expect(states).toEqual([]);
    expect(context.activeLevel).toBe('figure');
    expect(figure.activeSubplot).toBe(figure.subplots[0][0]);
  });

  it('is refused while a virtual layer is on top of the stack', () => {
    const figure = laidOut(createPanels(1));
    const context = new Context(figure);
    const real = traceAt(figure, 0);
    const virtual = Object.create(real) as typeof real;
    const swapped = context.swapActiveTrace(virtual);
    expect(swapped).toBe(real);
    const move = jest.spyOn(real, 'moveToIndex');

    expect(context.navigateTo({ layerId: '0', row: 0, col: 1 })).toBe(false);

    expect(move).not.toHaveBeenCalled();
    expect(context.active).toBe(virtual);
  });
});
