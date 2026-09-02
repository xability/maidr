/**
 * @jest-environment jsdom
 */
import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Orientation, TraceType } from '@type/grammar';

/**
 * The shape a box trace offers a renderer, over the chart's own elements.
 *
 * jsdom measures nothing, so every element the whisker is built from is given
 * its box by hand, the way the chart would have laid it out: a box standing
 * on the page with a cap above and a cap below it.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Puts an element in the chart with a fixed measured box.
 * @param tag - The SVG tag
 * @param id - Its id, which the selector names
 * @param box - What `getBBox` reports
 */
function place(tag: string, id: string, box: Box): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('id', id);
  Object.defineProperty(element, 'getBBox', {
    value: () => ({ ...box }),
    configurable: true,
  });
  document.querySelector('svg')?.appendChild(element);
  return element;
}

function layer(selectors: BoxSelector[], orientation: Orientation = Orientation.VERTICAL): MaidrLayer {
  const point: BoxPoint = {
    z: 'a',
    lowerOutliers: [1],
    min: 2,
    q1: 4,
    q2: 5,
    q3: 6,
    max: 8,
    upperOutliers: [9],
  };
  return {
    id: 'box',
    type: TraceType.BOX,
    title: 'A box',
    orientation,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors,
    data: [point],
  } as MaidrLayer;
}

function lineOf(element: SVGElement): [number, number, number, number] {
  return ['x1', 'y1', 'x2', 'y2'].map(name => Number(element.getAttribute(name))) as [number, number, number, number];
}

describe('the shape a box trace drew', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
  });

  test('is the box, its median, its caps and its outliers, joined by whiskers', () => {
    const body = place('path', 'box', { x: 10, y: 40, width: 20, height: 30 });
    const median = place('path', 'median', { x: 10, y: 55, width: 20, height: 0 });
    const lowerCap = place('path', 'low', { x: 15, y: 90, width: 10, height: 0 });
    const upperCap = place('path', 'high', { x: 15, y: 10, width: 10, height: 0 });
    const flier = place('use', 'flier', { x: 18, y: 100, width: 4, height: 4 });

    const trace = new BoxTrace(layer([{
      lowerOutliers: ['#flier'],
      min: '#low',
      iq: '#box',
      q2: '#median',
      max: '#high',
      upperOutliers: [],
    }]));
    const geometry = trace.getGeometryElements();

    expect(geometry).toEqual(expect.arrayContaining([body, median, lowerCap, upperCap, flier]));
    const whiskers = geometry.filter(element => element.tagName === 'line');
    expect(whiskers.map(lineOf)).toEqual([
      // From the lower cap's centre up to the bottom of the box.
      [20, 90, 20, 70],
      // From the upper cap's centre down to the top of the box.
      [20, 10, 20, 40],
    ]);
    // Geometry for a renderer, not a mark for the chart.
    expect(whiskers.every(whisker => whisker.getAttribute('visibility') === 'hidden')).toBe(true);
  });

  test('runs its whiskers sideways on a horizontal box', () => {
    const body = place('path', 'box', { x: 40, y: 10, width: 30, height: 20 });
    place('path', 'median', { x: 55, y: 10, width: 0, height: 20 });
    place('path', 'low', { x: 10, y: 15, width: 0, height: 10 });
    place('path', 'high', { x: 90, y: 15, width: 0, height: 10 });

    const trace = new BoxTrace(layer([{
      lowerOutliers: [],
      min: '#low',
      iq: '#box',
      q2: '#median',
      max: '#high',
      upperOutliers: [],
    }], Orientation.HORIZONTAL));
    const whiskers = trace.getGeometryElements().filter(element => element.tagName === 'line' && element !== body);

    expect(whiskers.map(lineOf)).toEqual([
      [10, 20, 40, 20],
      [90, 20, 70, 20],
    ]);
  });

  test('offers the box once when the chart drew the quartiles as one shape', () => {
    // Plotly names the whole box for both quartiles. It is one element and
    // is offered once, not once per quartile.
    const body = place('path', 'box', { x: 10, y: 40, width: 20, height: 30 });
    place('path', 'median', { x: 10, y: 55, width: 20, height: 0 });
    place('path', 'low', { x: 15, y: 90, width: 10, height: 0 });
    place('path', 'high', { x: 15, y: 10, width: 10, height: 0 });

    const trace = new BoxTrace(layer([{
      lowerOutliers: [],
      min: '#low',
      iq: '#box',
      q1: '#box',
      q3: '#box',
      q2: '#median',
      max: '#high',
      upperOutliers: [],
    }]));

    expect(trace.getGeometryElements().filter(element => element === body)).toHaveLength(1);
  });

  test('is empty when nothing was selected', () => {
    const trace = new BoxTrace(layer([{
      lowerOutliers: [],
      min: '#nowhere',
      iq: '#nowhere',
      q2: '#nowhere',
      max: '#nowhere',
      upperOutliers: [],
    }]));

    expect(trace.getGeometryElements()).toEqual([]);
  });
});
