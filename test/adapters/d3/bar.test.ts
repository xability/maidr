import type { BarPoint } from '@type/grammar';
import { bindD3Bar, bindD3Dot, bindD3Funnel, bindD3Lollipop } from '@adapters/d3/binders/bar';
import { describe, expect, test } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * Builds an SVG holding one mark per datum, in the order given, with each
 * datum bound the way `selectAll(tag).data(...).join(tag)` would leave it.
 */
function buildMarkSvg(tag: string, className: string, data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="mark-svg"></svg>`);
  const svg = dom.window.document.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const mark = dom.window.document.createElementNS('http://www.w3.org/2000/svg', tag);
    mark.setAttribute('class', className);
    (mark as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(mark);
  }
  return svg;
}

describe('bindD3Dot', () => {
  test('announces a dot plot while reading the bar payload', () => {
    const svg = buildMarkSvg('circle', 'dot', [
      { endpoint: '/search', ms: 412 },
      { endpoint: '/checkout', ms: 318 },
      { endpoint: '/health', ms: 96 },
    ]);

    const result = bindD3Dot(svg, {
      selector: 'circle.dot',
      title: 'Median Response Time',
      orientation: Orientation.HORIZONTAL,
      axes: { x: 'Milliseconds', y: 'Endpoint' },
      x: 'ms',
      y: 'endpoint',
    });

    expect(result.layer.type).toBe(TraceType.DOT);
    // Flat BarPoint[], identical to what a bar chart would emit.
    expect(result.layer.data).toEqual([
      { x: 412, y: '/search' },
      { x: 318, y: '/checkout' },
      { x: 96, y: '/health' },
    ]);
    // Categories down the page: the orientation the mark is usually drawn in.
    expect(result.layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  test('highlights the dots themselves, scoped to the SVG', () => {
    const svg = buildMarkSvg('circle', 'dot', [{ x: 'A', y: 1 }, { x: 'B', y: 2 }]);

    const result = bindD3Dot(svg, { selector: 'circle.dot' });

    // One scoped selector matching all marks: BarTrace maps them 1:1 to rows.
    expect(result.layer.selectors).toBe('#mark-svg circle.dot');
  });
});

describe('bindD3Lollipop', () => {
  test('announces a lollipop and highlights the heads, not the stems', () => {
    const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="pop-svg"></svg>`);
    const doc = dom.window.document;
    const svg = doc.querySelector('svg') as unknown as SVGElement;
    // Draw both marks a lollipop is made of, so the selector has something to
    // pick wrongly: the stems carry the same data and must stay unmatched.
    for (const datum of [{ country: 'Norway', years: 84 }, { country: 'India', years: 61 }]) {
      for (const tag of ['line', 'circle']) {
        const mark = doc.createElementNS('http://www.w3.org/2000/svg', tag);
        mark.setAttribute('class', tag === 'line' ? 'stem' : 'head');
        (mark as unknown as { __data__: unknown }).__data__ = datum;
        svg.appendChild(mark);
      }
    }

    const result = bindD3Lollipop(svg, {
      selector: 'circle.head',
      orientation: Orientation.HORIZONTAL,
      x: 'years',
      y: 'country',
    });

    expect(result.layer.type).toBe(TraceType.LOLLIPOP);
    expect(result.layer.data).toEqual([
      { x: 84, y: 'Norway' },
      { x: 61, y: 'India' },
    ]);
    expect(result.layer.selectors).toBe('#pop-svg circle.head');
  });
});

describe('bindD3Funnel', () => {
  test('keeps the stages in draw order, which is what the retention is read from', () => {
    // The order is load-bearing: FunnelTrace pitches each stage against the
    // one before it, so a reordered payload would announce the wrong drop-off.
    const svg = buildMarkSvg('path', 'stage', [
      { stage: 'Visited', count: 10000 },
      { stage: 'Signed up', count: 2400 },
      { stage: 'Viewed cart', count: 2300 },
      { stage: 'Purchased', count: 100 },
    ]);

    const result = bindD3Funnel(svg, {
      selector: 'path.stage',
      title: 'Checkout Funnel',
      axes: { x: 'Stage', y: 'People' },
    });

    expect(result.layer.type).toBe(TraceType.FUNNEL);
    // `stage` / `count` are inferred: neither is the canonical `x` / `y` key.
    expect((result.layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['Visited', 'Signed up', 'Viewed cart', 'Purchased']);
    expect((result.layer.data as BarPoint[]).map(point => point.y))
      .toEqual([10000, 2400, 2300, 100]);
    expect(result.layer.selectors).toBe('#mark-svg path.stage');
  });
});

describe('bindD3Bar', () => {
  test('still announces itself as a bar chart', () => {
    // The mark binders share this extraction core; the base case must not
    // pick up one of their type constants.
    const svg = buildMarkSvg('rect', 'bar', [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }]);

    const result = bindD3Bar(svg, { selector: 'rect.bar' });

    expect(result.layer.type).toBe(TraceType.BAR);
    expect(result.layer.orientation).toBe(Orientation.VERTICAL);
  });
});
