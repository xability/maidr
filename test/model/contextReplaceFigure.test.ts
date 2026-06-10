import type { BarPoint, Maidr } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

jest.mock('hotkeys-js', () => ({
  __esModule: true,
  default: { setScope: jest.fn() },
}));

/**
 * Creates a bar layer config with the given number of points.
 * @param id - Layer identifier
 * @param size - Number of bar points
 * @returns A bar layer definition
 */
function createBarLayer(id: string, size: number): Maidr['subplots'][0][0]['layers'][0] {
  const data: BarPoint[] = Array.from({ length: size }, (_, i) => ({
    x: `cat-${i}`,
    y: i + 1,
  }));
  return {
    id,
    type: TraceType.BAR,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/**
 * Creates a single-subplot Maidr config whose subplot has one bar layer per entry in sizes.
 * @param sizes - Bar counts for each layer
 * @returns A Maidr config
 */
function createMaidr(...sizes: number[]): Maidr {
  return {
    id: 'live-test',
    subplots: [[
      { layers: sizes.map((size, i) => createBarLayer(`layer-${i}`, size)) },
    ]],
  };
}

/**
 * Creates a Maidr config with the given subplot grid of single-layer subplots.
 * @param rows - Number of subplot rows
 * @param cols - Number of subplot columns
 * @returns A Maidr config
 */
function createMultiPanelMaidr(rows: number, cols: number): Maidr {
  return {
    id: 'live-test',
    subplots: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        layers: [createBarLayer(`layer-${r}-${c}`, 3)],
      }))),
  };
}

describe('context.replaceFigure', () => {
  test('preserves the active trace position for a same-shape figure', () => {
    const context = new Context(new Figure(createMaidr(3)));
    const oldTrace = context.active;
    oldTrace.isInitialEntry = false;
    oldTrace.col = 1;

    const newFigure = new Figure(createMaidr(4));
    context.replaceFigure(newFigure);

    expect(context.active).not.toBe(oldTrace);
    expect(context.active.col).toBe(1);
    expect(context.active.isInitialEntry).toBe(false);
    expect(context.scope).toBe(Scope.TRACE);
  });

  test('clamps the restored position when the new data is shorter', () => {
    const context = new Context(new Figure(createMaidr(5)));
    context.active.isInitialEntry = false;
    context.active.col = 4;

    context.replaceFigure(new Figure(createMaidr(2)));

    expect(context.active.col).toBe(1);
  });

  test('shifts the active column by activeColShift (sliding window)', () => {
    const context = new Context(new Figure(createMaidr(5)));
    context.active.isInitialEntry = false;
    context.active.col = 2;

    context.replaceFigure(new Figure(createMaidr(5)), { activeColShift: 1 });

    expect(context.active.col).toBe(1);
  });

  test('does not shift below zero', () => {
    const context = new Context(new Figure(createMaidr(5)));
    context.active.isInitialEntry = false;
    context.active.col = 0;

    context.replaceFigure(new Figure(createMaidr(5)), { activeColShift: 1 });

    expect(context.active.col).toBe(0);
  });

  test('keeps initial-entry state when the user has not navigated yet', () => {
    const context = new Context(new Figure(createMaidr(3)));

    context.replaceFigure(new Figure(createMaidr(4)));

    expect(context.active.isInitialEntry).toBe(true);
    expect(context.active.col).toBe(0);
  });

  test('preserves the active layer for multi-layer subplots', () => {
    // Multi-layer single-subplot context: stack is [subplot, trace].
    const oldFigure = new Figure(createMaidr(3, 3));
    const context = new Context(oldFigure);

    // Simulate the user having switched to layer 1.
    oldFigure.subplots[0][0].isInitialEntry = false;
    oldFigure.subplots[0][0].row = 1;

    const newFigure = new Figure(createMaidr(3, 3));
    context.replaceFigure(newFigure);

    expect(context.active).toBe(newFigure.subplots[0][0].traces[1][0]);
  });

  test('resets navigation when the figure shape changes', () => {
    const context = new Context(new Figure(createMaidr(3)));
    context.active.isInitialEntry = false;
    context.active.col = 2;

    const multiPanel = new Figure(createMultiPanelMaidr(1, 2));
    context.replaceFigure(multiPanel);

    expect(context.active).toBe(multiPanel);
    expect(context.scope).toBe(Scope.SUBPLOT);
  });
});
