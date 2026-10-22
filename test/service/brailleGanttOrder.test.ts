/**
 * @jest-environment jsdom
 */

/**
 * A gantt chart's lanes on a multi-line braille display run the way the chart
 * draws them, so the caret moves the way Up and Down do.
 *
 * A multi-line display puts row 0 on its bottom line, which suits the grid's
 * rule that Up moves to the next row. On a schedule drawn from the top, Down
 * moves to the next lane, and with lane 0 on the bottom line every Down moved
 * the caret up a line: a reader feeling the display was walked the opposite
 * way to the one the keys and the chart go.
 */

import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { GanttPoint, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { BrailleService } from '@service/braille';
import { Orientation, TraceType } from '@type/grammar';

/** Cells per line of the display. */
const SIZE = 32;

const LANES: GanttPoint[][] = [
  [
    { x: 'Design', start: 0, end: 10, label: 'Research' },
    { x: 'Design', start: 10, end: 25, label: 'Prototype' },
  ],
  [{ x: 'Build', start: 25, end: 45, label: 'Adapter' }],
  [{ x: 'Ship', start: 55, end: 55, label: 'Release' }],
];

const LAYER: MaidrLayer = {
  id: 'gantt',
  type: TraceType.GANTT,
  orientation: Orientation.HORIZONTAL,
  axes: { x: { label: 'Day' }, y: { label: 'Section' } },
  data: { points: LANES, unit: 'days' },
  selectors: '.task',
};

/**
 * Draws one rect per interval, each lane at the given height, and has every
 * rect -- the highlight's hidden copies included, which copy the attribute --
 * report it.
 * @param laneTops - The top of each lane, in lane order
 */
function draw(laneTops: number[]): void {
  const rects = LANES.flatMap((lane, row) => lane.map((_, col) =>
    `<rect class="task" id="t${row}${col}" data-top="${laneTops[row]}"></rect>`));
  document.body.innerHTML = `<svg>${rects.join('')}</svg>`;
}

/** Has every element report the height its `data-top` gives it. */
function layOut(): void {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = Number(this.getAttribute('data-top') ?? 0);
    return { top, height: 5, width: 10, left: 0, right: 10, bottom: top + 5, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
}

/**
 * A braille service for a display of {@link SIZE} cells by the given lines.
 * @param lines - Lines on the display
 * @returns The service, and the caret it last emitted
 */
function brailleService(lines: number): { service: BrailleService; caret: () => number } {
  const context = { moveToIndex: jest.fn() } as unknown as Context;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const display = { toggleFocus: jest.fn() } as unknown as DisplayService;
  const settings = {
    get: <T>(path: string): T => {
      if (path === 'general.brailleDisplaySize')
        return SIZE as T;
      if (path === 'general.brailleDisplayLines')
        return lines as T;
      return undefined as T;
    },
    onChange: () => ({ dispose: () => {} }),
  } as unknown as SettingsService;
  const service = new BrailleService(context, notification, display, settings);
  let caret = -1;
  service.onChange((event) => {
    caret = event.index;
  });
  return { service, caret: () => caret };
}

/**
 * An entered gantt trace whose every move the service observes.
 * @param service - The braille service
 * @returns The trace, on lane 0's first task, with braille on
 */
function entered(service: BrailleService): GanttTrace {
  const trace = new GanttTrace(LAYER);
  trace.addObserver(service);
  trace.moveOnce('FORWARD');
  service.toggle(trace.state);
  return trace;
}

let trace: GanttTrace | null = null;

beforeEach(() => {
  layOut();
});

afterEach(() => {
  trace?.dispose();
  trace = null;
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a schedule drawn with its first lane at the top', () => {
  test('keeps its first lane on the top line, and down moves the caret down', () => {
    draw([10, 30, 50]);
    const { service, caret } = brailleService(4);
    trace = entered(service);
    expect(caret()).toBe(0);

    trace.moveOnce('DOWNWARD');
    expect(caret()).toBe(SIZE);
    trace.moveOnce('DOWNWARD');
    expect(caret()).toBe(2 * SIZE);
    trace.moveOnce('UPWARD');
    expect(caret()).toBe(SIZE);
    service.dispose();
  });

  test('is laid out again once the chart can be measured', () => {
    draw([10, 30, 50]);
    // Not laid out when braille comes on: the lanes take the grid's order.
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      { top: 0, height: 0, width: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    const { service, caret } = brailleService(4);
    trace = entered(service);
    expect(caret()).toBe(2 * SIZE);

    layOut();
    trace.moveOnce('FORWARD');

    expect(caret()).toBe(1);
    service.dispose();
  });
});

describe('a schedule drawn with its first lane at the bottom', () => {
  test('keeps its first lane on the bottom line, and up moves the caret up', () => {
    draw([50, 30, 10]);
    const { service, caret } = brailleService(4);
    trace = entered(service);
    expect(caret()).toBe(2 * SIZE);

    trace.moveOnce('UPWARD');
    expect(caret()).toBe(SIZE);
    service.dispose();
  });
});

describe('a single-line display', () => {
  test('keeps the lanes in their order, the first on the first line', () => {
    draw([10, 30, 50]);
    const { service, caret } = brailleService(1);
    trace = entered(service);
    expect(caret()).toBe(0);

    trace.moveOnce('DOWNWARD');
    // Lane 0's two cells and its line's end.
    expect(caret()).toBe(3);
    service.dispose();
  });
});
