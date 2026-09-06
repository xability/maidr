/**
 * @jest-environment jsdom
 */
/**
 * A line chart whose markers are drawn in their own layer.
 *
 * `g.series-0 > path`, `g.series-1 > path`, `g.dots > circle` is an ordinary
 * d3 drawing idiom: the lines go down first, the markers on top, so the
 * markers are not children of any line's parent. The binder chose its
 * per-parent point query on `parents.size >= lineElements.length` alone, and
 * every one of those queries came back empty — leaving the loop to end with
 * nothing collected.
 *
 * The result was a layer announcing itself as a line plot and containing no
 * data at all: `data: []`, `selectors: []`. Unlike the shared-parent branch,
 * which throws `No point elements found for selector "…"`, nothing said so.
 *
 * The markers carry the series they belong to, which is exactly what the
 * shared-parent branch groups by, so the chart is readable — it just has to
 * be read that way rather than declared empty.
 */
import type { LinePoint } from '@type/grammar';
import { bindD3Line } from '@adapters/d3/binders/line';
import { beforeEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One marker's bound datum. */
interface Marker {
  x: number;
  y: number;
  series: string;
}

const MARKERS: Marker[] = [
  { x: 1, y: 10, series: 'north' },
  { x: 2, y: 12, series: 'north' },
  { x: 1, y: 4, series: 'south' },
  { x: 2, y: 7, series: 'south' },
];

/**
 * Two lines in two groups, with every marker in a third group of its own.
 * @param markers - The markers to draw, in the order they are appended
 * @returns The SVG root
 */
function buildSvg(markers: Marker[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'chart';
  for (const series of ['north', 'south']) {
    const group = document.createElementNS(SVG_NS, 'g');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'line');
    (path as unknown as { __data__: unknown }).__data__ = { series };
    group.appendChild(path);
    svg.appendChild(group);
  }
  const dots = document.createElementNS(SVG_NS, 'g');
  dots.setAttribute('class', 'dots');
  for (const marker of markers) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'dot');
    (circle as unknown as { __data__: unknown }).__data__ = marker;
    dots.appendChild(circle);
  }
  svg.appendChild(dots);
  document.body.appendChild(svg);
  return svg;
}

describe('a d3 line whose markers live outside the line groups', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('reads the markers instead of emitting an empty trace', () => {
    const svg = buildSvg(MARKERS);

    const layer = bindD3Line(svg, {
      selector: 'path.line',
      pointSelector: 'circle.dot',
      fill: 'series',
    }).layer;

    expect(layer.data as LinePoint[][]).toEqual([
      [{ x: 1, y: 10, z: 'north' }, { x: 2, y: 12, z: 'north' }],
      [{ x: 1, y: 4, z: 'south' }, { x: 2, y: 7, z: 'south' }],
    ]);
  });

  it('says so rather than announcing an empty line plot when nothing matches', () => {
    const svg = buildSvg([]);

    expect(() => bindD3Line(svg, {
      selector: 'path.line',
      pointSelector: 'circle.dot',
      fill: 'series',
    })).toThrow(/No point elements found for selector "circle\.dot"/);
  });
});
