/**
 * @jest-environment jsdom
 */

/**
 * On a chart drawn on its side the arrow keys follow the drawing (#1482).
 *
 * A horizontal bar chart lists its categories as the columns of its grid,
 * and drew them down the page while Right and Left stepped the columns: Right
 * moved down the page and Up said "No more data to display". A horizontal box
 * plot or violin already moved the other way, with Up and Down between the
 * boxes, so a reader who had learned one had the other the wrong way round.
 */

import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/** Four endpoints of a dot plot, slowest first, as the core example lists them. */
const ENDPOINTS: [string, number][] = [['/search', 412], ['/checkout', 318], ['/profile', 214], ['/health', 96]];

/**
 * Draws one circle per endpoint, each at the given height, and has every
 * circle -- the highlight's hidden copies included, which copy the attribute
 * -- report it.
 * @param tops - Each endpoint's distance from the top of the page
 */
function draw(tops: number[]): void {
  const marks = tops.map((top, index) => `<circle class="dot" id="d${index}" data-top="${top}"></circle>`);
  document.body.innerHTML = `<svg>${marks.join('')}</svg>`;
}

/**
 * The dot plot, drawn the given way.
 * @param orientation - Which way its magnitudes run
 * @param selectors - Its marks, or none for a chart with nothing to measure
 * @returns The trace
 */
function dots(orientation = Orientation.HORIZONTAL, selectors: string | null = '.dot'): AbstractTrace {
  const horizontal = orientation === Orientation.HORIZONTAL;
  const layer: MaidrLayer = {
    id: 'dots',
    type: TraceType.DOT,
    orientation,
    axes: horizontal
      ? { x: { label: 'Milliseconds' }, y: { label: 'Endpoint' } }
      : { x: { label: 'Endpoint' }, y: { label: 'Milliseconds' } },
    data: ENDPOINTS.map(([endpoint, ms]) => (horizontal ? { x: ms, y: endpoint } : { x: endpoint, y: ms })),
    ...(selectors === null ? {} : { selectors }),
  };
  return TraceFactory.create(layer) as AbstractTrace;
}

/**
 * What the reader is told the cursor is on: the category, then the value.
 * @param trace - The trace
 * @returns The two
 */
function at(trace: AbstractTrace): unknown[] {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return [state.text.main.value, state.text.cross?.value];
}

beforeEach(() => {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = Number(this.getAttribute('data-top') ?? 0);
    return { top, height: 6, width: 6, left: 0, right: 6, bottom: top + 6, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a horizontal chart drawn with its first category at the top', () => {
  test('down moves to the category drawn below, and up comes back', () => {
    draw([10, 30, 50, 70]);
    const trace = dots();
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual(['/checkout', 318]);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual(['/profile', 214]);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual(['/checkout', 318]);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual(['/search', 412]);
  });

  test('up from the top category is the edge, as right from the last bar of a vertical chart is', () => {
    draw([10, 30, 50, 70]);
    const trace = dots();
    trace.moveOnce('FORWARD');

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(at(trace)).toEqual(['/search', 412]);
  });

  test('control + down and up go to the bottom and the top category', () => {
    draw([10, 30, 50, 70]);
    const trace = dots();
    trace.moveOnce('FORWARD');

    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual(['/health', 96]);
    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(at(trace)).toEqual(['/search', 412]);
  });

  test('left and right move along the category, which holds one value here', () => {
    // Right moved down the page to /checkout.
    draw([10, 30, 50, 70]);
    const trace = dots();
    trace.moveOnce('FORWARD');

    expect(trace.isMovable('FORWARD')).toBe(false);
    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(trace.moveOnce('BACKWARD')).toBe(false);
    expect(at(trace)).toEqual(['/search', 412]);
  });

  test('the rotor\'s value search runs down the page with Down', () => {
    draw([10, 30, 50, 70]);
    const trace = dots();
    trace.moveOnce('FORWARD');

    expect(trace.moveDownRotor('lower')).toBe(true);
    expect(at(trace)).toEqual(['/checkout', 318]);
    expect(trace.moveUpRotor('higher')).toBe(true);
    expect(at(trace)).toEqual(['/search', 412]);
  });
});

describe('a horizontal chart drawn with its first category at the bottom', () => {
  test('up moves to the category drawn above', () => {
    // matplotlib's barh, ggplot2 and base R draw the first category lowest.
    draw([70, 50, 30, 10]);
    const trace = dots();
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual(['/checkout', 318]);
    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(at(trace)).toEqual(['/health', 96]);
  });
});

describe('a horizontal chart with nothing to measure', () => {
  test('takes its first category to be at the bottom, as row 0 of a grid is', () => {
    const trace = dots(Orientation.HORIZONTAL, null);
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual(['/checkout', 318]);
    expect(trace.moveOnce('FORWARD')).toBe(false);
  });
});

describe('a vertical chart', () => {
  test('keeps its keys: right moves between the categories, up has nowhere to go', () => {
    draw([10, 10, 10, 10]);
    const trace = dots(Orientation.VERTICAL);
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(at(trace)).toEqual(['/checkout', 318]);
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });
});

describe('the other traces drawn on their side', () => {
  test('a horizontal stacked bar: up and down between the bars, left and right along the stack', () => {
    const trace = TraceFactory.create({
      id: 'stack',
      type: TraceType.STACKED,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Hours' }, y: { label: 'Day' } },
      data: [
        [{ x: 3, y: 'Mon', z: 'Work' }, { x: 4, y: 'Tue', z: 'Work' }],
        [{ x: 5, y: 'Mon', z: 'Sleep' }, { x: 6, y: 'Tue', z: 'Sleep' }],
      ],
    } as MaidrLayer) as AbstractTrace;
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([1, 0]);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([1, 1]);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([0, 1]);
  });

  test('a horizontal dumbbell: up and down between the countries, left and right between the ends', () => {
    const trace = TraceFactory.create({
      id: 'gains',
      type: TraceType.DUMBBELL,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Years' }, y: { label: 'Country' } },
      data: {
        points: [{ x: 'Norway', start: 70, end: 82 }, { x: 'Kenya', start: 50, end: 66 }],
        startLabel: '1990',
        endLabel: '2020',
      },
    }) as AbstractTrace;
    trace.moveOnce('FORWARD');

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([1, 0]);
    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([1, 1]);
  });

  test('a horizontal forest plot: up and down between the studies, left and right along the interval', () => {
    const trace = TraceFactory.create({
      id: 'forest',
      type: TraceType.FOREST,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Odds ratio' }, y: { label: 'Study' } },
      data: [
        { x: 'Alpha', y: 1.2, yMin: 0.9, yMax: 1.6 },
        { x: 'Beta', y: 0.8, yMin: 0.5, yMax: 1.1 },
      ],
    } as MaidrLayer) as AbstractTrace;
    // Entered on the estimate, as on a vertical forest plot.
    trace.moveOnce('FORWARD');
    expect([trace.row, trace.col]).toEqual([1, 0]);

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([2, 0]);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([0, 0]);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect([trace.row, trace.col]).toEqual([0, 1]);
  });
});
