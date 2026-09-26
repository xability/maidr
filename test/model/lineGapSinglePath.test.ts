/**
 * @jest-environment jsdom
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { stepDataVertices } from '@model/step';
import { TraceType } from '@type/grammar';

/**
 * A line with gaps drawn as ONE path whose subpaths skip them.
 *
 * MUI X Charts draws `[5, null, 10]` as `M65,255Z M380,20Z` -- a vertex per
 * reading. `LineTrace` placed every point by its x along those vertices, so
 * on a category axis, where x is not a number, every marker sat on the first
 * vertex, and after a leading gap every marker was one sample off.
 */

type Cell = SVGElement | SVGElement[];

beforeAll(() => {
  if ('SVGPathElement' in globalThis)
    return;
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

function trace(data: LinePoint[], d: string): LineTrace {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><path id="line" d="${d}"></path></svg>`;
  const layer: MaidrLayer = {
    id: 'gap',
    type: TraceType.LINE,
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors: ['#line'],
    data: [data],
  };
  return new LineTrace(layer);
}

/** Where each point's marker sits, or null where there is none. */
function markers(line: LineTrace): ({ x: number; y: number } | null)[] {
  const row = (line as unknown as { highlightValues: Cell[][] | null }).highlightValues?.[0] ?? [];
  return row.map((cell) => {
    const element = Array.isArray(cell) ? cell[0] : cell;
    return element === undefined
      ? null
      : { x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')) };
  });
}

describe('a line whose gaps are breaks in one path', () => {
  test('pairs the vertices with the readings on a category axis', () => {
    const line = trace(
      [{ x: 'Jan', y: 5 }, { x: 'Feb', y: null }, { x: 'Mar', y: 10 }],
      'M65,255ZM380,20Z',
    );

    expect(markers(line)).toEqual([{ x: 65, y: 255 }, null, { x: 380, y: 20 }]);
  });

  test('keeps every marker on its own sample after a leading gap', () => {
    const line = trace(
      [{ x: 1, y: null }, { x: 2, y: 5 }, { x: 3, y: 7 }, { x: 4, y: 9 }],
      'M170,200L275,150L380,100',
    );

    expect(markers(line)).toEqual([null, { x: 170, y: 200 }, { x: 275, y: 150 }, { x: 380, y: 100 }]);
  });
});

describe('a staircase extended past its first and last sample', () => {
  test('reads MUI\'s 2N + 3 hv path as its samples, flat runs included', () => {
    // What MUI X drew for stepAfter [8, 8, 10, 12, 12] on a point axis.
    const d = 'M23.125,295L85,295L85,295L208.75,295L208.75,295L332.5,295L332.5,157.5'
      + 'L456.25,157.5L456.25,20L580,20L580,20L641.875,20L641.875,20';
    const vertices = d.slice(1).split('L').map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });

    expect(stepDataVertices(vertices, 5)).toEqual([
      { x: 85, y: 295 },
      { x: 208.75, y: 295 },
      { x: 332.5, y: 157.5 },
      { x: 456.25, y: 20 },
      { x: 580, y: 20 },
    ]);
  });

  test('does not take a path whose ends change level for an extended one', () => {
    // 2N + 3 vertices for N = 2, but the first run is not flat against the
    // first sample, so these are not added ends.
    const vertices = [
      { x: 0, y: 50 },
      { x: 10, y: 50 },
      { x: 10, y: 40 },
      { x: 20, y: 40 },
      { x: 20, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 30 },
    ];

    expect(stepDataVertices(vertices, 2)).not.toEqual([{ x: 10, y: 40 }, { x: 20, y: 30 }]);
  });
});
