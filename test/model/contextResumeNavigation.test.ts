import type { BarPoint, LinePoint, Maidr } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/**
 * A single bar layer with the given number of bars.
 * @param size - Number of bars
 * @returns A Maidr config
 */
function barChart(size: number): Maidr {
  const data: BarPoint[] = Array.from({ length: size }, (_, i) => ({ x: `cat-${i}`, y: i + 1 }));
  return {
    id: 'resume-test',
    subplots: [[{ layers: [{ id: 'bar', type: TraceType.BAR, axes: { x: { label: 'X' }, y: { label: 'Y' } }, data }] }]],
  };
}

/**
 * A single line layer, the same size as {@link barChart} but another shape.
 * @returns A Maidr config
 */
function lineChart(): Maidr {
  const data: LinePoint[][] = [[{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }]];
  return {
    id: 'resume-test',
    subplots: [[{ layers: [{ id: 'line', type: TraceType.LINE, axes: { x: { label: 'X' }, y: { label: 'Y' } }, data }] }]],
  };
}

describe('context.resumeNavigation', () => {
  test('puts a fresh context back on the point the old one was on', () => {
    const before = new Context(new Figure(barChart(3)));
    before.active.isInitialEntry = false;
    before.active.col = 2;
    const snapshot = before.captureNavigation()!;

    const after = new Context(new Figure(barChart(3)));
    expect(after.resumeNavigation(snapshot)).toBe(true);

    expect(after.active.col).toBe(2);
    expect(after.active.isInitialEntry).toBe(false);
    expect(after.scope).toBe(Scope.TRACE);
  });

  test('leaves a figure whose shape changed as it was constructed', () => {
    const before = new Context(new Figure(barChart(3)));
    before.active.isInitialEntry = false;
    before.active.col = 2;
    const snapshot = before.captureNavigation()!;

    const after = new Context(new Figure(lineChart()));
    const active = after.active;
    expect(after.resumeNavigation(snapshot)).toBe(false);

    expect(after.active).toBe(active);
    expect(after.active.col).toBe(0);
    expect(after.active.isInitialEntry).toBe(true);
  });
});
