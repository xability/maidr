/**
 * @jest-environment jsdom
 */
import type { DumbbellPoint, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DumbbellTrace } from '@model/dumbbell';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A dumbbell's selectors name one connector per pair, so both ends of a pair
 * outlined the same element: the reader moved from one end to the other,
 * heard the other value, and the highlight held still. Each end is marked
 * where its value is drawn on the connector instead.
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

/** The six numbers of a screen matrix. */
interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Puts a connector in the chart with a fixed measured box.
 * @param box - What `getBBox` reports
 * @param options - How it is drawn
 * @param options.tag - Its element
 * @param options.transform - A transform of its own
 * @param options.toPage - What `getScreenCTM` reports, when anything
 * @returns The connector
 */
function place(
  box: Box,
  { tag = 'line', transform, toPage }: { tag?: string; transform?: string; toPage?: Matrix } = {},
): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('class', 'connector');
  element.setAttribute('style', 'stroke: #8c8c8c; stroke-width: 6px');
  if (transform) {
    element.setAttribute('transform', transform);
  }
  Object.defineProperty(element, 'getBBox', { value: () => ({ ...box }), configurable: true });
  if (toPage) {
    Object.defineProperty(element, 'getScreenCTM', { value: () => ({ ...toPage }), configurable: true });
  }
  document.querySelector('g')?.appendChild(element);
  return element;
}

/**
 * A layer of pairs whose selector names the connectors.
 * @param points - The pairs
 * @param orientation - Which way the value axis runs
 * @returns The layer
 */
function layer(points: DumbbellPoint[], orientation = Orientation.HORIZONTAL): MaidrLayer {
  return {
    id: 'dumbbell',
    type: TraceType.DUMBBELL,
    title: 'Life expectancy',
    orientation,
    axes: { x: { label: 'Years' }, y: { label: 'Country' } },
    selectors: '.connector',
    data: { startLabel: '1990', endLabel: '2020', points },
  };
}

/**
 * What the highlight marks on one end of one pair.
 * @param trace - The trace
 * @param row - The end: 0 for the start, 1 for the end
 * @param col - The pair
 * @returns The marked element
 */
function markedAt(trace: DumbbellTrace, row: number, col: number): SVGElement {
  trace.moveToIndex(row, col);
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    throw new Error('Expected the cursor to be highlighted');
  }
  return [state.highlight.elements].flat()[0];
}

/**
 * Where a marker is centred.
 * @param element - The marker
 * @returns Its centre
 */
function centre(element: SVGElement): [number, number] {
  return [Number(element.getAttribute('cx')), Number(element.getAttribute('cy'))];
}

const DENMARK: DumbbellPoint = { x: 'Denmark', start: 71.2, end: 78.4 };
const LATVIA: DumbbellPoint = { x: 'Latvia', start: 74.6, end: 69.5 };
const POLAND: DumbbellPoint = { x: 'Poland', start: 70.9, end: 75.6 };

describe('each end of a dumbbell is marked on its own', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><g></g></svg>`;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('marks each end where its value is drawn, not the whole connector', () => {
    place({ x: 308, y: 120, width: 288, height: 0 });
    place({ x: 240, y: 190, width: 204, height: 0 });
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA]));

    const denmark1990 = markedAt(trace, 0, 0);
    const denmark2020 = markedAt(trace, 1, 0);
    const latvia1990 = markedAt(trace, 0, 1);
    const latvia2020 = markedAt(trace, 1, 1);

    expect(denmark1990.tagName).toBe('circle');
    expect(centre(denmark1990)).toEqual([308, 120]);
    expect(centre(denmark2020)).toEqual([596, 120]);
    // Latvia fell, so its 1990 end is the one drawn further right.
    expect(centre(latvia1990)).toEqual([444, 190]);
    expect(centre(latvia2020)).toEqual([240, 190]);
  });

  test('marks the top and the bottom of each connector on a chart standing upright', () => {
    place({ x: 125, y: 585, width: 70, height: 40 }, { tag: 'path' });
    place({ x: 252, y: 620, width: 70, height: 50 }, { tag: 'path' });
    const trace = new DumbbellTrace(layer([
      { x: 'Norway', start: 75, end: 83 },
      { x: 'Brazil', start: 66, end: 76 },
    ], Orientation.VERTICAL));

    expect(centre(markedAt(trace, 0, 0))).toEqual([160, 625]);
    expect(centre(markedAt(trace, 1, 0))).toEqual([160, 585]);
    expect(centre(markedAt(trace, 0, 1))).toEqual([287, 670]);
    expect(centre(markedAt(trace, 1, 1))).toEqual([287, 620]);
  });

  test('marks both ends of a pair that held still at the middle of its connector', () => {
    place({ x: 308, y: 120, width: 288, height: 0 });
    place({ x: 240, y: 190, width: 204, height: 0 });
    place({ x: 500, y: 260, width: 0, height: 0 });
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA, { x: 'Malta', start: 76, end: 76 }]));

    expect(centre(markedAt(trace, 0, 2))).toEqual([500, 260]);
    expect(centre(markedAt(trace, 1, 2))).toEqual([500, 260]);
  });

  test('reads which end is which off the page when the chart turns the group it draws in', () => {
    // Highcharts lays a chart on its side by turning the series group, so a
    // connector running across the page runs up and down its own coordinates.
    const turned = { a: 0, b: -1, c: -1, d: 0, e: 500, f: 400 };
    place({ x: 347.5, y: 60, width: 0, height: 80 }, { tag: 'path', toPage: turned });
    place({ x: 270.5, y: 50, width: 0, height: 60 }, { tag: 'path', toPage: turned });
    const trace = new DumbbellTrace(layer([
      { x: 'Norway', start: 76, end: 84 },
      { x: 'Japan', start: 79, end: 85 },
    ]));

    expect(centre(markedAt(trace, 0, 0))).toEqual([347.5, 140]);
    expect(centre(markedAt(trace, 1, 0))).toEqual([347.5, 60]);
  });

  test('marks the ends of a connector its own transform moves, beside it in its parent', () => {
    const group = document.querySelector('g') as SVGGElement;
    Object.defineProperty(group, 'getScreenCTM', {
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 100, f: 200 }),
      configurable: true,
    });
    place(
      { x: 0, y: 0, width: 60, height: 0 },
      { tag: 'path', transform: 'translate(400,20)', toPage: { a: 1, b: 0, c: 0, d: 1, e: 500, f: 220 } },
    );
    place(
      { x: 0, y: 0, width: 110, height: 0 },
      { tag: 'path', transform: 'translate(255,60)', toPage: { a: 1, b: 0, c: 0, d: 1, e: 355, f: 260 } },
    );
    const trace = new DumbbellTrace(layer([
      { x: 'Canada', start: 78, end: 79.2 },
      { x: 'Chile', start: 75.1, end: 77.3 },
    ]));

    expect(centre(markedAt(trace, 0, 0))).toEqual([400, 20]);
    expect(centre(markedAt(trace, 1, 0))).toEqual([460, 20]);
  });

  test('follows a value axis drawn reversed, its larger values further left', () => {
    // One pair fits an axis running either way; it is the two together,
    // drawn in order only the reversed way, that say which way it runs.
    place({ x: 216, y: 120, width: 72, height: 0 });
    place({ x: 254, y: 190, width: 51, height: 0 });
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA]));

    expect(centre(markedAt(trace, 0, 0))).toEqual([288, 120]);
    expect(centre(markedAt(trace, 1, 0))).toEqual([216, 120]);
    expect(centre(markedAt(trace, 0, 1))).toEqual([254, 190]);
    expect(centre(markedAt(trace, 1, 1))).toEqual([305, 190]);
  });

  test.each([
    {
      shape: 'pairs drawn out of order whichever way the axis runs',
      draw: () => [
        place({ x: 308, y: 120, width: 288, height: 0 }),
        place({ x: 700, y: 190, width: 200, height: 0 }),
      ],
      points: [DENMARK, LATVIA],
    },
    {
      shape: 'a lone pair, which fits an axis running either way',
      draw: () => [place({ x: 308, y: 120, width: 288, height: 0 })],
      points: [DENMARK],
    },
  ])('outlines every connector whole at both ends, as before, for $shape', ({ draw, points }) => {
    // A wrong end marked shows the reader the other value's place, which is
    // worse than showing them the pair.
    const connectors = draw();
    const trace = new DumbbellTrace(layer(points));

    connectors.forEach((connector, col) => {
      const start = markedAt(trace, 0, col);
      const end = markedAt(trace, 1, col);

      expect(start.previousElementSibling).toBe(connector);
      expect(end).toBe(start);
    });
  });

  test.each([
    {
      shape: 'a dot named in place of a connector',
      draw: () => place({ x: 287, y: 321, width: 18, height: 18 }, { tag: 'circle' }),
      point: POLAND,
    },
    {
      shape: 'a pair missing a value',
      draw: () => place({ x: 296, y: 330, width: 188, height: 0 }),
      point: { x: 'Poland', start: Number.NaN, end: 75.6 },
    },
    {
      shape: 'a connector that does not run along the value axis',
      draw: () => place({ x: 296, y: 250, width: 0, height: 90 }),
      point: POLAND,
    },
    {
      shape: 'a connector drawn with a transform of its own that the document cannot map',
      draw: () => place({ x: 296, y: 330, width: 188, height: 0 }, { transform: 'rotate(5)' }),
      point: POLAND,
    },
  ])('outlines $shape whole at both ends, as before, and marks the other pairs\' ends', ({ draw, point }) => {
    place({ x: 308, y: 120, width: 288, height: 0 });
    place({ x: 240, y: 190, width: 204, height: 0 });
    const connector = draw();
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA, point]));

    const start = markedAt(trace, 0, 2);
    const end = markedAt(trace, 1, 2);

    expect(start.tagName).toBe(connector.tagName);
    expect(start.previousElementSibling).toBe(connector);
    expect(end).toBe(start);
    expect(centre(markedAt(trace, 1, 0))).toEqual([596, 120]);
  });

  test('outlines a connector the document cannot measure whole at both ends, and says why', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    place({ x: 308, y: 120, width: 288, height: 0 });
    place({ x: 240, y: 190, width: 204, height: 0 });
    const connector = place({ x: 296, y: 330, width: 188, height: 0 });
    Object.defineProperty(connector, 'getBBox', {
      value: () => {
        throw new Error('not rendered');
      },
    });
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA, POLAND]));

    expect(markedAt(trace, 1, 2).previousElementSibling).toBe(connector);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('keeps the connectors among the chart\'s own elements, which high contrast paints as marks', () => {
    // The markers are no copies of a connector, so pairing each with the
    // element before it, as a copy is paired, found no original for them.
    const denmark = place({ x: 308, y: 120, width: 288, height: 0 });
    const latvia = place({ x: 240, y: 190, width: 204, height: 0 });
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA]));

    expect(trace.getAllOriginalElements()).toEqual([denmark, latvia, denmark, latvia]);
  });

  test('leaves nothing of its own in the chart once disposed', () => {
    place({ x: 308, y: 120, width: 288, height: 0 });
    place({ x: 240, y: 190, width: 204, height: 0 });
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA]));
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(4);

    trace.dispose();

    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
  });

  test('moves the reader to the pair a pointer is over, anywhere along its connector', () => {
    const rect = (left: number, top: number, width: number): DOMRect =>
      ({ x: left, y: top, left, top, width, height: 6, right: left + width, bottom: top + 6 }) as DOMRect;
    const denmark = place({ x: 308, y: 120, width: 288, height: 0 });
    const latvia = place({ x: 240, y: 190, width: 204, height: 0 });
    denmark.getBoundingClientRect = () => rect(308, 117, 288);
    latvia.getBoundingClientRect = () => rect(240, 187, 204);
    const trace = new DumbbellTrace(layer([DENMARK, LATVIA]));

    // Over Latvia's 2020 end, the far end of the connector from where the
    // cursor enters the pair.
    const guidance = trace.moveToPointAndGetPointerGuidance(250, 190);
    const state = trace.state;

    expect(guidance).toEqual({ onCurve: true });
    expect(state.empty || state.highlight.empty ? null : centre([state.highlight.elements].flat()[0])).toEqual([444, 190]);
  });
});
