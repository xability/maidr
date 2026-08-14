import type { BoxenPoint } from '@type/grammar';
import { bindD3Boxen } from '@adapters/d3/binders/boxen';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `g.boxen` per distribution, each with the stack of
 * rungs a letter-value plot draws inside it — the way
 * `selectAll('g.boxen').data(summaries).join('g')` would leave it.
 */
function buildBoxenSvg(distributions: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="bx-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of distributions) {
    const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'boxen');
    (group as unknown as { __data__: unknown }).__data__ = datum;
    // The rungs themselves: several per distribution, which is why the
    // selector points at the group and not at them.
    for (let rung = 0; rung < 3; rung++) {
      group.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'rect'));
    }
    svg.appendChild(group);
  }
  return svg;
}

const SUMMARIES = [
  {
    group: 'control',
    median: 50,
    levels: [
      { p: 0.25, lo: 46, hi: 54 },
      { p: 0.125, lo: 42, hi: 58 },
      { p: 0.0625, lo: 38, hi: 62 },
    ],
  },
  {
    group: 'treatment',
    median: 62,
    levels: [
      { p: 0.25, lo: 57, hi: 68 },
      { p: 0.125, lo: 51, hi: 74 },
    ],
    upperOutliers: [130],
  },
];

describe('bindD3Boxen', () => {
  test('reads the ladder each distribution was drawn from', () => {
    const svg = buildBoxenSvg(SUMMARIES);

    const result = bindD3Boxen(svg, {
      selector: 'g.boxen',
      title: 'Response Time by Group',
      axes: { x: 'Group', y: 'Milliseconds' },
      x: 'group',
    });

    expect(result.layer.type).toBe(TraceType.BOXEN);
    expect(result.layer.data).toEqual([
      {
        z: 'control',
        median: 50,
        levels: [
          { p: 0.25, lo: 46, hi: 54 },
          { p: 0.125, lo: 42, hi: 58 },
          { p: 0.0625, lo: 38, hi: 62 },
        ],
      },
      {
        z: 'treatment',
        median: 62,
        levels: [
          { p: 0.25, lo: 57, hi: 68 },
          { p: 0.125, lo: 51, hi: 74 },
        ],
        upperOutliers: [130],
      },
    ]);
  });

  test('gives each distribution as many rungs as it has', () => {
    // The point of a letter-value plot: a larger sample gets a deeper ladder,
    // which is the one thing a five-number summary cannot express.
    const svg = buildBoxenSvg(SUMMARIES);

    const result = bindD3Boxen(svg, { selector: 'g.boxen', x: 'group' });

    const depths = (result.layer.data as BoxenPoint[]).map(point => point.levels.length);
    expect(depths).toEqual([3, 2]);
  });

  test('reads a ladder that names its rungs with other keys', () => {
    const svg = buildBoxenSvg([{
      group: 'control',
      median: 50,
      letterValues: [{ p: 0.25, lower: 46, upper: 54 }],
    }]);

    const result = bindD3Boxen(svg, { selector: 'g.boxen', x: 'group' });

    expect((result.layer.data as BoxenPoint[])[0].levels).toEqual([{ p: 0.25, lo: 46, hi: 54 }]);
  });

  test('drops a rung whose numbers are not all there', () => {
    // A rung is a labelled position on the distribution; one carrying NaN
    // would be announced as a percentile the data never computed.
    const svg = buildBoxenSvg([{
      group: 'control',
      median: 50,
      levels: [{ p: 0.25, lo: 46, hi: 54 }, { p: 0.125, lo: Number.NaN, hi: 58 }, { lo: 1, hi: 2 }],
    }]);

    const result = bindD3Boxen(svg, { selector: 'g.boxen', x: 'group' });

    expect((result.layer.data as BoxenPoint[])[0].levels).toEqual([{ p: 0.25, lo: 46, hi: 54 }]);
  });

  test('says what to do when the datum carries no ladder', () => {
    const svg = buildBoxenSvg([{ group: 'control', median: 50, levels: 3 }]);

    expect(() => bindD3Boxen(svg, { selector: 'g.boxen', x: 'group' }))
      .toThrow(/has no ladder/);
  });

  test('highlights one element per distribution, scoped to the SVG', () => {
    const svg = buildBoxenSvg(SUMMARIES);

    const result = bindD3Boxen(svg, { selector: 'g.boxen', x: 'group' });

    // The trace repeats a distribution's element across its rungs and
    // withdraws highlighting when the counts disagree — which is what a
    // selector matching the rungs themselves would produce.
    expect(result.layer.selectors).toBe('#bx-svg g.boxen');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(SUMMARIES.length);
  });

  test('throws an actionable error when the selector matches no groups', () => {
    const svg = buildBoxenSvg(SUMMARIES);

    expect(() => bindD3Boxen(svg, { selector: 'g.box' })).toThrow(/boxen group/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildBoxenSvg(SUMMARIES);
    const result = bindD3Boxen(svg, {
      selector: 'g.boxen',
      title: 'Response Time by Group',
      axes: { x: 'Group', y: 'Milliseconds' },
      x: 'group',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.BOXEN]);
    });
  });
});
