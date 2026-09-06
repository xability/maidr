/**
 * @jest-environment jsdom
 */

/**
 * Pointer-hover centres are measured when a pointer first needs them, not
 * when the trace is built.
 *
 * `getBoundingClientRect` is a layout read, and the constructor has just
 * inserted one hidden clone per data point — so measuring there forces the
 * browser to lay the whole SVG out again, once per trace, before the first
 * announcement. A keyboard reader, who is the primary audience, never hovers
 * and never needs the answer; a live-data chart pays it again on every
 * append, because the controller rebuilds the figure.
 *
 * Both traces already knew how to build the centres late: they mark the
 * cache stale on scroll and resize and rebuild it inside `findNearestPoint`.
 * These pin that the constructor now leaves it stale rather than filling it,
 * and that a hover still lands on the right point.
 */

import type { LinePoint, MaidrLayer, ScatterPoint } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

const MARK = '.mark';

/**
 * Draw `count` marks, each addressable through {@link MARK}.
 * @param count - How many marks the chart drew
 */
function draw(count: number): void {
  // cx/cy so a scatter can group the marks into columns, and an id so the
  // stand-in layout below can place each one.
  const marks = Array.from(
    { length: count },
    (_, i) => `<circle class="mark" id="m${i}" cx="${i * 10}" cy="${i * 10}" />`,
  );
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${marks.join('')}</svg>`;
}

/**
 * A scatter layer whose points are drawn by {@link draw}.
 * @param data - The points the layer carries
 * @returns The layer
 */
function scatterLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'points',
    type: TraceType.SCATTER,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors: MARK,
    data,
  };
}

/**
 * A single-series line layer whose points are drawn by {@link draw}.
 * @param data - The points the series carries
 * @returns The layer
 */
function lineLayer(data: LinePoint[]): MaidrLayer {
  return {
    id: 'series',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors: [MARK],
    data: [data],
  };
}

/**
 * Place every mark on the viewport, ten pixels apart along the diagonal, so
 * a hover has somewhere to land. jsdom lays nothing out on its own.
 * @returns The spy, so the caller can count what read the layout
 */
function layOutMarks(): jest.SpiedFunction<() => DOMRect> {
  return jest
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element): DOMRect {
      const at = Number(this.id.replace(/\D/g, '') || 0) * 10;
      return { x: at, y: at, width: 2, height: 2 } as DOMRect;
    });
}

describe('when a trace measures its pointer-hover centres', () => {
  beforeEach(() => {
    draw(4);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('a scatter reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new ScatterTrace(scatterLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a scatter still answers a hover with the point under the pointer', () => {
    const layout = layOutMarks();
    const trace = new ScatterTrace(scatterLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.id).toBe('m3');
    expect(layout).toHaveBeenCalled();
  });

  test('a line reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new LineTrace(lineLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a line still answers a hover with the point under the pointer', () => {
    const layout = layOutMarks();
    const trace = new LineTrace(lineLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    const nearest = trace.findNearestPoint(1, 1);

    expect(nearest?.col).toBe(0);
    expect(layout).toHaveBeenCalled();
  });
});
