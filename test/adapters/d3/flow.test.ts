import type { FlowPoint } from '@type/grammar';
import { bindD3Alluvial, bindD3Chord, bindD3Sankey } from '@adapters/d3/binders/flow';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `path.ribbon` per datum, the way
 * `selectAll('path.ribbon').data(graph.links).join('path')` would leave it.
 */
function buildFlowSvg(links: unknown[], id = 'fl-svg'): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="${id}"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of links) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'ribbon');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

/** The links as the author writes them, before the layout touches them. */
const AUTHORED = [
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Gas', target: 'Electricity', value: 12 },
];

/**
 * The same links after `sankey({ nodes, links })` has run: each end is now the
 * node OBJECT it resolved to, and the layout's own geometry sits alongside.
 */
function asLaidOut(links: { source: string; target: string; value: number }[]): unknown[] {
  const nodes = new Map<string, { name: string; x0: number; x1: number }>();
  const node = (name: string): unknown => {
    if (!nodes.has(name)) {
      nodes.set(name, { name, x0: 0, x1: 20 });
    }
    return nodes.get(name);
  };
  return links.map(link => ({
    source: node(link.source),
    target: node(link.target),
    value: link.value,
    width: link.value / 2,
  }));
}

/**
 * One `d3.chord()` chord: both ends are matrix INDICES, and the magnitude sits
 * on each end rather than on the chord itself.
 */
function chord(sourceIndex: number, targetIndex: number, value: number): unknown {
  return {
    source: { index: sourceIndex, subindex: targetIndex, startAngle: 0, endAngle: 1, value },
    target: { index: targetIndex, subindex: sourceIndex, startAngle: 2, endAngle: 3, value },
  };
}

describe('bindD3Sankey', () => {
  test('reads both ends and the magnitude of every ribbon', () => {
    const svg = buildFlowSvg(AUTHORED);

    const result = bindD3Sankey(svg, {
      selector: 'path.ribbon',
      title: 'Energy flow',
      axes: { x: 'Node', y: 'Petajoules' },
    });

    expect(result.layer.type).toBe(TraceType.SANKEY);
    expect(result.layer.data).toEqual(AUTHORED);
  });

  test('names the ends d3-sankey replaced with node objects', () => {
    // The layout MUTATES each link: `source` is a name before it runs and the
    // node object afterwards. Read naively, every ribbon would run between
    // "[object Object]" and itself.
    const svg = buildFlowSvg(asLaidOut(AUTHORED));

    const result = bindD3Sankey(svg, { selector: 'path.ribbon' });

    expect(result.layer.data).toEqual(AUTHORED);
  });

  test('keeps the ribbons in declared order', () => {
    // The trace keys its selector list to declared order, so a payload that
    // reordered the flows would highlight one ribbon while announcing another.
    const svg = buildFlowSvg(AUTHORED);

    const result = bindD3Sankey(svg, { selector: 'path.ribbon' });

    const values = (result.layer.data as FlowPoint[]).map(point => point.value);
    expect(values).toEqual([34, 14, 12]);
  });

  test('says what to do when a ribbon carries no magnitude', () => {
    const svg = buildFlowSvg([{ source: 'Coal', target: 'Heat' }]);

    expect(() => bindD3Sankey(svg, { selector: 'path.ribbon' }))
      .toThrow(/carries no magnitude/);
  });

  test('highlights the ribbons, scoped to the SVG', () => {
    const svg = buildFlowSvg(AUTHORED);

    const result = bindD3Sankey(svg, { selector: 'path.ribbon' });

    // One element per declared flow: the trace withdraws highlighting when
    // the counts disagree, which is what a selector matching the node rects
    // instead would produce.
    expect(result.layer.selectors).toBe('#fl-svg path.ribbon');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(AUTHORED.length);
  });

  test('throws an actionable error when the selector matches no ribbons', () => {
    const svg = buildFlowSvg(AUTHORED);

    expect(() => bindD3Sankey(svg, { selector: 'path.link' })).toThrow(/flow ribbon/);
  });
});

describe('bindD3Alluvial', () => {
  test('extracts the same graph and announces itself as alluvial', () => {
    const svg = buildFlowSvg(AUTHORED);

    const result = bindD3Alluvial(svg, { selector: 'path.ribbon' });

    expect(result.layer.type).toBe(TraceType.ALLUVIAL);
    expect(result.layer.data).toEqual(AUTHORED);
  });
});

describe('bindD3Chord', () => {
  test('names the matrix indices d3.chord binds from the declared names', () => {
    const svg = buildFlowSvg([chord(0, 2, 90), chord(1, 3, 40)], 'ch-svg');

    const result = bindD3Chord(svg, {
      selector: 'path.ribbon',
      names: ['Africa', 'Americas', 'Asia', 'Europe'],
    });

    expect(result.layer.type).toBe(TraceType.CHORD);
    expect(result.layer.data).toEqual([
      { source: 'Africa', target: 'Asia', value: 90 },
      { source: 'Americas', target: 'Europe', value: 40 },
    ]);
  });

  test('reads the magnitude d3.chord puts on the ribbon\'s ends', () => {
    // A chord carries no value of its own: the width was drawn from the value
    // on each end, so that is the honest number to announce.
    const svg = buildFlowSvg([chord(0, 1, 12)], 'ch-svg');

    const result = bindD3Chord(svg, { selector: 'path.ribbon', names: ['A', 'B'] });

    expect((result.layer.data as FlowPoint[])[0].value).toBe(12);
  });

  test('falls back to the bare index when no names are declared', () => {
    const svg = buildFlowSvg([chord(0, 1, 12)], 'ch-svg');

    const result = bindD3Chord(svg, { selector: 'path.ribbon' });

    expect(result.layer.data).toEqual([{ source: 0, target: 1, value: 12 }]);
  });
});

describe('core-model integration', () => {
  test('a sankey layer constructs a navigable Figure', () => {
    const svg = buildFlowSvg(asLaidOut(AUTHORED));
    const result = bindD3Sankey(svg, {
      selector: 'path.ribbon',
      title: 'Energy flow',
      axes: { x: 'Node', y: 'Petajoules' },
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.SANKEY]);
    });
  });

  test('a chord layer constructs a navigable Figure', () => {
    const svg = buildFlowSvg([chord(0, 1, 12), chord(1, 2, 7)], 'ch-svg');
    const result = bindD3Chord(svg, {
      selector: 'path.ribbon',
      names: ['Africa', 'Americas', 'Asia'],
      title: 'Migration',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.CHORD]);
    });
  });
});
