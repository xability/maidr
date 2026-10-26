/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { afterEach, describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Which marks a scatter's rows and columns outline.
 *
 * A row is one y value and the points holding it, a column one x value. Their
 * marks were found by grouping the marks by the exact coordinate each is
 * drawn at, with the rows ordered largest `y` first, as if SVG y always grew
 * downward. r-maidr draws every chart under `scale(1, -1)`, where it grows
 * upward, so each row outlined the marks of the row mirroring it. Two values
 * drawn at one pixel became one group, which moved every later row or column
 * one along and left the last with no outline. Marks of one value drawn a
 * hair apart, as Highcharts places them, or jittered, as a strip plot draws
 * them, became a group each.
 *
 * Point, intersection and grid navigation pair each mark with the point at
 * its index when the selector matches one mark per point, and so do the rows
 * and columns now.
 */

function layerOf(points: ScatterPoint[]): MaidrLayer {
  return {
    id: 'marks',
    type: TraceType.SCATTER,
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors: 'g#marks > use',
    data: points,
  };
}

/**
 * Draws one `<use>` per mark, each carrying its place in the markup, which
 * the hidden clone a trace highlights copies.
 * @param marks - Where each mark is drawn, in its group's coordinates.
 * @param transform - The group's transform, if any.
 */
function draw(marks: { x: number; y: number }[], transform?: string): void {
  const uses = marks
    .map((mark, i) => `<use data-mark="${i}" x="${mark.x}" y="${mark.y}"></use>`)
    .join('');
  const group = transform === undefined ? '<g id="marks">' : `<g id="marks" transform="${transform}">`;
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${group}${uses}</g></svg>`;
}

/** Narrows the trace state to the populated case. */
function stateOf(trace: ScatterTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

/**
 * The marks the highlight outlines, by their place in the markup.
 * @param trace - The trace to read.
 * @returns The outlined marks' numbers, ascending; none when nothing is outlined.
 */
function outlined(trace: ScatterTrace): number[] {
  const highlight = stateOf(trace).highlight;
  if (highlight.empty) {
    return [];
  }
  const elements = Array.isArray(highlight.elements) ? highlight.elements : [highlight.elements];
  return elements.map(element => Number(element.getAttribute('data-mark'))).sort((a, b) => a - b);
}

/**
 * Presses a key `times` times, reading the outline after each press.
 * @param trace - The trace to move.
 * @param direction - The direction to move in.
 * @param times - How many presses.
 * @returns The outline after each press.
 */
function walk(trace: ScatterTrace, direction: 'FORWARD' | 'UPWARD', times: number): number[][] {
  return Array.from({ length: times }, () => {
    trace.moveOnce(direction);
    return outlined(trace);
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a scatter drawn with y growing upward, as r-maidr draws it', () => {
  test('Up outlines the marks of each row it announces, from the lowest', () => {
    // Drawn y is ten times the data's, flipped onto the page by the group.
    draw([{ x: 100, y: 100 }, { x: 200, y: 300 }, { x: 300, y: 200 }], 'translate(0, 400) scale(1, -1)');
    const trace = new ScatterTrace(layerOf([{ x: 1, y: 10 }, { x: 2, y: 30 }, { x: 3, y: 20 }]));
    trace.moveOnce('FORWARD'); // Enters on the column of x = 1.

    const rows = walk(trace, 'UPWARD', 3);

    // y = 10, 20 and 30: the first mark, the third and the second.
    expect(rows).toEqual([[0], [2], [1]]);
  });
});

describe('two values drawn at one pixel', () => {
  test('stay two rows, and the top row keeps its mark', () => {
    draw([{ x: 100, y: 192.11 }, { x: 200, y: 192.11 }, { x: 300, y: 150 }]);
    const trace = new ScatterTrace(layerOf([{ x: 1, y: 51.4408 }, { x: 2, y: 51.4413 }, { x: 3, y: 60 }]));
    trace.moveOnce('FORWARD');

    const rows = walk(trace, 'UPWARD', 3);

    expect(rows).toEqual([[0], [1], [2]]);
  });

  test('stay two columns, and the last column keeps its mark', () => {
    draw([{ x: 209.82, y: 300 }, { x: 209.82, y: 200 }, { x: 300, y: 100 }]);
    const trace = new ScatterTrace(layerOf([{ x: -0.26057, y: 1 }, { x: -0.26044, y: 2 }, { x: 1, y: 3 }]));

    const columns = walk(trace, 'FORWARD', 3);

    expect(columns).toEqual([[0], [1], [2]]);
  });
});

describe('marks of one value drawn apart', () => {
  test('a hair apart, as Highcharts places them, share their row', () => {
    draw([{ x: 78, y: 331.0000001 }, { x: 383, y: 331.0000002 }, { x: 688, y: 216 }]);
    const trace = new ScatterTrace(layerOf([{ x: 4.6, y: 1.5 }, { x: 5, y: 1.5 }, { x: 5.4, y: 1.7 }]));
    trace.moveOnce('FORWARD');

    const rows = walk(trace, 'UPWARD', 2);

    expect(rows).toEqual([[0, 1], [2]]);
  });

  test('jittered, as a strip plot draws them, share their row', () => {
    // Two levels, each mark nudged off its level's line.
    draw([
      { x: 20, y: 300.4 },
      { x: 50, y: 299.2 },
      { x: 80, y: 301.7 },
      { x: 30, y: 150.3 },
      { x: 60, y: 149.6 },
    ]);
    const trace = new ScatterTrace(layerOf([
      { x: 2, y: 1 },
      { x: 5, y: 1 },
      { x: 8, y: 1 },
      { x: 3, y: 2 },
      { x: 6, y: 2 },
    ]));
    trace.moveOnce('FORWARD');

    const rows = walk(trace, 'UPWARD', 2);

    expect(rows).toEqual([[0, 1, 2], [3, 4]]);
  });
});

describe('pointing at a mark', () => {
  const original = Element.prototype.getBoundingClientRect;

  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
  });

  test('moves to the column of the point it draws where two columns share a pixel', () => {
    // jsdom lays nothing out, so each mark reports a 4 px box about its x, y.
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      const x = Number(this.getAttribute('x'));
      const y = Number(this.getAttribute('y'));
      return { x: x - 2, y: y - 2, width: 4, height: 4, top: y - 2, left: x - 2, right: x + 2, bottom: y + 2 } as DOMRect;
    };
    draw([{ x: 209.82, y: 300 }, { x: 209.82, y: 200 }, { x: 300, y: 100 }]);
    const trace = new ScatterTrace(layerOf([{ x: -0.26057, y: 1 }, { x: -0.26044, y: 2 }, { x: 1, y: 3 }]));

    trace.moveToPointAndGetPointerGuidance(300, 100);

    expect(stateOf(trace).text.main.value).toBe(1);
  });
});

describe('marks that do not pair with the points one to one', () => {
  test('are still grouped by where they are drawn', () => {
    // Three points and two marks: nothing says which mark is which point.
    draw([{ x: 10, y: 50 }, { x: 10, y: 40 }]);
    const trace = new ScatterTrace(layerOf([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]));

    trace.moveOnce('FORWARD');

    expect(outlined(trace)).toEqual([0, 1]);
  });
});
