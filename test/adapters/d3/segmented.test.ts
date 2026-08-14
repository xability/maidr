import { bindD3Diverging, bindD3Segmented } from '@adapters/d3/binders/segmented';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

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

describe('bindD3Diverging', () => {
  /** A population pyramid: the left-hand side is drawn negative. */
  const PYRAMID = [
    { people: -1200, band: '0-14', sex: 'Men' },
    { people: -1150, band: '15-29', sex: 'Men' },
    { people: 1140, band: '0-14', sex: 'Women' },
    { people: 1100, band: '15-29', sex: 'Women' },
  ];

  /** Builds the pyramid's bars, one `rect.band` per row, in draw order. */
  function buildPyramidSvg(): SVGElement {
    const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="pyramid-svg"></svg>`);
    const svg = dom.window.document.querySelector('svg') as unknown as SVGElement;
    for (const datum of PYRAMID) {
      const rect = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('class', 'band');
      (rect as unknown as { __data__: unknown }).__data__ = datum;
      svg.appendChild(rect);
    }
    return svg;
  }

  test('keeps the values signed, because the sign is which side the bar is on', () => {
    const svg = buildPyramidSvg();

    const result = bindD3Diverging(svg, {
      selector: 'rect.band',
      title: 'Population by Age Band',
      orientation: Orientation.HORIZONTAL,
      axes: { x: 'People, thousands', y: 'Age band', fill: 'Sex' },
      x: 'people',
      y: 'band',
      fill: 'sex',
    });

    expect(result.layer.type).toBe(TraceType.DIVERGING);
    // DivergingTrace reads the sign as a side and the magnitude as the pitch:
    // absolute values would make the two sides indistinguishable, and the
    // balance it reports between them a total instead of a comparison.
    expect(result.layer.data).toEqual([
      [
        { x: -1200, y: '0-14', z: 'Men' },
        { x: -1150, y: '15-29', z: 'Men' },
      ],
      [
        { x: 1140, y: '0-14', z: 'Women' },
        { x: 1100, y: '15-29', z: 'Women' },
      ],
    ]);
    // The pyramid is drawn on its side, so `x` carries the value and `y` the
    // category — which only reads correctly with the orientation declared.
    expect(result.layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(result.maidr.subplots[0][0].legend).toEqual(['Men', 'Women']);
  });

  test('reports the sides in the order they were drawn', () => {
    const svg = buildPyramidSvg();

    const result = bindD3Diverging(svg, {
      selector: 'rect.band',
      x: 'people',
      y: 'band',
      fill: 'sex',
    });

    // Both series are rendered together, so the DOM is series-major and the
    // model walks the sides in declaration order — the order a diverging chart
    // is authored in, unlike a stacked bar's bottom-up segments.
    expect(result.layer.domMapping).toEqual({ order: 'row' });
    // Vertical by default: nothing is claimed the chart did not declare.
    expect(result.layer.orientation).toBeUndefined();
  });

  test('highlights the bars, scoped to the SVG', () => {
    const svg = buildPyramidSvg();

    const result = bindD3Diverging(svg, {
      selector: 'rect.band',
      x: 'people',
      y: 'band',
      fill: 'sex',
    });

    expect(result.layer.selectors).toBe('#pyramid-svg rect.band');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(PYRAMID.length);
  });

  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildPyramidSvg();
    const result = bindD3Diverging(svg, {
      selector: 'rect.band',
      title: 'Population by Age Band',
      orientation: Orientation.HORIZONTAL,
      x: 'people',
      y: 'band',
      fill: 'sex',
    });

    // Drop the selectors for this assertion only: SegmentedTrace narrows the
    // resolved elements with `instanceof SVGPathElement`, and jsdom implements
    // no such class — so highlighting is asserted on the emitted selector
    // string above, and this checks the part jsdom can run.
    const { selectors: _selectors, ...layer } = result.layer;

    withPageDocument(svg, () => {
      const figure = new Figure({ ...result.maidr, subplots: [[{ layers: [layer] }]] });
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.DIVERGING]);
    });
  });
});
