/**
 * @jest-environment jsdom
 */

/**
 * Each stop of a letter-value ladder outlines the box it is read off.
 *
 * Every stop of a distribution used to outline the whole ladder, so the
 * outline stood still while the reader walked one: the 3.13th percentile and
 * the 96.9th looked the same. The element a producer names for a
 * distribution already holds the ladder's boxes, drawn one of two ways --
 * tiled edge to edge, as seaborn draws them, or nested about the median, as
 * `examples/boxen.html` does -- and each rung is the outer edge of one box.
 */

import type { BoxenTrace } from '@model/boxen';
import type { BoxenPoint, MaidrLayer } from '@type/grammar';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A two-rung ladder: five stops, the 12.5th to the 87.5th percentile, with
 * the longer tail above, as most samples have one tail longer than the other.
 */
const TWO_RUNGS: BoxenPoint = {
  z: 'a',
  median: 50,
  levels: [
    { p: 0.25, lo: 40, hi: 60 },
    { p: 0.125, lo: 30, hi: 75 },
  ],
};

/** The same ladder with tails of one length: its own mirror image. */
const EVEN_TAILS: BoxenPoint = {
  z: 'even',
  median: 50,
  levels: [
    { p: 0.25, lo: 40, hi: 60 },
    { p: 0.125, lo: 30, hi: 70 },
  ],
};

/** Where a shape is drawn on the page. */
interface Extent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** One drawn shape: its tag, the name a test reads back, and where it sits. */
interface Shape extends Extent {
  tag: 'rect' | 'path' | 'line';
  name: string;
}

const NOWHERE: Extent = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Where each drawn element is laid out, by its name. Looked up by name rather
 * than set on the element, so that a copy MAIDR makes of one is laid out
 * where it is, as it would be in a browser.
 */
const layout = new Map<string, Extent>();

beforeAll(() => {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const extent = layout.get(this.getAttribute('data-name') ?? '') ?? NOWHERE;
    return {
      ...extent,
      width: extent.right - extent.left,
      height: extent.bottom - extent.top,
      x: extent.left,
      y: extent.top,
      toJSON: () => ({}),
    };
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

/**
 * Draw one group per distribution, each holding its shapes in the order given
 * and spanning all of them.
 * @param groups - Each distribution's shapes
 */
function draw(groups: Shape[][]): void {
  document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
  const svg = document.querySelector('svg');
  groups.forEach((shapes, index) => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'ladder');
    group.setAttribute('data-name', `group ${index}`);
    for (const shape of shapes) {
      const element = document.createElementNS(SVG_NS, shape.tag);
      element.setAttribute('data-name', shape.name);
      layout.set(shape.name, shape);
      group.appendChild(element);
    }
    layout.set(`group ${index}`, {
      left: Math.min(...shapes.map(shape => shape.left)),
      right: Math.max(...shapes.map(shape => shape.right)),
      top: Math.min(...shapes.map(shape => shape.top)),
      bottom: Math.max(...shapes.map(shape => shape.bottom)),
    });
    svg?.appendChild(group);
  });
}

/**
 * A boxen layer over the drawn distributions.
 * @param data - The distributions
 * @param orientation - Which way the ladders are drawn
 * @returns The trace
 */
function boxen(data: BoxenPoint[], orientation?: Orientation): BoxenTrace {
  const layer: MaidrLayer = {
    id: 'boxen',
    type: TraceType.BOXEN,
    ...(orientation === undefined ? {} : { orientation }),
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: '.ladder',
    data,
  };
  return TraceFactory.create(layer) as BoxenTrace;
}

/**
 * The name of what the trace outlines where it stands.
 * @param trace - The trace
 * @returns The outlined element's name, or null when nothing is outlined
 */
function outlined(trace: BoxenTrace): string | null {
  const state = trace.state;
  if (state.empty || state.type !== 'trace' || state.highlight.empty) {
    return null;
  }
  const [element] = [state.highlight.elements].flat();
  return element?.getAttribute('data-name') ?? null;
}

/**
 * The name of what each stop of one distribution outlines, in walking order.
 * @param trace - The trace
 * @param row - Which distribution
 * @returns One name per stop
 */
function outlinedAlong(trace: BoxenTrace, row: number): (string | null)[] {
  const names: (string | null)[] = [];
  for (let col = 0; trace.moveToIndex(row, col); col++) {
    names.push(outlined(trace));
  }
  return names;
}

/**
 * A box from `from` to `to` up a ladder standing up, four pixels to a unit:
 * a higher value is drawn higher on the page, at a smaller `top`.
 * @param name - What a test calls it
 * @param from - Its lower edge, as a value
 * @param to - Its upper edge
 * @param left - Where it starts across the page
 * @returns The shape
 */
function upright(name: string, from: number, to: number, left = 90): Shape {
  return { tag: 'path', name, left, right: left + 20, top: 400 - 4 * to, bottom: 400 - 4 * from };
}

/**
 * The same box lying on its side, the value growing left to right.
 * @param name - What a test calls it
 * @param from - Its left edge, as a value
 * @param to - Its right edge
 * @returns The shape
 */
function across(name: string, from: number, to: number): Shape {
  return { tag: 'rect', name, left: 4 * from, right: 4 * to, top: 90, bottom: 110 };
}

/**
 * The same box on an inverted value axis, as `ax.invert_yaxis()` draws it:
 * a higher value is drawn lower on the page.
 * @param name - What a test calls it
 * @param from - Its lower edge, as a value
 * @param to - Its upper edge
 * @returns The shape
 */
function hanging(name: string, from: number, to: number): Shape {
  return { tag: 'path', name, left: 90, right: 110, top: 4 * from, bottom: 4 * to };
}

/**
 * The same box on a log value axis, a hundred pixels to a decade.
 * @param name - What a test calls it
 * @param from - Its lower edge, as a value
 * @param to - Its upper edge
 * @returns The shape
 */
function logged(name: string, from: number, to: number): Shape {
  return { tag: 'path', name, left: 90, right: 110, top: 400 - 100 * Math.log10(to), bottom: 400 - 100 * Math.log10(from) };
}

/** Every stop of a two-rung ladder outlining one thing. */
const WHOLE = (name: string): string[] => Array.from({ length: 5 }, () => name);

afterEach(() => {
  document.body.innerHTML = '';
  layout.clear();
});

describe('a ladder drawn as boxes tiled edge to edge', () => {
  test('outlines the box each rung is the outer edge of', () => {
    // Drawn out of order: the order is read off where each box sits.
    draw([[upright('middle', 40, 60), upright('top', 60, 75), upright('bottom', 30, 40)]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['bottom', 'middle', 'middle', 'middle', 'top']);
  });

  test('reads a ladder lying on its side left to right', () => {
    draw([[across('right', 60, 75), across('left', 30, 40), across('middle', 40, 60)]]);

    const along = outlinedAlong(boxen([TWO_RUNGS], Orientation.HORIZONTAL), 0);

    expect(along).toEqual(['left', 'middle', 'middle', 'middle', 'right']);
  });

  test('reads each distribution off its own boxes', () => {
    const shallow: BoxenPoint = { z: 'b', median: 50, levels: [{ p: 0.25, lo: 45, hi: 55 }] };
    draw([
      [upright('a low', 30, 40), upright('a middle', 40, 60), upright('a high', 60, 75)],
      [upright('b only', 45, 55, 190)],
    ]);

    const trace = boxen([TWO_RUNGS, shallow]);

    expect(outlinedAlong(trace, 1)).toEqual(['b only', 'b only', 'b only']);
    expect(outlinedAlong(trace, 0)).toEqual(['a low', 'a middle', 'a middle', 'a middle', 'a high']);
  });

  test('reads a reversed value axis the other way round', () => {
    // The lowest values are drawn at the top of the page: the box drawn
    // highest is the one below the median.
    draw([[hanging('low', 30, 40), hanging('middle', 40, 60), hanging('high', 60, 75)]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['low', 'middle', 'middle', 'middle', 'high']);
  });

  test('reads a log value axis', () => {
    draw([[logged('low', 30, 40), logged('middle', 40, 60), logged('high', 60, 75)]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['low', 'middle', 'middle', 'middle', 'high']);
  });

  test('outlines a ladder whole whose boxes cannot say which end is low', () => {
    // Tails of one length fit the axis running either way, and paired the
    // wrong way round every rung below the median would outline a box above it.
    draw([[upright('low', 30, 40), upright('middle', 40, 60), upright('high', 60, 70)]]);

    const along = outlinedAlong(boxen([EVEN_TAILS]), 0);

    expect(along).toEqual(WHOLE('group 0'));
  });

  test('tells which end is low from ladders drawn at different heights', () => {
    const higher: BoxenPoint = {
      z: 'higher',
      median: 80,
      levels: [{ p: 0.25, lo: 70, hi: 90 }, { p: 0.125, lo: 60, hi: 100 }],
    };
    draw([
      [upright('a low', 30, 40), upright('a middle', 40, 60), upright('a high', 60, 70)],
      [upright('b low', 60, 70, 190), upright('b middle', 70, 90, 190), upright('b high', 90, 100, 190)],
    ]);

    const trace = boxen([EVEN_TAILS, higher]);

    expect(outlinedAlong(trace, 0)).toEqual(['a low', 'a middle', 'a middle', 'a middle', 'a high']);
    expect(outlinedAlong(trace, 1)).toEqual(['b low', 'b middle', 'b middle', 'b middle', 'b high']);
  });
});

describe('a ladder drawn as boxes nested about the median', () => {
  test('outlines the box spanning each rung, and the median line', () => {
    draw([[
      { tag: 'rect', name: 'outer', left: 85, right: 115, top: 100, bottom: 280 },
      { tag: 'rect', name: 'inner', left: 90, right: 110, top: 160, bottom: 240 },
      { tag: 'line', name: 'median', left: 85, right: 115, top: 200, bottom: 200 },
    ]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['outer', 'inner', 'median', 'inner', 'outer']);
  });

  test('outlines the innermost box at the median when it cannot tell which line is the median', () => {
    draw([[
      { tag: 'rect', name: 'outer', left: 85, right: 115, top: 100, bottom: 280 },
      { tag: 'rect', name: 'inner', left: 90, right: 110, top: 160, bottom: 240 },
      { tag: 'line', name: 'median', left: 85, right: 115, top: 200, bottom: 200 },
      { tag: 'line', name: 'cap', left: 95, right: 105, top: 100, bottom: 100 },
    ]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['outer', 'inner', 'inner', 'inner', 'outer']);
  });

  test('outlines the innermost box at the median when no line is drawn there', () => {
    draw([[
      { tag: 'rect', name: 'inner', left: 90, right: 110, top: 160, bottom: 240 },
      { tag: 'rect', name: 'outer', left: 85, right: 115, top: 100, bottom: 280 },
    ]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['outer', 'inner', 'inner', 'inner', 'outer']);
  });
});

describe('a distribution drawn any other way is outlined whole', () => {
  test('when it holds as many boxes as neither drawing has', () => {
    draw([[upright('one', 30, 40), upright('two', 40, 50), upright('three', 50, 60), upright('four', 60, 75)]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(WHOLE('group 0'));
  });

  test('when its boxes neither tile nor nest', () => {
    // Three boxes side by side across the page, over much the same values.
    draw([[
      { tag: 'rect', name: 'one', left: 0, right: 10, top: 160, bottom: 240 },
      { tag: 'rect', name: 'two', left: 20, right: 30, top: 140, bottom: 220 },
      { tag: 'rect', name: 'three', left: 40, right: 50, top: 180, bottom: 260 },
    ]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(WHOLE('group 0'));
  });

  test('when it has not been laid out', () => {
    draw([[
      { tag: 'path', name: 'one', ...NOWHERE },
      { tag: 'path', name: 'two', ...NOWHERE },
      { tag: 'path', name: 'three', ...NOWHERE },
    ]]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(WHOLE('group 0'));
  });

  test('when it is a single mark', () => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><rect class="ladder" data-name="mark" /></svg>`;

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(WHOLE('mark'));
  });
});

describe('the outlined boxes', () => {
  test('are copied once each, and every copy goes with the trace', () => {
    draw([[upright('bottom', 30, 40), upright('middle', 40, 60), upright('top', 60, 75)]]);
    const trace = boxen([TWO_RUNGS]);
    const copies = document.querySelectorAll('[data-maidr-owned]').length;

    trace.dispose();

    expect(copies).toBe(3);
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
  });

  test('are read again while the copies of an earlier reading are still in the chart', () => {
    draw([[upright('bottom', 30, 40), upright('middle', 40, 60), upright('top', 60, 75)]]);
    boxen([TWO_RUNGS]);

    const along = outlinedAlong(boxen([TWO_RUNGS]), 0);

    expect(along).toEqual(['bottom', 'middle', 'middle', 'middle', 'top']);
  });

  test('leave the pointer on a distribution anywhere over its ladder', () => {
    draw([[upright('bottom', 30, 40), upright('middle', 40, 60), upright('top', 60, 75)]]);
    const trace = boxen([TWO_RUNGS]);

    // Over the top box, further than the pointer's reach from the middle one.
    const guidance = trace.moveToPointAndGetPointerGuidance(100, 125);

    expect(guidance).toEqual({ onCurve: true });
    expect(trace.state).toMatchObject({ text: { section: 'median' } });
  });

  test('leave high contrast recolouring each distribution as the layer names it', () => {
    draw([[upright('bottom', 30, 40), upright('middle', 40, 60), upright('top', 60, 75)]]);
    const trace = boxen([TWO_RUNGS]);

    const marks = trace.getAllOriginalElements().map(element => element.getAttribute('data-name'));

    expect([...new Set(marks)]).toEqual(['group 0']);
  });
});
