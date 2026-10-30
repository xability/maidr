/**
 * @jest-environment jsdom
 */
import type { BoxSelector, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { ViolinBoxTrace } from '@model/violinBox';
import { Orientation, TraceType } from '@type/grammar';

/**
 * seaborn draws a violin's whiskers as one line from the minimum to the
 * maximum, and its selectors name that line for both. Both used to outline
 * the whole line, so the highlight did not show which end the reader was on.
 * The end each is read at is marked instead.
 *
 * jsdom measures nothing, so each element is given its box by hand, as the
 * chart laid it out.
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
 * @param id - Its id, which the selector names
 * @param box - What `getBBox` reports
 * @returns The element
 */
function place(id: string, box: Box): SVGElement {
  const element = document.createElementNS(SVG_NS, 'path');
  element.setAttribute('id', id);
  element.setAttribute('style', 'stroke: #3d3d3d; stroke-width: 2px; fill: none');
  Object.defineProperty(element, 'getBBox', { value: () => ({ ...box }), configurable: true });
  document.querySelector('g')?.appendChild(element);
  return element;
}

/**
 * A layer of one violin's box.
 * @param selector - Its selector
 * @param orientation - Which way the violin stands
 * @param domMapping - How the chart maps the box's edges, when it says
 * @returns The layer
 */
function layer(
  selector: Omit<BoxSelector, 'lowerOutliers' | 'upperOutliers'>,
  orientation = Orientation.VERTICAL,
  domMapping?: MaidrLayer['domMapping'],
): MaidrLayer {
  return {
    id: 'violin-box',
    type: TraceType.VIOLIN_BOX,
    title: 'Violins',
    orientation,
    axes: { x: { label: 'Cut' }, y: { label: 'Price' } },
    data: [{ z: 'Ideal', lowerOutliers: [], min: 326, q1: 878, q2: 1810, q3: 4678.5, max: 10378, upperOutliers: [] }],
    selectors: [{ lowerOutliers: [], upperOutliers: [], ...selector }],
    ...(domMapping ? { domMapping } : {}),
  } as MaidrLayer;
}

/**
 * What the highlight marks where the reader is.
 * @param trace - The trace
 * @returns The marked elements
 */
function marked(trace: ViolinBoxTrace): SVGElement[] {
  const state: TraceState = trace.state;
  if (state.empty || state.highlight.empty) {
    return [];
  }
  return [state.highlight.elements].flat();
}

/**
 * Where a marker is centred.
 * @param element - The marker
 * @returns Its centre
 */
function centre(element: SVGElement): [number, number] {
  return [Number(element.getAttribute('cx')), Number(element.getAttribute('cy'))];
}

describe('the minimum and maximum of a violin whose whisker is one line', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><g></g></svg>`;
  });

  test('mark the lower and the upper end of the line', () => {
    place('whisker', { x: 99, y: 40, width: 2, height: 100 });
    place('iq', { x: 96, y: 80, width: 8, height: 40 });
    place('median', { x: 98, y: 98, width: 4, height: 4 });
    const trace = new ViolinBoxTrace(layer({ min: '#whisker', iq: '#iq', q2: '#median', max: '#whisker' }));

    trace.moveToIndex(0, 0);
    const [minimum] = marked(trace);
    trace.moveToIndex(4, 0);
    const [maximum] = marked(trace);

    expect(minimum.tagName).toBe('circle');
    expect(centre(minimum)).toEqual([100, 140]);
    expect(maximum.tagName).toBe('circle');
    expect(centre(maximum)).toEqual([100, 40]);
  });

  test('swap ends on a chart whose vertical axis runs down in the element\'s coordinates', () => {
    place('whisker', { x: 99, y: 40, width: 2, height: 100 });
    place('iq', { x: 96, y: 80, width: 8, height: 40 });
    place('median', { x: 98, y: 98, width: 4, height: 4 });
    const trace = new ViolinBoxTrace(layer(
      { min: '#whisker', iq: '#iq', q2: '#median', max: '#whisker' },
      Orientation.VERTICAL,
      { iqrDirection: 'reverse' },
    ));

    trace.moveToIndex(0, 0);
    const [minimum] = marked(trace);

    expect(centre(minimum)).toEqual([100, 40]);
  });

  test('mark the left and the right end on a violin lying on its side', () => {
    place('whisker', { x: 40, y: 99, width: 100, height: 2 });
    place('iq', { x: 80, y: 96, width: 40, height: 8 });
    place('median', { x: 98, y: 98, width: 4, height: 4 });
    const trace = new ViolinBoxTrace(layer(
      { min: '#whisker', iq: '#iq', q2: '#median', max: '#whisker' },
      Orientation.HORIZONTAL,
    ));

    trace.moveToIndex(0, 0);
    const [minimum] = marked(trace);
    trace.moveToIndex(0, 4);
    const [maximum] = marked(trace);

    expect(centre(minimum)).toEqual([40, 100]);
    expect(centre(maximum)).toEqual([140, 100]);
  });

  test('mark the ends of a box Plotly draws, whiskers and all, as one path', () => {
    place('box', { x: 95, y: 40, width: 10, height: 100 });
    const trace = new ViolinBoxTrace(layer({ min: '#box', iq: '#box', q2: '#box', max: '#box' }));

    trace.moveToIndex(0, 0);
    const [minimum] = marked(trace);
    trace.moveToIndex(4, 0);
    const [maximum] = marked(trace);

    expect(centre(minimum)).toEqual([100, 140]);
    expect(centre(maximum)).toEqual([100, 40]);
  });

  test('leave a minimum and a maximum drawn apart outlined as they were drawn', () => {
    const low = place('low', { x: 95, y: 140, width: 10, height: 0 });
    place('iq', { x: 96, y: 80, width: 8, height: 40 });
    place('median', { x: 98, y: 98, width: 4, height: 4 });
    place('high', { x: 95, y: 40, width: 10, height: 0 });
    const trace = new ViolinBoxTrace(layer({ min: '#low', iq: '#iq', q2: '#median', max: '#high' }));

    trace.moveToIndex(0, 0);
    const [minimum] = marked(trace);

    expect(minimum.tagName).toBe('path');
    expect(minimum.previousElementSibling).toBe(low);
  });
});
