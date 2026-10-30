/**
 * @jest-environment jsdom
 */
import type { BoxPoint, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Nivo draws a horizontal box plot's box as a vertical one inside a group
 * rotated by -90°. The quartiles' highlights are lines along the box's edges,
 * taken in the box's own coordinates, where a horizontal box's Q1 and Q3 are
 * its left and right edges; turned, those were drawn along the box's length,
 * at its top and bottom. Nivo named the whole box for both instead, so the
 * highlight did not show which quartile was being read.
 *
 * jsdom measures and transforms nothing, so the box is given its box and its
 * transform by hand, as the chart drew them.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Puts an element in the chart with a fixed measured box and transform.
 * @param tag - The SVG tag
 * @param id - Its id, which the selector names
 * @param box - What `getBBox` reports, in the element's own coordinates
 * @param matrix - What `getCTM` reports
 * @returns The element
 */
function place(tag: string, id: string, box: Box, matrix: Partial<DOMMatrix>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('id', id);
  Object.defineProperty(element, 'getBBox', { value: () => ({ ...box }), configurable: true });
  Object.defineProperty(element, 'getCTM', { value: () => ({ ...matrix }), configurable: true });
  document.querySelector('g')?.appendChild(element);
  return element;
}

/** No transform. */
const UPRIGHT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `translate(100, 200) rotate(-90)`: a point (x, y) is drawn at (100 + y, 200 - x). */
const TURNED = { a: 0, b: -1, c: 1, d: 0, e: 100, f: 200 };

function layer(): MaidrLayer {
  const point: BoxPoint = {
    z: 'Morning',
    lowerOutliers: [],
    min: 10,
    q1: 19.68,
    q2: 22,
    q3: 26.07,
    max: 35,
    upperOutliers: [],
  };
  return {
    id: 'box',
    type: TraceType.BOX,
    title: 'Departures',
    orientation: Orientation.HORIZONTAL,
    axes: { x: { label: 'Minutes' }, y: { label: 'Departure' } },
    selectors: [{ lowerOutliers: [], min: '#low', iq: '#body', q2: '#median', max: '#high', upperOutliers: [] }],
    data: [point],
  } as MaidrLayer;
}

/**
 * Where the highlight of one section of the box runs.
 * @param trace - The trace
 * @param section - The section's column: 2 for Q1, 4 for Q3
 * @returns The highlighted line's `[x1, y1, x2, y2]`
 */
function lineAt(trace: BoxTrace, section: number): number[] {
  trace.moveToIndex(0, section);
  const state: TraceState = trace.state;
  if (state.empty || state.highlight.empty) {
    throw new Error('Expected a highlight');
  }
  const [line] = [state.highlight.elements].flat();
  return ['x1', 'y1', 'x2', 'y2'].map(name => Number(line.getAttribute(name)));
}

describe('the quartiles of a horizontal box', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><g></g></svg>`;
  });

  test('are its left and right edges when it is drawn upright', () => {
    place('rect', 'body', { x: 40, y: 10, width: 60, height: 20 }, UPRIGHT);
    place('line', 'median', { x: 66, y: 10, width: 0, height: 20 }, UPRIGHT);
    place('line', 'low', { x: 10, y: 15, width: 0, height: 10 }, UPRIGHT);
    place('line', 'high', { x: 130, y: 15, width: 0, height: 10 }, UPRIGHT);
    const trace = new BoxTrace(layer());

    expect(lineAt(trace, 2)).toEqual([40, 10, 40, 30]);
    expect(lineAt(trace, 4)).toEqual([100, 10, 100, 30]);
  });

  test('are the edges its turn lays across the chart when it is drawn turned a quarter', () => {
    // An upright box in its own coordinates: 20 wide, 60 tall.
    place('rect', 'body', { x: -10, y: 40, width: 20, height: 60 }, TURNED);
    place('line', 'median', { x: -10, y: 66, width: 20, height: 0 }, TURNED);
    place('line', 'low', { x: -5, y: 10, width: 10, height: 0 }, TURNED);
    place('line', 'high', { x: -5, y: 130, width: 10, height: 0 }, TURNED);
    const trace = new BoxTrace(layer());

    // Its own top is drawn on the left, at x 140; its own bottom on the
    // right, at x 200.
    expect(lineAt(trace, 2)).toEqual([-10, 40, 10, 40]);
    expect(lineAt(trace, 4)).toEqual([-10, 100, 10, 100]);
  });
});
