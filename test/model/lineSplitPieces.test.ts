/**
 * @jest-environment jsdom
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * A line series whose selector matches several elements.
 *
 * gridSVG draws a line broken by an interior NA as sibling polylines, the
 * `...1.1.1` grob split into `...1.1.1a` and `...1.1.1b`, and a base R
 * selector of the form `#grob polyline` matches every polyline inside the
 * grob. `LineTrace` read the first match alone and stretched the whole
 * series' x range along it, so every marker after the break sat on the first
 * piece, in the wrong place.
 */

type Cell = SVGElement | SVGElement[];

/**
 * jsdom implements none of the per-tag SVG interfaces, so the
 * `instanceof SVGPathElement` test that runs first would throw. Answer it by
 * tag, as a browser would.
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

function layer(data: LinePoint[], selector: string): MaidrLayer {
  return {
    id: 'split-line',
    type: TraceType.LINE,
    title: 'Split',
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors: [selector],
    data: [data],
  };
}

function highlightsOf(trace: LineTrace): Cell[][] | null {
  return (trace as unknown as { highlightValues: Cell[][] | null }).highlightValues;
}

/** Where each column's marker sits, or null for a column with none. */
function markerCentres(trace: LineTrace): ({ x: number; y: number } | null)[] {
  const row = highlightsOf(trace)?.[0] ?? [];
  return row.map((cell) => {
    const element = Array.isArray(cell) ? cell[0] : cell;
    if (element === undefined) {
      return null;
    }
    return {
      x: Number(element.getAttribute('cx')),
      y: Number(element.getAttribute('cy')),
    };
  });
}

function polyline(id: string, vertices: { x: number; y: number }[]): string {
  const points = vertices.map(v => `${v.x},${v.y}`).join(' ');
  return `<polyline id="${id}" points="${points}" fill="none"></polyline>`;
}

/** r-maidr's ggplot2 payload for y = c(1, 3, NA, 4, 2, 5), as measured. */
const GG_POINTS: LinePoint[] = [
  { x: 1, y: 1 },
  { x: 2, y: 3 },
  { x: 3, y: null },
  { x: 4, y: 4 },
  { x: 5, y: 2 },
  { x: 6, y: 5 },
];
const PIECE_A = [{ x: 49.84, y: 46.57 }, { x: 135.3, y: 193.22 }];
const PIECE_B = [
  { x: 306.23, y: 266.54 },
  { x: 391.69, y: 119.9 },
  { x: 477.15, y: 339.86 },
];

describe('a line series split into several elements', () => {
  beforeEach(() => {
    defineSvgPathElement();
  });

  test('gridSVG pieces: every reading on its own vertex, the gap unmarked', () => {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"><g id="panel">
        ${polyline('GRID.polyline.1.1.1a', PIECE_A)}
        ${polyline('GRID.polyline.1.1.1b', PIECE_B)}
      </g></svg>`;

    const trace = new LineTrace(layer(GG_POINTS, 'polyline[id^="GRID.polyline.1.1.1"]'));

    expect(markerCentres(trace)).toEqual([
      PIECE_A[0],
      PIECE_A[1],
      null,
      PIECE_B[0],
      PIECE_B[1],
      PIECE_B[2],
    ]);
    expect(trace.getGeometryElements().map(e => e.id)).toEqual([
      'GRID.polyline.1.1.1a',
      'GRID.polyline.1.1.1b',
    ]);
  });

  test('simplified pieces: readings placed by x along the piece that holds them', () => {
    // Base R: `#grob polyline` matches both pieces. Each piece has dropped a
    // collinear vertex, so there are fewer vertices than readings and the
    // readings have to be found along the pieces by their x.
    const points: LinePoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: null },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
    ];
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"><g id="lines-1">
        ${polyline('p1', [{ x: 0, y: 100 }, { x: 20, y: 80 }])}
        ${polyline('p2', [{ x: 40, y: 60 }, { x: 60, y: 60 }])}
      </g></svg>`;

    const trace = new LineTrace(layer(points, '#lines-1 polyline'));

    expect(markerCentres(trace)).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 90 },
      { x: 20, y: 80 },
      null,
      { x: 40, y: 60 },
      { x: 50, y: 60 },
      { x: 60, y: 60 },
    ]);
  });

  test('a null-y column reports no highlight', () => {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"><g id="panel">
        ${polyline('GRID.polyline.1.1.1a', PIECE_A)}
        ${polyline('GRID.polyline.1.1.1b', PIECE_B)}
      </g></svg>`;

    // eslint-disable-next-line no-new
    new LineTrace(layer(GG_POINTS, 'polyline[id^="GRID.polyline.1.1.1"]'));

    // Five markers for five readings; none for the gap.
    expect(document.querySelectorAll('circle')).toHaveLength(5);
  });

  test('a single element is read exactly as before', () => {
    // One simplified polyline for a whole series: the x range is stretched
    // along it, as it always has been.
    const points: LinePoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"><g id="lines-1">
        ${polyline('only', [{ x: 0, y: 100 }, { x: 40, y: 60 }])}
      </g></svg>`;

    const trace = new LineTrace(layer(points, '#lines-1 polyline'));

    expect(markerCentres(trace)).toEqual([
      { x: 0, y: 100 },
      { x: 20, y: 80 },
      { x: 40, y: 60 },
    ]);
  });
});
