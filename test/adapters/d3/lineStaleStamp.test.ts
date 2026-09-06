/**
 * @jest-environment jsdom
 */
/**
 * A `<path>` that stops contributing a row keeps its old stamp.
 *
 * `stampSeriesSelectors` cleared `data-maidr-line-index` only on the paths it
 * was about to re-stamp, so a path that carried a stamp on a previous bind and
 * produces no row on this one keeps it. A D3 update that empties one series'
 * points while `.join()` leaves its path in the DOM is exactly that: the two
 * remaining series are stamped 0 and 1, and the emptied path still says 0.
 *
 * `#chart path.line[data-maidr-line-index="0"]` then matches two elements, and
 * `LineTrace` resolves it with `Svg.selectElement` — first in document order —
 * so row 0's highlight lands on the emptied path and its geometry is parsed
 * from it. `stampOrderedSelectors` documents the same hazard and clears every
 * stamp under the root first; the series stamper never did.
 */
import { bindD3Line } from '@adapters/d3/binders/line';
import { beforeEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Three series, each a `<path>` in its own `<g>` with its own markers.
 * @param counts - How many markers each series is drawn with
 * @returns The SVG root
 */
function buildSvg(counts: number[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'chart';
  counts.forEach((count, series) => {
    const group = document.createElementNS(SVG_NS, 'g');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'line');
    (path as unknown as { __data__: unknown }).__data__ = { series: `s${series}` };
    group.appendChild(path);
    for (let index = 0; index < count; index++) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'dot');
      (circle as unknown as { __data__: unknown }).__data__ = {
        x: index,
        y: index + series,
        series: `s${series}`,
      };
      group.appendChild(circle);
    }
    svg.appendChild(group);
  });
  document.body.appendChild(svg);
  return svg;
}

/**
 * Binds the SVG as a three-series line chart.
 * @param svg - The SVG to bind
 * @returns The emitted per-series selectors
 */
function bind(svg: SVGElement): string[] | undefined {
  return bindD3Line(svg, {
    selector: 'path.line',
    pointSelector: 'circle.dot',
    fill: 'series',
  }).layer.selectors as string[] | undefined;
}

describe('rebinding a d3 line after a series is emptied', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('leaves no stamp on a path that no longer produces a row', () => {
    const svg = buildSvg([2, 2, 2]);
    bind(svg);

    // The D3 update that empties the first series: `.join()` keeps its path.
    for (const dot of Array.from(svg.querySelectorAll('g:first-of-type circle.dot'))) {
      dot.remove();
    }
    const selectors = bind(svg) as string[];

    expect(selectors).toHaveLength(2);
    for (const selector of selectors) {
      expect(document.querySelectorAll(selector)).toHaveLength(1);
    }
  });
});
