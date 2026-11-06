/**
 * @jest-environment jsdom
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Line series that name one selector between them.
 *
 * Two producers do it, for different drawings. Vega-Lite names one selector
 * for every series of a line mark with a colour encoding, and it matches one
 * path per series, each in a group of its own. py-maidr names a contour
 * level's path for every island of the level, because matplotlib draws a
 * level as one path with a subpath per island. `LineTrace` read any repeated
 * selector as the first case, for the whole layer: every series took the
 * matches of the first series' selector, so a series naming a path of its own
 * beside two that shared one had no highlight, and neither did the second of
 * the two.
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

/**
 * A line layer of one series per selector.
 * @param selectors - One selector per series
 * @param data - The series
 * @returns The layer
 */
function layer(selectors: string[], data: LinePoint[][]): MaidrLayer {
  return {
    id: 'shared-selectors',
    type: TraceType.LINE,
    title: 'Shared',
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors,
    data,
  };
}

/**
 * Where each series' markers sit, series by series.
 * @param trace - The trace to read
 * @returns One list of centres per series
 */
function markerCentres(trace: LineTrace): { x: number; y: number }[][] {
  const rows = (trace as unknown as { highlightValues: Cell[][] | null }).highlightValues ?? [];
  return rows.map(row => row.flatMap((cell) => {
    const element = Array.isArray(cell) ? cell[0] : cell;
    return element === undefined
      ? []
      : [{ x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')) }];
  }));
}

/** Three points rising left to right, drawn as a path of three vertices. */
const RISING: LinePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 2, y: 2 },
];

/** Three points falling left to right. */
const FALLING: LinePoint[] = [
  { x: 0, y: 2 },
  { x: 1, y: 1 },
  { x: 2, y: 0 },
];

describe('series that share a selector', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('each read their own match when the selector matches a path per series', () => {
    // Vega-Lite's colour encoding, unchanged.
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g class="mark-line"><path d="M 0 100 L 50 50 L 100 0"></path></g>
        <g class="mark-line"><path d="M 0 0 L 50 50 L 100 100"></path></g>
      </svg>`;

    const trace = new LineTrace(layer(['g.mark-line path', 'g.mark-line path'], [RISING, FALLING]));

    expect(markerCentres(trace)).toEqual([
      [{ x: 0, y: 100 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }],
    ]);
  });

  test('read its subpaths in order when it matches one path with a subpath for each', () => {
    // One path drawing both series, as matplotlib draws a contour level's
    // islands. The first series was spread over both subpaths, and the second
    // had no highlight.
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="both" d="M 0 100 L 50 50 L 100 0 M 0 0 L 50 50 L 100 100"></path>
      </svg>`;

    const trace = new LineTrace(layer(['path#both', 'path#both'], [RISING, FALLING]));

    expect(markerCentres(trace)).toEqual([
      [{ x: 0, y: 100 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }],
    ]);
  });

  test('leave a series that names a selector of its own its own element', () => {
    // A contour of one single-curve level and one level of two islands. Read
    // as one shared case, the second and third series looked for the second
    // and third match of the first series' selector, and found none.
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="set">
          <path d="M 0 50 L 50 50 L 100 50"></path>
          <path d="M 0 100 L 50 50 L 100 0 M 0 0 L 50 50 L 100 100"></path>
        </g>
      </svg>`;
    const level: LinePoint[] = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];

    const trace = new LineTrace(layer(
      ['g#set > path:nth-of-type(1)', 'g#set > path:nth-of-type(2)', 'g#set > path:nth-of-type(2)'],
      [level, RISING, FALLING],
    ));

    expect(markerCentres(trace)).toEqual([
      [{ x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }],
      [{ x: 0, y: 100 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }],
    ]);
  });

  test('pass over a subpath of a single vertex, which no series is drawn by', () => {
    // matplotlib keeps a place where the field only touches a level as a
    // subpath of one vertex, and py-maidr emits no series for it. Counted, it
    // would leave one subpath more than the series naming the path, and only
    // the first series would be highlighted.
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="both" d="M 0 100 L 50 50 L 100 0 M 5 5 z M 0 0 L 50 50 L 100 100"></path>
      </svg>`;

    const trace = new LineTrace(layer(['path#both', 'path#both'], [RISING, FALLING]));

    expect(markerCentres(trace)).toEqual([
      [{ x: 0, y: 100 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }],
    ]);
  });

  test('say which series a shared selector could not place', () => {
    // Two series naming a path that draws one run: the first reads the path,
    // and the second has nothing to highlight. The layer still highlights,
    // so nothing else says so.
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="one" d="M 0 100 L 50 50 L 100 0"></path>
      </svg>`;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const trace = new LineTrace({
      ...layer(['path#one', 'path#one'], [RISING, FALLING]),
      id: 'shared-selectors-unplaced',
    });
    const warnings = warn.mock.calls.map(call => String(call[0]));
    warn.mockRestore();

    expect(markerCentres(trace)).toEqual([
      [{ x: 0, y: 100 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      [],
    ]);
    expect(warnings).toEqual([
      expect.stringContaining('Could not place 1 of the 2 series naming "path#one"'),
    ]);
  });
});
