import type { VolcanoPoint } from '@type/grammar';
import { bindD3Manhattan, bindD3Scatter } from '@adapters/d3/binders/scatter';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `circle.snp` per datum, the way
 * `selectAll('circle.snp').data(points).join('circle')` would leave it.
 */
function buildManhattanSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="mh-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'snp');
    (circle as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(circle);
  }
  return svg;
}

const SNPS = [
  { pos: 1_020_000, logP: 2.1, snp: 'rs1001', chromosome: '1' },
  { pos: 4_300_000, logP: 9.4, snp: 'rs4300', chromosome: '2' },
  { pos: 8_800_000, logP: 7.8, snp: 'rs8800', chromosome: '3' },
];

describe('bindD3Manhattan', () => {
  test('carries what each point is and which chromosome it sits on', () => {
    const svg = buildManhattanSvg(SNPS);

    const result = bindD3Manhattan(svg, {
      selector: 'circle.snp',
      title: 'Genome-wide Association',
      axes: { x: 'Position', y: '-log10(p)', fill: 'Chromosome' },
      x: 'pos',
      y: 'logP',
      label: 'snp',
      group: 'chromosome',
    });

    expect(result.layer.type).toBe(TraceType.MANHATTAN);
    // Identity is the payload on this chart: the coordinates alone answer the
    // question a reader can already see the shape of.
    expect(result.layer.data).toEqual([
      { x: 1_020_000, y: 2.1, label: 'rs1001', group: '1' },
      { x: 4_300_000, y: 9.4, label: 'rs4300', group: '2' },
      { x: 8_800_000, y: 7.8, label: 'rs8800', group: '3' },
    ]);
  });

  test('infers the label and the region from the datum\'s own key names', () => {
    const svg = buildManhattanSvg([{ x: 1, y: 8, id: 'rs99', chr: 'X' }]);

    const result = bindD3Manhattan(svg, { selector: 'circle.snp' });

    expect(result.layer.data).toEqual([{ x: 1, y: 8, label: 'rs99', group: 'X' }]);
  });

  test('keeps a point the datum names neither for', () => {
    // Dropping a point for want of a label would lose the reading the chart
    // was drawn for; both fields are simply absent.
    const svg = buildManhattanSvg([{ x: 1, y: 8 }]);

    const result = bindD3Manhattan(svg, { selector: 'circle.snp' });

    const [point] = result.layer.data as VolcanoPoint[];
    expect(point).toEqual({ x: 1, y: 8 });
  });

  test('declares the significance cutoff the chart was drawn against', () => {
    const svg = buildManhattanSvg(SNPS);

    const result = bindD3Manhattan(svg, {
      selector: 'circle.snp',
      x: 'pos',
      y: 'logP',
      significance: 7.3,
    });

    expect(result.layer.thresholdOptions).toEqual({ significance: 7.3 });
  });

  test('emits no threshold at all when none was declared', () => {
    // There is deliberately no default: these charts are drawn on transformed
    // axes whose conventions differ, and a guessed line would sort every point
    // onto the wrong side silently.
    const svg = buildManhattanSvg(SNPS);

    const result = bindD3Manhattan(svg, { selector: 'circle.snp', x: 'pos', y: 'logP' });

    expect(result.layer.thresholdOptions).toBeUndefined();
  });

  test('carries a raw p axis\'s inverted cutoff', () => {
    const svg = buildManhattanSvg([{ x: 1, y: 0.01 }]);

    const result = bindD3Manhattan(svg, {
      selector: 'circle.snp',
      significance: 0.05,
      significanceDirection: 'below',
    });

    expect(result.layer.thresholdOptions)
      .toEqual({ significance: 0.05, significanceDirection: 'below' });
  });

  test('highlights the points, scoped to the SVG', () => {
    const svg = buildManhattanSvg(SNPS);

    const result = bindD3Manhattan(svg, { selector: 'circle.snp', x: 'pos', y: 'logP' });

    expect(result.layer.selectors).toBe('#mh-svg circle.snp');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(SNPS.length);
  });
});

describe('bindD3Scatter alongside it', () => {
  test('stays a scatter, and reads nothing a scatter does not carry', () => {
    // The two share an extraction core; a datum with a `name` key must not
    // pick up the Manhattan's label inference.
    const svg = buildManhattanSvg([{ x: 1, y: 2, name: 'not a label' }]);

    const result = bindD3Scatter(svg, { selector: 'circle.snp' });

    expect(result.layer.type).toBe(TraceType.SCATTER);
    expect(result.layer.data).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildManhattanSvg(SNPS);
    const result = bindD3Manhattan(svg, {
      selector: 'circle.snp',
      title: 'Genome-wide Association',
      x: 'pos',
      y: 'logP',
      label: 'snp',
      group: 'chromosome',
      significance: 7.3,
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.MANHATTAN]);
    });
  });
});
