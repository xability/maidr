/**
 * @jest-environment jsdom
 */

/**
 * Up and Down on a stacked area follow the stack whichever end of the list is
 * drawn on top.
 *
 * The documented order is bottom band first, but ggplot2 stacks its first
 * group on top, to match its legend, and r-maidr lists the groups in that
 * order; Highcharts draws its first series on top by default as well. Read
 * the documented way, Up on those charts moved down the drawing. Where the
 * bands' highlight markers can be measured, the trace reads which end is on
 * top from where they are drawn.
 */

import type { LinePoint, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { AreaTrace } from '@model/area';
import { TraceType } from '@type/grammar';

const QUARTERS = ['Q1', 'Q2', 'Q3'];

/**
 * One band's points.
 * @param name - The band's name
 * @param values - Its own value in each quarter
 * @returns The band's points
 */
function band(name: string, values: number[]): LinePoint[] {
  return QUARTERS.map((x, at) => ({ x, y: values[at], z: name }));
}

/** Three bands in legend order: the first is drawn at the top of the stack. */
const TOP_FIRST: LinePoint[][] = [
  band('Licences', [1, 2, 3]),
  band('Services', [5, 20, 70]),
  band('Subscriptions', [10, 20, 30]),
];

/** The same three bands listed bottom first, as the schema documents. */
const BOTTOM_FIRST: LinePoint[][] = [...TOP_FIRST].reverse();

/**
 * Draws one marker per point, each at the height given for its band's top
 * edge in that quarter, and has every marker report it.
 * @param edges - Per band, the top of its edge marker in each quarter
 * @param lefts - Per band, the left of each marker; the quarter's own
 *   position when omitted
 */
function draw(edges: number[][], lefts?: number[][]): void {
  const markers = edges.flatMap((tops, row) => tops.map((top, col) =>
    `<circle class="band${row}" data-top="${top}" data-left="${lefts?.[row][col] ?? col * 100}"></circle>`));
  document.body.innerHTML = `<svg><g>${markers.join('')}</g></svg>`;
}

/**
 * A stacked area layer whose bands are highlighted by their markers.
 * @param data - The bands, in the order the producer lists them
 * @param type - Stacked or 100% stacked, or an unstacked area
 * @param highlighted - Whether the layer names its markers at all
 * @returns The layer
 */
function layer(
  data: LinePoint[][],
  type: TraceType = TraceType.STACKED_AREA,
  highlighted = true,
): MaidrLayer {
  return {
    id: 'revenue',
    type,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data,
    ...(highlighted ? { selectors: data.map((_, row) => `.band${row}`) } : {}),
  };
}

/**
 * The band the cursor is on, as the announcement names it.
 * @param trace - The trace to read
 * @returns The band's name
 */
function bandAt(trace: AreaTrace): unknown {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text.z?.value;
}

/**
 * Whether the braille state says row 0 is drawn at the top.
 * @param trace - The trace to read
 * @returns The state's `rowsTopFirst`
 */
function rowsTopFirst(trace: AreaTrace): unknown {
  const state = trace.state;
  if (state.empty || state.braille.empty) {
    throw new Error('expected a populated braille state');
  }
  return state.braille.rowsTopFirst;
}

let measured: number;
let laidOut: boolean;

beforeEach(() => {
  measured = 0;
  laidOut = true;
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    measured++;
    const top = laidOut ? Number(this.getAttribute('data-top') ?? 0) : 0;
    const left = laidOut ? Number(this.getAttribute('data-left') ?? 0) : 0;
    const size = laidOut ? 4 : 0;
    return { top, left, height: size, width: size, right: left + size, bottom: top + size, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a stack listed top band first', () => {
  // Licences' edge is the top of the stack, Subscriptions' the lowest.
  const EDGES = [[100, 90, 80], [104, 96, 82], [150, 140, 130]];

  test('down moves to the band drawn underneath, and up from the top band stops', () => {
    draw(EDGES);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Subscriptions');
    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
  });

  test('control and up reaches the top band, control and down the bottom band', () => {
    draw(EDGES);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(1, 1);

    trace.moveToExtreme('UPWARD');
    const top = bandAt(trace);
    trace.moveToExtreme('DOWNWARD');
    const bottom = bandAt(trace);

    expect(top).toBe('Licences');
    expect(bottom).toBe('Subscriptions');
  });

  test('a 100% stacked area is read the same way', () => {
    draw(EDGES);
    const trace = new AreaTrace(layer(TOP_FIRST, TraceType.NORMALIZED_AREA));
    trace.moveToIndex(2, 2);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
  });

  test('the braille state keeps the first band, the top one, on the top line', () => {
    draw(EDGES);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 0);

    expect(rowsTopFirst(trace)).toBe(true);
  });

  test('is measured once, then remembered', () => {
    draw(EDGES);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 0);
    trace.moveOnce('DOWNWARD');
    const once = measured;
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('UPWARD');

    // The first and the last band's markers, in each of the three quarters.
    expect(once).toBe(6);
    expect(measured).toBe(once);
  });

  test('a band the highlight did not find leaves the other bands to measure', () => {
    // Licences has no markers; Services is still drawn above Subscriptions.
    draw([[], EDGES[1], EDGES[2]]);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
  });

  test('marks that are not drawn one above the other are not read', () => {
    // The highlight resolved the last band to other quarters' marks, so its
    // mark for each quarter is drawn beside the first band's, not under it.
    // They say nothing about the stack, and the list is read as documented.
    draw(EDGES, [[0, 100, 200], [0, 100, 200], [200, 0, 100]]);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 0);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
    expect(rowsTopFirst(trace)).toBeUndefined();
  });

  test('a quarter where the two edges meet does not decide it alone', () => {
    // In Q1 every band above the bottom one is empty, so the first and the
    // last band's edges are drawn at the same height there.
    draw([[150, 90, 80], [150, 96, 82], [150, 140, 130]]);
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 1);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
  });
});

describe('a stack listed bottom band first, as documented', () => {
  test('up moves to the band drawn on top, as before', () => {
    draw([[150, 140, 130], [104, 96, 82], [100, 90, 80]]);
    const trace = new AreaTrace(layer(BOTTOM_FIRST));
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
    expect(rowsTopFirst(trace)).toBeUndefined();
  });
});

describe('where there is nothing to measure, the list is read bottom band first', () => {
  test('a stack not laid out yet, measured again on the next key', () => {
    draw([[100, 90, 80], [104, 96, 82], [150, 140, 130]]);
    laidOut = false;
    const trace = new AreaTrace(layer(TOP_FIRST));
    trace.moveToIndex(0, 0);

    const beforeLayout = trace.moveOnce('UPWARD');
    const reached = bandAt(trace);
    laidOut = true;
    const afterLayout = trace.moveOnce('UPWARD');

    expect(beforeLayout).toBe(true);
    expect(reached).toBe('Services');
    expect(afterLayout).toBe(true);
    expect(bandAt(trace)).toBe('Licences');
  });

  test('a stack without a highlight', () => {
    draw([[100, 90, 80], [104, 96, 82], [150, 140, 130]]);
    const trace = new AreaTrace(layer(TOP_FIRST, TraceType.STACKED_AREA, false));
    trace.moveToIndex(0, 0);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(bandAt(trace)).toBe('Services');
    expect(measured).toBe(0);
  });

  test('an area whose bands overlap is drawn at its values and never measured', () => {
    draw([[100, 90, 80], [104, 96, 82], [150, 140, 130]]);
    const trace = new AreaTrace(layer(TOP_FIRST, TraceType.AREA));
    trace.moveToIndex(0, 0);
    trace.moveOnce('UPWARD');

    expect(rowsTopFirst(trace)).toBeUndefined();
    expect(measured).toBe(0);
  });
});
