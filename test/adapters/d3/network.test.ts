import type { NetworkPoint } from '@type/grammar';
import { bindD3Network } from '@adapters/d3/binders/network';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `line.link` per datum, the way
 * `selectAll('line.link').data(links).join('line')` would leave it.
 */
function buildNetworkSvg(links: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="nw-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of links) {
    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'link');
    (line as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(line);
  }
  return svg;
}

/** The links as the author writes them, before any simulation touches them. */
const AUTHORED = [
  { source: 'Ada', target: 'Grace' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Ada', target: 'Alan' },
];

/**
 * The same links after `d3.forceLink().id(d => d.id)` has run: each end is now
 * the node OBJECT the id resolved to, not the id.
 */
function asSimulated(links: { source: string; target: string }[]): unknown[] {
  const nodes = new Map<string, { id: string; x: number; y: number }>();
  const node = (id: string): unknown => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, x: Math.random(), y: Math.random() });
    }
    return nodes.get(id);
  };
  return links.map(link => ({ source: node(link.source), target: node(link.target) }));
}

describe('bindD3Network', () => {
  test('reads the two ends of every link', () => {
    const svg = buildNetworkSvg(AUTHORED);

    const result = bindD3Network(svg, {
      selector: 'line.link',
      title: 'Collaborations',
      axes: { x: 'Person', y: 'Links' },
    });

    expect(result.layer.type).toBe(TraceType.NETWORK);
    expect(result.layer.data).toEqual([
      { source: 'Ada', target: 'Grace' },
      { source: 'Grace', target: 'Alan' },
      { source: 'Ada', target: 'Alan' },
    ]);
  });

  test('names the ends d3.forceLink replaced with node objects', () => {
    // The simulation MUTATES each link: `source` is an id before it runs and
    // the node object afterwards. Read naively, every link would be drawn
    // between "[object Object]" and itself.
    const svg = buildNetworkSvg(asSimulated(AUTHORED));

    const result = bindD3Network(svg, { selector: 'line.link' });

    expect(result.layer.data).toEqual([
      { source: 'Ada', target: 'Grace' },
      { source: 'Grace', target: 'Alan' },
      { source: 'Ada', target: 'Alan' },
    ]);
  });

  test('carries no position, however the nodes were laid out', () => {
    const svg = buildNetworkSvg(asSimulated(AUTHORED));

    const result = bindD3Network(svg, { selector: 'line.link' });

    // Where a force-directed node lands is a fact about the solver's seed
    // rather than about the data, so there is nowhere for it to go.
    for (const point of result.layer.data as NetworkPoint[]) {
      expect(Object.keys(point).sort()).toEqual(['source', 'target']);
    }
  });

  test('reads a link that names its ends with other keys', () => {
    const svg = buildNetworkSvg([{ from: 'Ada', to: 'Grace' }]);

    const result = bindD3Network(svg, { selector: 'line.link' });

    expect(result.layer.data).toEqual([{ source: 'Ada', target: 'Grace' }]);
  });

  test('says what to do when a node object carries no name', () => {
    const svg = buildNetworkSvg([{ source: { index: 0 }, target: { index: 1 } }]);

    expect(() => bindD3Network(svg, { selector: 'line.link' }))
      .toThrow(/node object with no name/);
  });

  test('highlights the links, scoped to the SVG', () => {
    const svg = buildNetworkSvg(AUTHORED);

    const result = bindD3Network(svg, { selector: 'line.link' });

    // One element per declared link: the trace withdraws highlighting when the
    // counts disagree, which is what a selector matching the node circles
    // instead would produce.
    expect(result.layer.selectors).toBe('#nw-svg line.link');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(AUTHORED.length);
  });

  test('throws an actionable error when the selector matches no links', () => {
    const svg = buildNetworkSvg(AUTHORED);

    expect(() => bindD3Network(svg, { selector: 'line.edge' })).toThrow(/network link/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildNetworkSvg(asSimulated(AUTHORED));
    const result = bindD3Network(svg, {
      selector: 'line.link',
      title: 'Collaborations',
      axes: { x: 'Person', y: 'Links' },
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.NETWORK]);
    });
  });
});
