/**
 * @jest-environment jsdom
 */

/**
 * Cached mark centres survive a scroll, and they must not.
 *
 * Heatmap, box, violin-box and violin-KDE all measure their marks once, in
 * the constructor, and keep the result to answer `findNearestPoint` without
 * measuring again. What they keep are *viewport* coordinates, and the pointer
 * coordinates they are compared against (`event.clientX` / `clientY`) are
 * always current -- so the moment the page, or a container the chart sits in,
 * scrolls under them, every centre is off by however far the chart moved. A
 * heatmap built below the fold and then scrolled into view resolved a hover
 * to a cell hundreds of pixels from the pointer.
 *
 * The rule these cases fix: a cached centre lives until the viewport moves --
 * a scroll of the page or of any ancestor, or a window resize -- and the next
 * hover measures again. (A redraw or a live-data update replaces the trace,
 * which measures for itself.)
 *
 * The cost side is pinned by counting measurements rather than timing them:
 * a hover with nothing moved measures once, for the bounds check, whatever
 * the chart's size.
 */

import type { BoxPoint, BoxSelector, HeatmapData, MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Heatmap } from '@model/heatmap';
import { ViolinKdeTrace } from '@model/violin';
import { ViolinBoxTrace } from '@model/violinBox';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Stands in for the SVG DOM classes jsdom does not implement.
 *
 * jsdom ships `SVGElement` and `SVGGraphicsElement` and nothing more
 * specialised, so the branches that ask what a chart drew -- a heatmap's
 * rects, a violin's path -- throw before they read anything. Each stand-in
 * answers `instanceof` by tag name, which is all those branches ask of it.
 */
for (const [name, tag] of [
  ['SVGRectElement', 'rect'],
  ['SVGPathElement', 'path'],
  ['SVGUseElement', 'use'],
  ['SVGPolygonElement', 'polygon'],
]) {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (scope[name] !== undefined) {
    continue;
  }
  scope[name] = class {
    public static [Symbol.hasInstance](value: unknown): boolean {
      return (value as Element | null)?.tagName === tag;
    }
  };
}

/**
 * How far the page has scrolled, in pixels, since the chart was drawn.
 *
 * Every measured rectangle is shifted up by this much, which is what a
 * downward scroll does to a client rectangle.
 */
let scrolled = 0;

/** The default box for an element the fixture gave no geometry to. */
const DEFAULT_BOX = { x: 0, y: 0, width: 10, height: 10 };

/**
 * jsdom measures nothing, so geometry is carried on the element as an
 * attribute and read back here. Attributes survive `cloneNode`, which matters
 * because the traces highlight clones of the chart's elements rather than the
 * elements themselves.
 * @returns The spy counting the measurements the pointer path takes
 */
function stubMeasurement(): jest.SpiedFunction<() => DOMRect> {
  return jest
    .spyOn(SVGElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: SVGElement): DOMRect {
      const carried = this.getAttribute('data-box');
      const box = carried
        ? (JSON.parse(carried) as typeof DEFAULT_BOX)
        : DEFAULT_BOX;
      const top = box.y - scrolled;
      return {
        x: box.x,
        y: top,
        left: box.x,
        top,
        width: box.width,
        height: box.height,
        right: box.x + box.width,
        bottom: top + box.height,
        toJSON: () => ({}),
      } as DOMRect;
    });
}

/**
 * Puts an element in the chart with a fixed geometry.
 *
 * `getBBox` is defined alongside it because the box traces derive their
 * quartile edges from the drawn box before any of this is measured.
 * @param tag - The SVG tag to draw
 * @param id - Its id, which a selector names
 * @param box - Where it was drawn
 * @returns The element, already in the document
 */
function place(tag: string, id: string, box = DEFAULT_BOX): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('id', id);
  element.setAttribute('data-box', JSON.stringify(box));
  Object.defineProperty(element, 'getBBox', {
    value: () => ({ ...box }),
    configurable: true,
  });
  document.querySelector('svg')?.appendChild(element);
  return element;
}

/** The three cells of the heatmap fixture, stacked down the page. */
const CELL_BOXES = [
  { x: 0, y: 0, width: 40, height: 40 },
  { x: 0, y: 100, width: 40, height: 40 },
  { x: 0, y: 200, width: 40, height: 40 },
];

/**
 * A one-column heatmap of three cells.
 * @returns The trace, its cells already drawn
 */
function buildHeatmap(): Heatmap {
  CELL_BOXES.forEach((box, index) => place('rect', `cell-${index}`, box));
  const data: HeatmapData = {
    x: ['week'],
    y: ['top', 'middle', 'bottom'],
    points: [[3], [2], [1]],
  };
  return new Heatmap({
    id: 'heatmap',
    type: TraceType.HEATMAP,
    title: 'A heatmap',
    selectors: 'rect',
    axes: { x: { label: 'Column' }, y: { label: 'Row' }, z: { label: 'Value' } },
    data,
  } as unknown as MaidrLayer);
}

/** The selectors a box-shaped fixture resolves through. */
const BOX_SELECTOR: BoxSelector = {
  lowerOutliers: [],
  min: '#low',
  iq: '#body',
  q2: '#median',
  max: '#high',
  upperOutliers: [],
};

/**
 * Draws the four elements a box is built from.
 */
function drawBox(): void {
  place('path', 'body', { x: 10, y: 40, width: 20, height: 30 });
  place('path', 'median', { x: 10, y: 55, width: 20, height: 0 });
  place('path', 'low', { x: 15, y: 90, width: 10, height: 0 });
  place('path', 'high', { x: 15, y: 10, width: 10, height: 0 });
}

const BOX_POINT: BoxPoint = {
  z: 'a',
  lowerOutliers: [],
  min: 2,
  q1: 4,
  q2: 5,
  q3: 6,
  max: 8,
  upperOutliers: [],
};

/**
 * A single box, drawn standing up.
 * @returns The trace, its box already drawn
 */
function buildBox(): BoxTrace {
  drawBox();
  return new BoxTrace({
    id: 'box',
    type: TraceType.BOX,
    title: 'A box',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: [BOX_SELECTOR],
    data: [BOX_POINT],
  } as MaidrLayer);
}

/**
 * A single violin's summary box.
 * @returns The trace, its box already drawn
 */
function buildViolinBox(): ViolinBoxTrace {
  drawBox();
  return new ViolinBoxTrace({
    id: 'violin-box',
    type: TraceType.VIOLIN_BOX,
    title: 'A violin',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: [BOX_SELECTOR],
    data: [BOX_POINT],
  } as MaidrLayer);
}

/** One violin's curve, carrying the SVG coordinates its markers sit at. */
const KDE_CURVE: ViolinKdePoint[] = [
  { x: 'setosa', y: 1, density: 0.2, svg_x: 10, svg_y: 40 },
  { x: 'setosa', y: 2, density: 0.8, svg_x: 10, svg_y: 60 },
  { x: 'setosa', y: 3, density: 0.4, svg_x: 10, svg_y: 80 },
];

/**
 * A single violin drawn as a filled curve.
 * @returns The trace, its curve already drawn
 */
function buildViolinKde(): ViolinKdeTrace {
  place('path', 'curve', { x: 0, y: 20, width: 60, height: 80 });
  return new ViolinKdeTrace({
    id: 'violin-kde',
    type: TraceType.VIOLIN_KDE,
    title: 'A violin',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: ['#curve'],
    data: [KDE_CURVE],
  } as MaidrLayer);
}

/**
 * Read a trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: Heatmap): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/** What the cases below need of a trace: it hovers, and it can be disposed. */
interface HoverTrace {
  moveToPointAndGetPointerGuidance: (x: number, y: number) => unknown;
  dispose: () => void;
}

const TRACES: { name: string; build: () => HoverTrace }[] = [
  { name: 'a heatmap', build: buildHeatmap },
  { name: 'a box plot', build: buildBox },
  { name: 'a violin box', build: buildViolinBox },
  { name: 'a violin curve', build: buildViolinKde },
];

describe.each(TRACES)('the pointer centres $name caches', ({ build }) => {
  let measure: jest.SpiedFunction<() => DOMRect>;

  beforeEach(() => {
    scrolled = 0;
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
    measure = stubMeasurement();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Builds the trace and reports how many marks it measured doing so, which
   * is the size of the cache and therefore what a rebuild costs.
   * @returns The trace and the number of marks behind it
   */
  function built(): { trace: HoverTrace; marks: number } {
    measure.mockClear();
    const trace = build();
    const marks = measure.mock.calls.length;
    measure.mockClear();
    return { trace, marks };
  }

  test('are measured once while the trace is built', () => {
    const { marks } = built();

    expect(marks).toBeGreaterThan(0);
  });

  test('answer a hover without measuring again while nothing has moved', () => {
    const { trace } = built();

    trace.moveToPointAndGetPointerGuidance(20, 20);

    // The one read is the bounds check on the mark the hover resolved to.
    expect(measure).toHaveBeenCalledTimes(1);
  });

  test('are measured again on the first hover after the page scrolls', () => {
    const { trace, marks } = built();

    scrolled = 100;
    window.dispatchEvent(new Event('scroll'));
    trace.moveToPointAndGetPointerGuidance(20, 20);

    expect(measure).toHaveBeenCalledTimes(marks + 1);
  });

  test('are measured again on the first hover after the window resizes', () => {
    const { trace, marks } = built();

    window.dispatchEvent(new Event('resize'));
    trace.moveToPointAndGetPointerGuidance(20, 20);

    expect(measure).toHaveBeenCalledTimes(marks + 1);
  });

  test('are measured once per viewport change, not once per hover', () => {
    const { trace } = built();

    scrolled = 100;
    window.dispatchEvent(new Event('scroll'));
    trace.moveToPointAndGetPointerGuidance(20, 20);
    measure.mockClear();
    trace.moveToPointAndGetPointerGuidance(20, 25);

    expect(measure).toHaveBeenCalledTimes(1);
  });

  test('stop being watched once the trace is disposed', () => {
    const { trace } = built();
    const released = jest.spyOn(window, 'removeEventListener');

    trace.dispose();

    expect(released).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(released).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

describe('a heatmap scrolled into view', () => {
  beforeEach(() => {
    scrolled = 0;
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
    stubMeasurement();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('lands on the cell the pointer is over, not the one that was there', () => {
    // The cells are 100px apart and the page scrolls by exactly one cell, so
    // a stale centre names the cell above the pointer -- the quiet kind of
    // wrong, since the announcement is a real cell with a real value.
    const trace = buildHeatmap();
    trace.moveToIndex(2, 0);

    scrolled = 100;
    window.dispatchEvent(new Event('scroll'));
    trace.moveToPointAndGetPointerGuidance(20, 20);

    expect(nonEmptyState(trace).text.cross?.value).toBe('middle');
  });
});
