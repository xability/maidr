/**
 * @jest-environment jsdom
 */
import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { ViolinBoxTrace } from '@model/violinBox';
import { TraceType } from '@type/grammar';

/**
 * A box trace offers a renderer the box's shape: the chart's own box, caps
 * and median, joined by hidden whisker lines it builds. The whiskers are in
 * no highlight value, and disposal removed only what the highlight values
 * hold, so every time the chart took focus, and the trace was built again, a
 * box plot gained another set of hidden lines.
 *
 * jsdom measures nothing, so each element the whiskers are built from is
 * given its box by hand: a box with a cap above and a cap below it.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Puts an element in the chart with a fixed measured box.
 * @param id - Its id, which the selector names
 * @param box - What `getBBox` reports
 * @param box.x - Its left
 * @param box.y - Its top
 * @param box.width - Its width
 * @param box.height - Its height
 */
function place(id: string, box: { x: number; y: number; width: number; height: number }): void {
  const element = document.createElementNS(SVG_NS, 'path');
  element.setAttribute('id', id);
  Object.defineProperty(element, 'getBBox', { value: () => ({ ...box }), configurable: true });
  document.querySelector('svg')?.appendChild(element);
}

/**
 * A layer of one box with a cap above and below it.
 * @param type - A box or a violin's box
 * @returns The layer
 */
function layer(type: TraceType.BOX | TraceType.VIOLIN_BOX): MaidrLayer {
  const point: BoxPoint = { z: 'a', lowerOutliers: [], min: 2, q1: 4, q2: 5, q3: 6, max: 8, upperOutliers: [] };
  const selector: BoxSelector = { lowerOutliers: [], min: '#low', iq: '#box', q2: '#median', max: '#high', upperOutliers: [] };
  return {
    id: 'box',
    type,
    title: 'A box',
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: [selector],
    data: [point],
  } as MaidrLayer;
}

/** The trace for each kind of box. */
const KINDS = [
  { kind: 'box', build: (): BoxTrace => new BoxTrace(layer(TraceType.BOX)) },
  { kind: 'violin\'s box', build: (): ViolinBoxTrace => new ViolinBoxTrace(layer(TraceType.VIOLIN_BOX)) },
];

/**
 * The lines on the page. The chart draws none of its own here, so each is
 * one MAIDR built.
 * @returns How many there are
 */
function lines(): number {
  return document.querySelectorAll('line').length;
}

describe('a box\'s whisker lines', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
    place('box', { x: 10, y: 40, width: 20, height: 30 });
    place('median', { x: 10, y: 55, width: 20, height: 0 });
    place('low', { x: 15, y: 90, width: 10, height: 0 });
    place('high', { x: 15, y: 10, width: 10, height: 0 });
  });

  test.each(KINDS)('are taken away with the $kind\'s trace when it is disposed', ({ build }) => {
    const trace = build();
    expect(trace.getGeometryElements().filter(element => element.tagName === 'line')).toHaveLength(2);

    trace.dispose();

    expect(lines()).toBe(0);
    // The chart's own box, median and caps stay.
    expect(document.querySelectorAll('path')).toHaveLength(4);
  });

  test.each(KINDS)('do not pile up on a $kind however often the chart takes focus', ({ build }) => {
    // A trace is built each time the chart takes focus, and disposed when it
    // loses it.
    const first = build();
    const once = lines();
    first.dispose();
    for (let focus = 0; focus < 3; focus++) {
      build().dispose();
    }

    const trace = build();

    expect(lines()).toBe(once);
    trace.dispose();
  });
});
