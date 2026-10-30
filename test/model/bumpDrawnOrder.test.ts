/**
 * @jest-environment jsdom
 */

/**
 * Where a bump layer does not say which end of the chart first place is drawn
 * at, it is read from the drawing.
 *
 * A bump chart is usually drawn with first place at the top, but not always:
 * Frappe cannot reverse an axis, and a chart on an ordinary rank axis draws
 * first place at the bottom. Assuming the top for every layer that does not
 * say would turn such a chart over. So the marks the highlight resolves are
 * measured: within one competitor's line, its best place drawn above its worst
 * means first place is at the top. With nothing to measure, the line's own
 * rule is kept.
 */

import type { LinePoint, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { BumpTrace } from '@model/bump';
import { TraceType } from '@type/grammar';

/** Three competitors over two rounds; Cedar's place does not change. */
const TABLE: LinePoint[][] = [
  [{ x: 'R1', y: 1, z: 'Ash' }, { x: 'R2', y: 2, z: 'Ash' }],
  [{ x: 'R1', y: 2, z: 'Birch' }, { x: 'R2', y: 1, z: 'Birch' }],
  [{ x: 'R1', y: 3, z: 'Cedar' }, { x: 'R2', y: 3, z: 'Cedar' }],
];

/** First place drawn at the top: the larger the rank, the lower the mark. */
const FIRST_ON_TOP = (rank: number): number => rank * 100;

/** First place drawn at the bottom, on an ordinary rank axis. */
const FIRST_AT_BOTTOM = (rank: number): number => 400 - rank * 100;

/**
 * Draws one marker per point, at the height its rank is drawn at, and has
 * every marker report it.
 * @param heightOf - Where a rank is drawn, from the top of the page
 */
function draw(heightOf: (rank: number) => number): void {
  const markers = TABLE.flatMap((line, row) => line.map(point =>
    `<circle class="line${row}" data-rank="${point.y}" data-top="${heightOf(Number(point.y))}"></circle>`));
  document.body.innerHTML = `<svg><g>${markers.join('')}</g></svg>`;
}

/**
 * Moves the markers already drawn to the height their rank is drawn at now,
 * as a chart still being laid out moves its marks.
 * @param heightOf - Where a rank is drawn, from the top of the page
 */
function place(heightOf: (rank: number) => number): void {
  document.querySelectorAll('circle').forEach((marker) => {
    marker.setAttribute('data-top', String(heightOf(Number(marker.getAttribute('data-rank')))));
  });
}

/**
 * A bump layer whose lines are highlighted by their markers.
 * @param extra - Fields to add to the layer, such as `firstPlace`
 * @param highlighted - Whether the layer names its markers at all
 * @returns The layer
 */
function layer(extra: Partial<MaidrLayer> = {}, highlighted = true): MaidrLayer {
  return {
    id: 'league',
    type: TraceType.BUMP,
    axes: { x: { label: 'Round' }, y: { label: 'Rank' } },
    data: TABLE,
    ...(highlighted ? { selectors: TABLE.map((_, row) => `.line${row}`) } : {}),
    ...extra,
  };
}

/**
 * The competitor the cursor is on, as the announcement names it.
 * @param trace - The trace to read
 * @returns The competitor's name
 */
function competitor(trace: BumpTrace): unknown {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text.z?.value;
}

let measured: number;
let laidOut: boolean;
let warned: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  measured = 0;
  laidOut = true;
  // A layer read as first place on top asks, once, to be told instead.
  warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    measured++;
    // A marker out of the page has no box, as in a browser.
    const shown = laidOut && this.isConnected;
    const top = shown ? Number(this.getAttribute('data-top') ?? 0) : 0;
    const size = shown ? 4 : 0;
    return { top, left: 0, height: size, width: size, right: size, bottom: top + size, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('a chart drawn with first place at the top', () => {
  test('down moves to second place, and up from first place is the boundary', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer());
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(competitor(trace)).toBe('Birch');
  });

  test('control and down reaches last place, control and up first place', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer());
    trace.moveToIndex(1, 0);

    trace.moveToExtreme('DOWNWARD');
    const bottom = competitor(trace);
    trace.moveToExtreme('UPWARD');
    const top = competitor(trace);

    expect(bottom).toBe('Cedar');
    expect(top).toBe('Ash');
  });

  test('is measured once, then remembered', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer());
    trace.moveToIndex(0, 0);
    trace.moveOnce('DOWNWARD');
    const once = measured;
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('UPWARD');

    // Ash's and Birch's best and worst places; Cedar's place never changes,
    // so it says nothing about the axis and is not measured.
    expect(once).toBe(4);
    expect(measured).toBe(once);
  });
});

describe('a chart drawn with first place at the bottom', () => {
  test('up moves to second place, drawn above, as it always has', () => {
    draw(FIRST_AT_BOTTOM);
    const trace = new BumpTrace(layer());
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(competitor(trace)).toBe('Birch');
  });
});

describe('what the layer says, and what is left when nothing can be measured', () => {
  test('a declared first place is taken over the drawing', () => {
    draw(FIRST_AT_BOTTOM);
    const trace = new BumpTrace(layer({ firstPlace: 'top' }));
    trace.moveToIndex(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(measured).toBe(0);
  });

  test('with no highlight, up moves to the next larger rank, as on a line', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer({}, false));
    trace.moveToIndex(0, 0);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(competitor(trace)).toBe('Birch');
    expect(measured).toBe(0);
  });

  test('marks drawn level say nothing, so the next key measures again', () => {
    // A chart still being laid out can draw every mark at one height. That is
    // no evidence either way, and kept as an answer it would hold the line's
    // rule for the trace's life once the marks moved into place.
    draw(() => 50);
    const trace = new BumpTrace(layer());
    trace.moveToIndex(0, 0);

    const level = trace.moveOnce('UPWARD');
    const reached = competitor(trace);
    place(FIRST_ON_TOP);
    const placed = trace.moveOnce('UPWARD');

    expect(level).toBe(true);
    expect(reached).toBe('Birch');
    expect(placed).toBe(true);
    expect(competitor(trace)).toBe('Ash');
  });

  test('a marker taken out of the page reads as not laid out', () => {
    // A detached or hidden marker has an empty box, as one not laid out does.
    draw(FIRST_ON_TOP);
    const svg = document.querySelector('svg');
    if (svg === null) {
      throw new Error('expected the drawing');
    }
    const trace = new BumpTrace(layer());
    trace.moveToIndex(0, 0);

    svg.remove();
    const detached = trace.moveOnce('UPWARD');
    const reached = competitor(trace);
    document.body.appendChild(svg);
    const attached = trace.moveOnce('UPWARD');

    expect(detached).toBe(true);
    expect(reached).toBe('Birch');
    expect(attached).toBe(true);
    expect(competitor(trace)).toBe('Ash');
  });

  test('a chart not laid out yet keeps the line\'s rule, and is measured on the next key', () => {
    draw(FIRST_ON_TOP);
    laidOut = false;
    const trace = new BumpTrace(layer());
    trace.moveToIndex(0, 0);

    const beforeLayout = trace.moveOnce('UPWARD');
    const reached = competitor(trace);
    laidOut = true;
    const afterLayout = trace.moveOnce('UPWARD');

    expect(beforeLayout).toBe(true);
    expect(reached).toBe('Birch');
    expect(afterLayout).toBe(true);
    expect(competitor(trace)).toBe('Ash');
  });
});

describe('a layer that leaves it to be read is asked to say it', () => {
  // Before the drawing was read, a layer that did not say moved Up to the
  // next larger rank. Where the reading turns that round, the producer is
  // told how to state it, once per layer.

  test('a reading that turns the keys round warns once, naming the field', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer({ id: 'asked-once' }));
    trace.moveToIndex(0, 0);
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('UPWARD');
    new BumpTrace(layer({ id: 'asked-once' })).moveOnce('UPWARD');

    expect(warned).toHaveBeenCalledTimes(1);
    expect(String(warned.mock.calls[0]?.[0])).toContain('asked-once');
    expect(String(warned.mock.calls[0]?.[0])).toContain('firstPlace');
  });

  test('a reading that keeps the line\'s rule says nothing', () => {
    draw(FIRST_AT_BOTTOM);
    const trace = new BumpTrace(layer({ id: 'kept-the-rule' }));
    trace.moveToIndex(0, 0);
    trace.moveOnce('UPWARD');

    expect(warned).not.toHaveBeenCalled();
  });

  test('a layer that says says nothing more', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer({ id: 'said-it', firstPlace: 'top' }));
    trace.moveToIndex(0, 0);
    trace.moveOnce('DOWNWARD');

    expect(warned).not.toHaveBeenCalled();
  });

  test('nothing to measure says nothing', () => {
    draw(FIRST_ON_TOP);
    const trace = new BumpTrace(layer({ id: 'no-highlight' }, false));
    trace.moveToIndex(0, 0);
    trace.moveOnce('UPWARD');

    expect(warned).not.toHaveBeenCalled();
  });
});
