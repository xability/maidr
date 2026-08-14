import type { WaterfallPoint } from '@type/grammar';
import { bindD3Waterfall } from '@adapters/d3/binders/waterfall';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one floating `rect.step` per datum, the way
 * `selectAll('rect.step').data(steps).join('rect')` would leave it.
 */
function buildWaterfallSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="wf-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'step');
    (rect as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(rect);
  }
  return svg;
}

/** A budget bridge: an opening total, three steps, a closing total. */
const STEPS = [
  { label: 'Opening', start: 0, end: 1200, isTotal: true },
  { label: 'Marketing', start: 1200, end: 950, isTotal: false },
  { label: 'Sales', start: 950, end: 1430, isTotal: false },
  { label: 'Support', start: 1430, end: 1360, isTotal: false },
  { label: 'Closing', start: 0, end: 1360, isTotal: true },
];

describe('bindD3Waterfall', () => {
  test('derives the contribution and the direction from the two running totals', () => {
    const svg = buildWaterfallSvg(STEPS);

    const result = bindD3Waterfall(svg, {
      selector: 'rect.step',
      title: 'Quarterly Budget Bridge',
      axes: { x: 'Step', y: 'Amount (thousands)' },
      x: 'label',
    });

    expect(result.layer.type).toBe(TraceType.WATERFALL);
    expect((result.layer.data as WaterfallPoint[]).map(step => [step.delta, step.kind])).toEqual([
      [1200, 'increase'],
      [-250, 'decrease'],
      [480, 'increase'],
      [-70, 'decrease'],
      [1360, 'increase'],
    ]);
  });

  test('marks the totals when the caller says which bars they are', () => {
    // The one thing the binder cannot infer: a total is drawn like a step and
    // contributes like one, so only the author knows which bars restate the
    // running total. An accessor returning undefined leaves the rest derived.
    const svg = buildWaterfallSvg(STEPS);

    const result = bindD3Waterfall(svg, {
      selector: 'rect.step',
      x: 'label',
      kind: (d: unknown) => ((d as { isTotal: boolean }).isTotal ? 'total' : undefined),
    });

    expect((result.layer.data as WaterfallPoint[]).map(step => step.kind))
      .toEqual(['total', 'decrease', 'increase', 'decrease', 'total']);
  });

  test('carries both totals alongside the contribution', () => {
    // The height is the contribution and the position is the running total;
    // neither alone describes the bar, so the payload keeps all three.
    const svg = buildWaterfallSvg([STEPS[1]]);

    const result = bindD3Waterfall(svg, { selector: 'rect.step', x: 'label' });

    expect(result.layer.data).toEqual([
      { x: 'Marketing', start: 1200, end: 950, delta: -250, kind: 'decrease' },
    ]);
  });

  test('infers the accessors from a datum keyed the way a bridge usually is', () => {
    const svg = buildWaterfallSvg([{ step: 'Churn', from: 500, to: 420 }]);

    const result = bindD3Waterfall(svg, { selector: 'rect.step' });

    expect(result.layer.data).toEqual([
      { x: 'Churn', start: 500, end: 420, delta: -80, kind: 'decrease' },
    ]);
  });

  test('highlights one element per step, scoped to the SVG', () => {
    const svg = buildWaterfallSvg(STEPS);

    const result = bindD3Waterfall(svg, { selector: 'rect.step', x: 'label' });

    expect(result.layer.selectors).toBe('#wf-svg rect.step');
    // WaterfallTrace withdraws highlighting unless the element count equals
    // the step count.
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(STEPS.length);
  });

  test('throws an actionable error when the selector matches no steps', () => {
    const svg = buildWaterfallSvg(STEPS);

    expect(() => bindD3Waterfall(svg, { selector: 'rect.bridge' })).toThrow(/waterfall step/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildWaterfallSvg(STEPS);
    const result = bindD3Waterfall(svg, {
      selector: 'rect.step',
      title: 'Quarterly Budget Bridge',
      x: 'label',
      kind: (d: unknown) => ((d as { isTotal: boolean }).isTotal ? 'total' : undefined),
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.WATERFALL]);
    });
  });
});
