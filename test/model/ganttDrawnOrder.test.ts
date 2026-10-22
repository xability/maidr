/**
 * @jest-environment jsdom
 */

/**
 * Up and Down on a gantt chart follow the drawing.
 *
 * The grid underneath puts row 0 at the bottom, but nearly every producer --
 * Mermaid's sections and packet rows, ApexCharts, Plotly, Highcharts,
 * Vega-Lite -- lists a schedule's lanes from the top. There Up walked down the
 * drawing, and Down from the first lane said "No more data to display" with
 * the rest of the schedule below it.
 */

import type { GanttPoint, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { Orientation, TraceType } from '@type/grammar';

const LANES: GanttPoint[][] = [
  [
    { x: 'Design', start: 0, end: 10, label: 'Research' },
    { x: 'Design', start: 10, end: 25, label: 'Prototype' },
  ],
  [{ x: 'Build', start: 25, end: 45, label: 'Adapter' }],
  [{ x: 'Ship', start: 55, end: 55, label: 'Release' }],
];

/**
 * Draws one rect per interval, each lane at the given height, and has every
 * rect -- the highlight's hidden copies included, which copy the attribute --
 * report it.
 */
function draw(laneTops: number[]): void {
  const rects = LANES.flatMap((lane, row) => lane.map((_, col) =>
    `<rect class="task" id="t${row}${col}" data-top="${laneTops[row]}"></rect>`));
  document.body.innerHTML = `<svg>${rects.join('')}</svg>`;
}

/** Null rather than undefined for no selectors, since undefined selects the default. */
function layer(orientation = Orientation.HORIZONTAL, selectors: string | null = '.task'): MaidrLayer {
  return {
    id: 'gantt',
    type: TraceType.GANTT,
    orientation,
    axes: { x: { label: 'Day' }, y: { label: 'Section' } },
    data: { points: LANES, unit: 'days' },
    ...(selectors === null ? {} : { selectors }),
  };
}

function lane(trace: GanttTrace): unknown {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state.text.main.value;
}

let measured: number;

beforeEach(() => {
  measured = 0;
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    measured++;
    const top = Number(this.getAttribute('data-top') ?? 0);
    return { top, height: 5, width: 10, left: 0, right: 10, bottom: top + 5, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a schedule drawn with its first lane at the top', () => {
  test('down moves to the lane drawn below, and up comes back', () => {
    draw([10, 30, 50]);
    const trace = new GanttTrace(layer());
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(lane(trace)).toBe('Build, Adapter');
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(lane(trace)).toBe('Ship, Release');
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(lane(trace)).toBe('Build, Adapter');
  });

  test('up from the top lane is the boundary, and down from it is not', () => {
    draw([10, 30, 50]);
    const trace = new GanttTrace(layer());
    trace.moveOnce('FORWARD');

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.isMovable('DOWNWARD')).toBe(true);
  });

  test('control and down reaches the bottom lane, control and up the top', () => {
    draw([10, 30, 50]);
    const trace = new GanttTrace(layer());
    trace.moveOnce('FORWARD');

    trace.moveToExtreme('DOWNWARD');
    expect(trace.row).toBe(2);
    trace.moveToExtreme('UPWARD');
    expect(trace.row).toBe(0);
  });

  test('is measured once, then remembered', () => {
    draw([10, 30, 50]);
    const trace = new GanttTrace(layer());
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('UPWARD');

    // The first and last lanes' copies, once.
    expect(measured).toBe(2);
  });
});

describe('a schedule drawn with its first lane at the bottom', () => {
  test('up moves to the next lane, as it always has', () => {
    draw([50, 30, 10]);
    const trace = new GanttTrace(layer());
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(lane(trace)).toBe('Build, Adapter');
  });
});

describe('where there is nothing to measure, the grid keeps its rule', () => {
  test('a schedule without a highlight', () => {
    draw([10, 30, 50]);
    const trace = new GanttTrace(layer(Orientation.HORIZONTAL, null));
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.row).toBe(1);
  });

  test('a schedule drawn the default way up, its lanes side by side', () => {
    draw([10, 30, 50]);
    const trace = new GanttTrace(layer(Orientation.VERTICAL));
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.row).toBe(1);
  });

  test('a schedule not laid out yet, measured again on the next key', () => {
    draw([0, 0, 0]);
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      { top: 0, height: 0, width: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    const trace = new GanttTrace(layer());
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.row).toBe(1);
  });
});
