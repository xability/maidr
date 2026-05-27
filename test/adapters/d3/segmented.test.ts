import { bindD3Segmented } from '@adapters/d3/binders/segmented';
import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. The test only uses the public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

/**
 * Build an SVG with N rect.bar children, attaching `__data__` to each in the
 * given order so we can exercise the binder's auto-detection of the rendered
 * DOM order.
 */
function buildSegmentedSvg(
  rects: { x: string; y: number; fill: string }[],
): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="test-svg"></svg>`);
  const svg = dom.window.document.querySelector('svg') as unknown as SVGElement;
  for (const datum of rects) {
    const rect = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'bar');
    (rect as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(rect);
  }
  return svg;
}

describe('bindD3Segmented DOM-order auto-detection', () => {
  test('detects subject-major order from interleaved fills (typical D3 dodged join)', () => {
    // Flat dodged: each row's series is rendered together, so adjacent rects
    // belong to different series → fill0 !== fill1 → subject-major.
    const svg = buildSegmentedSvg([
      { x: 'Q1', y: 10, fill: 'A' },
      { x: 'Q1', y: 20, fill: 'B' },
      { x: 'Q2', y: 30, fill: 'A' },
      { x: 'Q2', y: 40, fill: 'B' },
    ]);

    const result = bindD3Segmented(svg, {
      selector: 'rect.bar',
      type: TraceType.DODGED,
    });

    expect(result.layer.domMapping).toEqual({
      order: 'column',
      groupDirection: 'forward',
    });
  });

  test('detects series-major order from grouped-by-series fills (typical D3 stacked-by-series join)', () => {
    // Stacked-by-series: all of series 'A' first, then all of 'B' → fill0 === fill1
    // → series-major.
    const svg = buildSegmentedSvg([
      { x: 'Q1', y: 10, fill: 'A' },
      { x: 'Q2', y: 30, fill: 'A' },
      { x: 'Q1', y: 20, fill: 'B' },
      { x: 'Q2', y: 40, fill: 'B' },
    ]);

    const result = bindD3Segmented(svg, {
      selector: 'rect.bar',
      type: TraceType.STACKED,
    });

    expect(result.layer.domMapping).toEqual({ order: 'row' });
  });

  test('respects explicit user override regardless of DOM ordering', () => {
    // Even with subject-major DOM, the user can force series-major.
    const svg = buildSegmentedSvg([
      { x: 'Q1', y: 10, fill: 'A' },
      { x: 'Q1', y: 20, fill: 'B' },
      { x: 'Q2', y: 30, fill: 'A' },
      { x: 'Q2', y: 40, fill: 'B' },
    ]);

    const result = bindD3Segmented(svg, {
      selector: 'rect.bar',
      type: TraceType.DODGED,
      domOrder: 'series-major',
    });

    expect(result.layer.domMapping).toEqual({ order: 'row' });
  });
});
