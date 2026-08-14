import { bindD3WordCloud } from '@adapters/d3/binders/wordCloud';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `text.term` per datum, the way a cloud is joined
 * after `d3-cloud` has placed its words.
 */
function buildCloudSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="wc-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'term');
    (text as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(text);
  }
  return svg;
}

/** What `cloud().words(...)` writes back onto every word it lays out. */
const PLACED = [
  { text: 'neural', size: 128, x: -104, y: 31, rotate: 0, font: 'sans-serif' },
  { text: 'machine', size: 412, x: 12, y: -8, rotate: 90, font: 'sans-serif' },
  { text: 'gradient', size: 57, x: 88, y: 66, rotate: 0, font: 'sans-serif' },
];

describe('bindD3WordCloud', () => {
  test('reads d3-cloud\'s own keys and drops the layout', () => {
    const svg = buildCloudSvg(PLACED);

    const result = bindD3WordCloud(svg, {
      selector: 'text.term',
      title: 'Terms in the Abstracts',
      axes: { x: 'Term', y: 'Occurrences' },
    });

    expect(result.layer.type).toBe(TraceType.WORD_CLOUD);
    // Where a term landed is a packing artefact, not data — so `x`, `y` and
    // `rotate` from the layout are deliberately absent from the payload.
    expect(result.layer.data).toEqual([
      { x: 'neural', y: 128 },
      { x: 'machine', y: 412 },
      { x: 'gradient', y: 57 },
    ]);
  });

  test('reads a cloud laid out from another shape through the aliases', () => {
    const svg = buildCloudSvg([
      { word: 'tensor', count: 233 },
      { word: 'embedding', count: 96 },
    ]);

    const result = bindD3WordCloud(svg, { selector: 'text.term' });

    expect(result.layer.data).toEqual([
      { x: 'tensor', y: 233 },
      { x: 'embedding', y: 96 },
    ]);
  });

  test('honours explicit accessors over the d3-cloud defaults', () => {
    const svg = buildCloudSvg([{ text: 'glyph', size: 40, occurrences: 7 }]);

    const result = bindD3WordCloud(svg, { selector: 'text.term', y: 'occurrences' });

    // `size` is the drawn glyph height, which need not be the weight itself.
    expect(result.layer.data).toEqual([{ x: 'glyph', y: 7 }]);
  });

  test('emits the terms in DOM order, which the trace reorders by weight', () => {
    const svg = buildCloudSvg(PLACED);

    const result = bindD3WordCloud(svg, { selector: 'text.term' });

    expect(result.layer.selectors).toBe('#wc-svg text.term');
    // WordCloudTrace sorts the terms heaviest first and permutes the resolved
    // glyphs by the same order, so the two only line up when every glyph
    // resolves — it withdraws highlighting on any mismatch rather than guess.
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(PLACED.length);
  });

  test('throws an actionable error when the selector matches no terms', () => {
    const svg = buildCloudSvg(PLACED);

    expect(() => bindD3WordCloud(svg, { selector: 'text.word' })).toThrow(/word cloud term/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildCloudSvg(PLACED);
    const result = bindD3WordCloud(svg, {
      selector: 'text.term',
      title: 'Terms in the Abstracts',
      axes: { x: 'Term', y: 'Occurrences' },
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.WORD_CLOUD]);
    });
  });
});
