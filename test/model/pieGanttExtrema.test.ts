import type { Context } from '@model/context';
import type { GanttPoint, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { PieTrace } from '@model/pie';
import { GoToExtremaService } from '@service/goToExtrema';
import { PieDirection, TraceType } from '@type/grammar';

/**
 * `[`, `]` and `g` on a pie and a gantt chart, Mermaid's packet diagram among
 * them. Both charts have a smallest and a largest slice or task, and the
 * description names them, yet `[` said "No minimum value to go to in this
 * layer" and `g` did nothing.
 */

/** The real service over a stub context, as goToExtremeValue.test.ts builds it. */
function serviceFor(active: { state: TraceState }): GoToExtremaService {
  const context = {
    get active() {
      return active;
    },
    get state() {
      return active.state;
    },
  } as unknown as Context;
  return new GoToExtremaService(context, { toggleFocus: (): void => {} } as never);
}

function mainValue(trace: { state: TraceState }): unknown {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state.text.main.value;
}

const ANIMALS = ['Dogs', 'Cats', 'Rats', 'Birds'];

function pieLayer(values: (number | null)[]): MaidrLayer {
  return {
    id: 'pie',
    type: TraceType.PIE,
    axes: { x: { label: 'Animal' }, y: { label: 'Count' } },
    data: values.map((y, index) => ({ x: ANIMALS[index] ?? `S${index}`, y: y as number })),
  };
}

describe('a pie', () => {
  test('offers its extrema', () => {
    expect(new PieTrace(pieLayer([386, 85, 30, 15])).supportsExtremaNavigation()).toBe(true);
  });

  test('[ lands on the smallest slice and ] on the largest', () => {
    const trace = new PieTrace(pieLayer([386, 85, 30, 15]));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
    expect(mainValue(trace)).toBe('Birds');
    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect(mainValue(trace)).toBe('Dogs');
  });

  test('walks tied slices in order, and never offers a gap', () => {
    const trace = new PieTrace(pieLayer([10, null, 30, 10]));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
    expect(trace.col).toBe(0);
    expect(service.goToExtremeValue('min')).toEqual({ position: 2, total: 2 });
    expect(trace.col).toBe(3);
  });

  test('a one-slice pie still has a minimum', () => {
    const service = serviceFor(new PieTrace(pieLayer([100])));

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
  });

  test('a pie of nothing but gaps has none, so [ still says so', () => {
    const trace = new PieTrace(pieLayer([null, null]));

    expect(trace.getExtremaTargets()).toEqual([]);
    expect(serviceFor(trace).goToExtremeValue('min')).toBeNull();
  });

  test('a counterclockwise pie lands on the slice, wherever the walk puts it', () => {
    const trace = new PieTrace({ ...pieLayer([386, 85, 30, 15]), direction: PieDirection.COUNTERCLOCKWISE });

    serviceFor(trace).goToExtremeValue('max');

    expect(mainValue(trace)).toBe('Dogs');
  });

  test('names each target for the dialog', () => {
    const labels = new PieTrace(pieLayer([386, 85, 30, 15])).getExtremaTargets().map(target => target.label);

    expect(labels).toEqual(['Largest slice at Dogs', 'Smallest slice at Birds']);
  });

  test('a disposed pie offers nothing', () => {
    const trace = new PieTrace(pieLayer([386, 85]));
    trace.dispose();

    expect(trace.getExtremaTargets()).toEqual([]);
  });
});

function ganttLayer(points: GanttPoint[][]): MaidrLayer {
  return {
    id: 'gantt',
    type: TraceType.GANTT,
    axes: { x: { label: 'Day' }, y: { label: 'Section' } },
    data: { points, unit: 'days' },
  };
}

/** Mermaid's example: Design, Build and Ship, ending on a zero-length milestone. */
const SCHEDULE: GanttPoint[][] = [
  [
    { x: 'Design', start: 0, end: 10, label: 'Research' },
    { x: 'Design', start: 10, end: 25, label: 'Prototype' },
  ],
  [
    { x: 'Build', start: 25, end: 45, label: 'Adapter' },
    { x: 'Build', start: 45, end: 55, label: 'Tests' },
  ],
  [{ x: 'Ship', start: 55, end: 55, label: 'Release' }],
];

describe('a gantt chart', () => {
  test('offers its extrema', () => {
    expect(new GanttTrace(ganttLayer(SCHEDULE)).supportsExtremaNavigation()).toBe(true);
  });

  test('] lands on the longest task and [ on the shortest, a milestone', () => {
    const trace = new GanttTrace(ganttLayer(SCHEDULE));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect([trace.row, trace.col]).toEqual([1, 0]);
    expect(mainValue(trace)).toBe('Build, Adapter');
    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
    expect([trace.row, trace.col]).toEqual([2, 0]);
  });

  test('walks a tie across lanes, past an empty lane and an unparsed length', () => {
    const trace = new GanttTrace(ganttLayer([
      [{ x: 'A', start: 0, end: 5 }, { x: 'A', start: 5, end: Number.NaN }],
      [],
      [{ x: 'C', start: 0, end: 5 }],
    ]));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 2 });
    expect([trace.row, trace.col]).toEqual([0, 0]);
    expect(service.goToExtremeValue('max')).toEqual({ position: 2, total: 2 });
    expect([trace.row, trace.col]).toEqual([2, 0]);
  });

  test('a schedule with no measured length has none', () => {
    const trace = new GanttTrace(ganttLayer([[{ x: 'A', start: Number.NaN, end: 5 }]]));

    expect(trace.getExtremaTargets()).toEqual([]);
    expect(serviceFor(trace).goToExtremeValue('max')).toBeNull();
  });

  test('names each target by its task for the dialog', () => {
    const labels = new GanttTrace(ganttLayer(SCHEDULE)).getExtremaTargets().map(target => target.label);

    expect(labels).toEqual(['Longest interval at Build, Adapter', 'Shortest interval at Ship, Release']);
  });
});
