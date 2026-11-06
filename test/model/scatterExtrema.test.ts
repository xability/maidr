import type { ScatterTrace } from '@model/scatter';
import type { ExtremaTarget } from '@type/extrema';
import type { ScatterPoint, VolcanoPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Five named points. `b` and `c` share the highest y, 9, and `d` has the
 * lowest, 1.
 */
const POINTS: ScatterPoint[] = [
  { x: 1, y: 4, label: 'a' },
  { x: 2, y: 9, label: 'b' },
  { x: 3, y: 9, label: 'c' },
  { x: 4, y: 1, label: 'd' },
  { x: 5, y: 6, label: 'e' },
];

/**
 * A scatter trace, as the figure builds one.
 * @param data The points
 * @param type Scatter, or one of the plots built on it
 * @returns The trace
 */
function scatter(data: ScatterPoint[] = POINTS, type: TraceType = TraceType.SCATTER): ScatterTrace {
  return TraceFactory.create({
    id: 'points',
    type,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  }) as ScatterTrace;
}

/**
 * The targets as type, label and value, as the Go To dialog lists them.
 * @param trace The trace to read
 * @returns One triple per target
 */
function offered(trace: ScatterTrace): [string, string, number][] {
  return trace.getExtremaTargets().map(target => [target.type, target.label, target.value]);
}

/**
 * One of a trace's targets, by its place in the list.
 * @param trace The trace to read
 * @param index Which target
 * @returns The target
 */
function targetAt(trace: ScatterTrace, index: number): ExtremaTarget {
  const target = trace.getExtremaTargets()[index];
  if (target === undefined) {
    throw new Error(`Expected a target at ${index}`);
  }
  return target;
}

describe('a scatter plot\'s [ and ] go to its highest and lowest point', () => {
  test('walking columns and rows, offers the row of the highest y and the row of the lowest', () => {
    // One row holds every point at its y, so the two tied at the top are one
    // row, named by both.
    const trace = scatter();

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Max point at b, c', 9],
      ['min', 'Min point at d', 1],
    ]);
  });

  test('lands on the row, turning from columns to rows as Control + Up does', () => {
    const trace = scatter();
    trace.moveToIndex(0, 0);
    const highest = targetAt(trace, 0);

    trace.navigateToExtrema(highest);
    const { text } = trace.state as NonEmptyTraceState;

    expect(text.main.value).toBe(9);
    expect(text.mainAxis).toBe('y');
  });

  test('in point navigation, offers every point holding the extreme, in reading order', () => {
    const trace = scatter();
    trace.setPointMode(true);

    expect(offered(trace)).toEqual([
      ['max', 'Max point at b', 9],
      ['max', 'Max point at c', 9],
      ['min', 'Min point at d', 1],
    ]);
  });

  test('in point navigation, lands on the point', () => {
    const trace = scatter();
    trace.setPointMode(true);
    const second = targetAt(trace, 1);

    trace.navigateToExtrema(second);
    const { text } = trace.state as NonEmptyTraceState;

    expect([text.main.value, text.cross?.value]).toEqual([3, 9]);
    expect(trace.isAtExtremum(second)).toBe(true);
  });

  test('goes to the highest and lowest measured rows, past a point with no y', () => {
    // The rows keep a point with no y. Taken as the highest row, it was a
    // target the service drops, and ] refused though 9 was there to go to.
    const trace = scatter([{ x: 1, y: 4 }, { x: 2, y: 9 }, { x: 3, y: Number.NaN }]);

    expect(offered(trace)).toEqual([
      ['max', 'Max point at 2', 9],
      ['min', 'Min point at 1', 4],
    ]);
  });

  test('names every point of a row, named or not', () => {
    // Named by its named points alone, a row of A and an unnamed point at
    // x = 2 read as A, though ] lands on both and outlines both.
    const trace = scatter([{ x: 1, y: 9, label: 'A' }, { x: 2, y: 9 }, { x: 3, y: 1 }]);

    expect(targetAt(trace, 0).label).toBe('Max point at A, 2');
  });

  test('in point navigation, carries a point\'s raw x, so the Go To dialog formats it as the landing announces it', () => {
    // Rounded here, a point at x = 1.2345 on an axis formatted to four
    // decimals was listed at 1.23 and announced at 1.2345. A named point
    // keeps its name, which the dialog leaves as it is.
    const trace = scatter([{ x: 1.2345, y: 9 }, { x: 2, y: 9, label: 'b' }, { x: 3, y: 1 }]);
    trace.setPointMode(true);

    expect(trace.getExtremaTargets().map(target => [target.display?.x, target.xValue])).toEqual([
      ['1.2345', 1.2345],
      ['b', 2],
      ['3', 3],
    ]);
  });

  test('offers nothing in intersection navigation, whose cursor is a stack of points', () => {
    const trace = scatter();
    trace.setIntersectionMode(true);

    expect(trace.getExtremaTargets()).toEqual([]);
  });

  test('names a volcano\'s most significant point by its gene', () => {
    const genes: VolcanoPoint[] = [
      { x: -1.2, y: 3.1, label: 'BRCA1' },
      { x: 2.4, y: 11.4, label: 'TP53' },
      { x: 0.3, y: 0.6, label: 'GAPDH' },
    ];

    expect(offered(scatter(genes, TraceType.VOLCANO))).toEqual([
      ['max', 'Max point at TP53', 11.4],
      ['min', 'Min point at GAPDH', 0.6],
    ]);
  });
});
