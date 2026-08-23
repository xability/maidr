/**
 * @jest-environment jsdom
 */

import type { LinePoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * The shape a line trace drew, as distinct from the markers sitting on it.
 *
 * `mapViaPathParsing` reads a series' vertices out of the rendered `<path>`,
 * builds one hidden circle per vertex for highlighting, and lets the path go.
 * That leaves the trace able to say where its points are and unable to say
 * what runs between them — fine for a highlight, which only ever lights one
 * point, and wrong for anything drawing the trace as a shape.
 *
 * The tactile display is that anything. Drawn from the markers alone a line
 * chart reaches the pins as a scatter of dots, and zoomed in, a window landing
 * between two vertices holds nothing at all — so the reader feels a blank
 * display and every pan from there redraws the same blank, which is
 * indistinguishable from panning being broken.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Stands in for two SVG DOM classes jsdom does not implement.
 *
 * jsdom ships `SVGElement`, `SVGGraphicsElement`, `SVGSVGElement` and a
 * handful of others, and nothing for `<path>` or `<polyline>` — so the
 * `instanceof` branch that reads a series' vertices throws `SVGPathElement is
 * not defined` before it reads anything. Both stand-ins answer `instanceof` by
 * tag name, which is the only thing the code under test asks of them, and both
 * are installed only where the real ones are missing.
 */
for (const [name, tag] of [['SVGPathElement', 'path'], ['SVGPolylineElement', 'polyline']]) {
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

function layer(data: LinePoint[][], selectors: string | string[]): MaidrLayer {
  return {
    id: 'l',
    type: TraceType.LINE,
    title: 'Series',
    selectors,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  } as MaidrLayer;
}

const POINTS: LinePoint[][] = [[
  { x: 'a', y: 1 },
  { x: 'b', y: 2 },
  { x: 'c', y: 3 },
]];

/**
 * Puts one rendered series in the document and hands back its path.
 * @param id - Id of the group holding the path
 */
function renderSeries(id: string): SVGPathElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('id', id);
  const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
  path.setAttribute('d', 'M 0 10 L 10 20 L 20 30');
  group.appendChild(path);
  svg.appendChild(group);
  document.body.appendChild(svg);
  return path;
}

describe('the shape a line trace drew', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('is offered alongside the markers synthesised from it', () => {
    const path = renderSeries('s0');
    const trace = new LineTrace(layer(POINTS, ['g[id="s0"] path']));

    expect(trace.getGeometryElements()).toEqual([path]);
  });

  test('is not confused with the markers, which are one per vertex', () => {
    renderSeries('s0');
    const trace = new LineTrace(layer(POINTS, ['g[id="s0"] path']));

    // Three data points, three markers, one path. Were the two lists the same
    // thing, the caller preferring geometry would silently get the vertices
    // back and the display would stay a scatter of dots.
    expect(trace.getAllHighlightElements()).toHaveLength(POINTS[0].length);
    expect(trace.getGeometryElements()).toHaveLength(1);
  });

  test('is one path per series, in series order', () => {
    const first = renderSeries('s0');
    const second = renderSeries('s1');
    const trace = new LineTrace(layer(
      [POINTS[0], POINTS[0]],
      ['g[id="s0"] path', 'g[id="s1"] path'],
    ));

    expect(trace.getGeometryElements()).toEqual([first, second]);
  });

  test('is empty when the chart drew its own markers and no path was read', () => {
    // Recharts and friends render a real dot per point, so `mapViaDomElements`
    // resolves the markers directly and no path is ever parsed. There is a
    // connecting line in that chart, but it is an element this trace never
    // looked at and so cannot offer — an empty list, for a caller to fall back
    // from, rather than a wrong one.
    const svg = document.createElementNS(SVG_NS, 'svg');
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', 's0');
    for (let i = 0; i < POINTS[0].length; i++) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(i * 10));
      dot.setAttribute('cy', String(i * 10));
      group.appendChild(dot);
    }
    svg.appendChild(group);
    document.body.appendChild(svg);

    const trace = new LineTrace(layer(POINTS, ['g[id="s0"] circle']));

    expect(trace.getAllHighlightElements()).toHaveLength(POINTS[0].length);
    expect(trace.getGeometryElements()).toEqual([]);
  });
});
