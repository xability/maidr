import type { ErrorBarPoint } from '@type/grammar';
import { bindD3ErrorBar } from '@adapters/d3/binders/errorBar';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `g.estimate` per datum — the D3 idiom for a
 * point-range chart, where the group wraps the interval's line and the
 * estimate's marker — with each datum bound the way a data join would leave it.
 */
function buildEstimateSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="eb-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'estimate');
    (group as unknown as { __data__: unknown }).__data__ = datum;
    // Both marks a point range is drawn from, so a selector aimed at the wrong
    // one would show up as a mismatched element count.
    group.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'line'));
    group.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'circle'));
    svg.appendChild(group);
  }
  return svg;
}

const ESTIMATES = [
  { group: 'control', mean: 4.2, ciLow: 3.8, ciHigh: 4.6 },
  { group: 'low dose', mean: 5.1, ciLow: 4.0, ciHigh: 6.6 },
  { group: 'high dose', mean: 7.3, ciLow: 7.1, ciHigh: 7.4 },
];

describe('bindD3ErrorBar', () => {
  test('reads the estimate and its two bounds off each group', () => {
    const svg = buildEstimateSvg(ESTIMATES);

    const result = bindD3ErrorBar(svg, {
      selector: 'g.estimate',
      title: 'Mean Response by Dose',
      axes: { x: 'Group', y: 'Response' },
      x: 'group',
      y: 'mean',
      yMin: 'ciLow',
      yMax: 'ciHigh',
    });

    expect(result.layer.type).toBe(TraceType.ERROR_BAR);
    expect(result.layer.data).toEqual([
      { x: 'control', y: 4.2, yMin: 3.8, yMax: 4.6 },
      { x: 'low dose', y: 5.1, yMin: 4.0, yMax: 6.6 },
      { x: 'high dose', y: 7.3, yMin: 7.1, yMax: 7.4 },
    ]);
    expect(result.layer.orientation).toBe(Orientation.VERTICAL);
  });

  test('infers all four accessors from the datum\'s own key names', () => {
    const svg = buildEstimateSvg(ESTIMATES);

    // Nothing named: `group`, `mean`, `ciLow` and `ciHigh` are all aliases.
    const result = bindD3ErrorBar(svg, { selector: 'g.estimate' });

    expect(result.layer.data).toEqual([
      { x: 'control', y: 4.2, yMin: 3.8, yMax: 4.6 },
      { x: 'low dose', y: 5.1, yMin: 4.0, yMax: 6.6 },
      { x: 'high dose', y: 7.3, yMin: 7.1, yMax: 7.4 },
    ]);
  });

  test('keeps a one-sided interval rather than dropping the estimate', () => {
    // A bound the chart never drew is absent, not zero: an upper bound with no
    // lower is a real chart, and discarding the row would lose the estimate too.
    const svg = buildEstimateSvg([{ x: 'ceiling', y: 12, yMax: 15 }]);

    const result = bindD3ErrorBar(svg, { selector: 'g.estimate' });

    expect(result.layer.data).toEqual([{ x: 'ceiling', y: 12, yMax: 15 }]);
    expect((result.layer.data as ErrorBarPoint[])[0]).not.toHaveProperty('yMin');
  });

  test('converts half-widths to absolute bounds through function accessors', () => {
    // The grammar fixes absolute positions, and the binder cannot tell an
    // offset from a bound by looking at it — so this is the caller's to do.
    const svg = buildEstimateSvg([{ dose: 10, mean: 4, se: 0.5 }]);

    const result = bindD3ErrorBar(svg, {
      selector: 'g.estimate',
      x: 'dose',
      y: 'mean',
      yMin: (d: unknown) => (d as { mean: number; se: number }).mean - 1.96 * (d as { se: number }).se,
      yMax: (d: unknown) => (d as { mean: number; se: number }).mean + 1.96 * (d as { se: number }).se,
    });

    const [point] = result.layer.data as ErrorBarPoint[];
    expect(point.yMin).toBeCloseTo(3.02);
    expect(point.yMax).toBeCloseTo(4.98);
  });

  test('highlights one group per estimate, scoped to the SVG', () => {
    const svg = buildEstimateSvg(ESTIMATES);

    const result = bindD3ErrorBar(svg, { selector: 'g.estimate', orientation: Orientation.HORIZONTAL });

    expect(result.layer.selectors).toBe('#eb-svg g.estimate');
    expect(result.layer.orientation).toBe(Orientation.HORIZONTAL);
    // ErrorBarTrace withdraws highlighting unless the resolved element count
    // equals the sample count, so the selector must match the groups alone.
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(ESTIMATES.length);
  });

  test('throws an actionable error when the selector matches no estimates', () => {
    const svg = buildEstimateSvg(ESTIMATES);

    expect(() => bindD3ErrorBar(svg, { selector: 'g.range' })).toThrow(/error-bar estimate/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildEstimateSvg(ESTIMATES);
    const result = bindD3ErrorBar(svg, {
      selector: 'g.estimate',
      title: 'Mean Response by Dose',
      x: 'group',
      y: 'mean',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.ERROR_BAR]);
    });
  });
});
