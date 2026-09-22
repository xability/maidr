/**
 * @jest-environment jsdom
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * A line series drawn as a `<polygon>`.
 *
 * gridSVG writes ggplot2's `geom_polygon()` that way, one polygon per group
 * with a vertex per point and nothing else; r-maidr announces each group as
 * a line series. `LineTrace` read a series' vertices from a `<path>` or a
 * `<polyline>` and from nothing else, so such a series had no vertices, no
 * markers and no highlight, while it announced every point (#1273).
 */

/** Three points, distinct in y so a marker on the wrong vertex would show. */
const POINTS: LinePoint[] = [
  { x: 1, y: 1 },
  { x: 2, y: 3 },
  { x: 3, y: 1 },
];

/** Where the polygon draws each point. */
const VERTICES = [
  { x: 10, y: 100 },
  { x: 20, y: 40 },
  { x: 30, y: 100 },
];

/**
 * jsdom implements `SVGElement` and none of the per-tag SVG interfaces, so
 * the `instanceof SVGPathElement` branch that runs first would throw. Answer
 * it by tag, as a browser would, so a polygon reaches the branch after it.
 */
function defineSvgPathElement(): void {
  if ('SVGPathElement' in globalThis) {
    return;
  }
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
}

function createLayer(): MaidrLayer {
  return {
    id: 'polygon-line',
    type: TraceType.LINE,
    title: 'Outline',
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors: ['g#outline polygon'],
    data: [POINTS],
  };
}

describe('a line series drawn as a polygon (#1273)', () => {
  beforeEach(() => {
    defineSvgPathElement();
    const points = VERTICES.map(v => `${v.x},${v.y}`).join(' ');
    document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="outline"><polygon points="${points}"></polygon></g>
      </svg>`;
  });

  test('gets a marker on every vertex', () => {
    // eslint-disable-next-line no-new
    new LineTrace(createLayer());

    const circles = Array.from(document.querySelectorAll('circle')).map(circle => ({
      x: Number(circle.getAttribute('cx')),
      y: Number(circle.getAttribute('cy')),
    }));
    expect(circles).toEqual(VERTICES);
  });

  test('offers the polygon as the series\' shape', () => {
    const trace = new LineTrace(createLayer());

    expect(trace.getGeometryElements().map(e => e.tagName)).toEqual(['polygon']);
  });
});
