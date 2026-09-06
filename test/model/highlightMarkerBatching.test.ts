/**
 * @jest-environment jsdom
 */

/**
 * Traces that draw their own highlight markers draw a series at a time.
 *
 * A synthesized marker takes its paint from the element it sits beside, and
 * every marker of a series sits beside the same one. Asking for that paint
 * per marker means reading a computed style straight after inserting an
 * element — the sequence that forces the browser to recalculate style, once
 * per point, for every series on the chart. It is paid at construction and
 * again on every live-data append, since the controller rebuilds the figure.
 *
 * The counts below say what changed: one style read per series rather than
 * one per point, and one DOM query per shared selector rather than one per
 * violin. Correctness first in each pair — the markers still land where the
 * points are.
 */

import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { ViolinKdeTrace } from '@model/violin';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * jsdom builds every SVG child as a plain `SVGElement` and defines neither
 * `SVGPathElement` nor `SVGPolylineElement`, so the trace's `instanceof`
 * checks throw a ReferenceError unless a test binds them (#1001).
 */
function bindSvgConstructors(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.SVGPathElement = globals.SVGElement;
  globals.SVGPolylineElement = class NeverAPolyline {};
  globals.SVGUseElement = class NeverAUse {};
  globals.SVGPolygonElement = class NeverAPolygon {};
}

/**
 * Draw one stroked path per series, each addressable by its own id.
 * @param count - How many series the chart drew
 */
function drawSeries(count: number): void {
  const paths = Array.from(
    { length: count },
    (_, i) => `<path id="s${i}" class="series" d="M0,0 L10,10 L20,20 L30,30" />`,
  );
  document.body.innerHTML = `<svg xmlns="${SVG_NS}">${paths.join('')}</svg>`;
}

/**
 * A line layer of `series` series, four points each, drawn by
 * {@link drawSeries}.
 * @param series - How many series the layer carries
 * @returns The layer
 */
function lineLayer(series: number): MaidrLayer {
  return {
    id: 'lines',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors: Array.from({ length: series }, (_, i) => `#s${i}`),
    data: Array.from({ length: series }, () =>
      [0, 1, 2, 3].map(n => ({ x: n, y: n }))),
  };
}

/**
 * Every synthesised highlight circle in the document, in order.
 * @returns The centre of each circle
 */
function circles(): { x: number; y: number }[] {
  return Array.from(document.querySelectorAll('circle')).map(circle => ({
    x: Number(circle.getAttribute('cx')),
    y: Number(circle.getAttribute('cy')),
  }));
}

/**
 * Two violins whose KDE samples carry their drawn coordinates.
 * @param samples - How many samples each curve carries
 * @returns The curves
 */
function curves(samples: number): ViolinKdePoint[][] {
  return ['setosa', 'versicolor'].map((name, r) =>
    Array.from({ length: samples }, (_, i) => ({
      x: name,
      y: i,
      density: 0.5,
      svg_x: r * 100 + i,
      svg_y: i,
    })));
}

describe('when a trace draws its own highlight markers', () => {
  beforeEach(() => {
    bindSvgConstructors();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('a line puts one marker on each of its points', () => {
    drawSeries(1);

    const trace = new LineTrace(lineLayer(1));

    expect(trace.getAllHighlightElements()).toHaveLength(4);
    // On the path's own vertices, in path order.
    expect(circles()).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);
  });

  test('a line reads the paint of a series once, not once per point', () => {
    drawSeries(2);
    const paint = jest.spyOn(window, 'getComputedStyle');

    void new LineTrace(lineLayer(2));

    // Two series of four points each.
    expect(paint).toHaveBeenCalledTimes(2);
  });

  test('a line whose coordinates are unusable leaves the document alone', () => {
    // A single vertex for four points cannot be interpolated, so the
    // reconciliation pads with NaN and the series is declined as a whole.
    // None of its markers should have been drawn on the way to finding that
    // out — an orphan hidden element outlives the trace that made it, and
    // the next selector to be resolved matches it too.
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><path id="s0" d="M0,0" /></svg>`;

    void new LineTrace(lineLayer(1));

    expect(document.querySelectorAll('circle')).toHaveLength(0);
  });

  test('a violin puts one marker on each sample of each curve', () => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><path class="violin" /><path class="violin" /></svg>`;

    const trace = new ViolinKdeTrace({
      id: 'kde',
      type: TraceType.VIOLIN_KDE,
      axes: { x: { label: 'Species' }, y: { label: 'Petal length' } },
      selectors: ['.violin'],
      data: curves(3),
    });

    expect(trace.getAllHighlightElements()).toHaveLength(6);
    expect(circles().map(centre => centre.x)).toEqual([0, 1, 2, 100, 101, 102]);
  });

  test('a violin resolves one shared selector once, not once per violin', () => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><path class="violin" /><path class="violin" /></svg>`;
    const query = jest.spyOn(document, 'querySelectorAll');

    void new ViolinKdeTrace({
      id: 'kde',
      type: TraceType.VIOLIN_KDE,
      axes: { x: { label: 'Species' }, y: { label: 'Petal length' } },
      selectors: ['.violin'],
      data: curves(3),
    });

    expect(query).toHaveBeenCalledTimes(1);
  });
});
