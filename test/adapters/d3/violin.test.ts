/**
 * A d3 violin is two layers over one set of marks (#1068).
 *
 * `VIOLIN_KDE` and `VIOLIN_BOX` are both in the grammar — Chart.js emits them
 * (#1049), plotly has since #343b — and this adapter had 43 binders and none
 * for a violin. It is also the first bind here to produce more than one layer,
 * which is why `finalizeChart` and `D3BinderResult.layers` exist.
 *
 * The reading holds to the same rule as the rest of the adapter: announce what
 * the chart states. In particular the summary is never derived from the KDE —
 * a density curve's quartiles belong to the smoothing bandwidth rather than to
 * the observations, and a reader told "Q1 is 4.2" cannot tell it was inferred.
 */

import type { BoxPoint, ViolinKdePoint } from '@type/grammar';
import { bindD3Violin } from '@adapters/d3/binders/violin';
import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Two categories' KDE bins, as `d3.area()` over a density estimate binds them. */
const CURVES: unknown[][] = [
  [
    { species: 'setosa', v: 4.5, estimate: 0.1 },
    { species: 'setosa', v: 5.0, estimate: 0.6 },
    { species: 'setosa', v: 5.5, estimate: 0.2 },
  ],
  [
    { species: 'virginica', v: 6.0, estimate: 0.2 },
    { species: 'virginica', v: 6.5, estimate: 0.5 },
    { species: 'virginica', v: 7.0, estimate: 0.3 },
  ],
];

/** The same two categories' five-number summaries, on the overlay's groups. */
const SUMMARIES: unknown[] = [
  { species: 'setosa', min: 4.3, q1: 4.8, q2: 5.0, q3: 5.2, max: 5.8 },
  { species: 'virginica', min: 5.6, q1: 6.2, q2: 6.5, q3: 6.9, max: 7.9 },
];

/**
 * Builds an SVG holding one `path.violin` per category — its bins bound the way
 * `.data(curves).join('path')` leaves them — plus an optional box overlay of
 * `g.box` groups, each containing the IQR `<rect>`.
 */
function buildViolinSvg(curves: unknown[][], summaries: unknown[] = []): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="violin-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;

  for (const bins of curves) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'violin');
    (path as unknown as { __data__: unknown }).__data__ = bins;
    svg.appendChild(path);
  }
  for (const summary of summaries) {
    const group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'box');
    (group as unknown as { __data__: unknown }).__data__ = summary;
    group.appendChild(doc.createElementNS(SVG_NS, 'rect'));
    svg.appendChild(group);
  }
  return svg;
}

const BASE = {
  selector: 'path.violin',
  fill: 'species',
  value: 'v',
  density: 'estimate',
} as const;

describe('bindD3Violin', () => {
  test('reads one KDE curve per category', () => {
    const result = bindD3Violin(buildViolinSvg(CURVES), {
      ...BASE,
      title: 'Sepal length by species',
      axes: { x: 'Species', y: 'Sepal length' },
    });

    expect(result.layer.type).toBe(TraceType.VIOLIN_KDE);
    const data = result.layer.data as ViolinKdePoint[][];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual([
      { x: 'setosa', y: 4.5, density: 0.1 },
      { x: 'setosa', y: 5, density: 0.6 },
      { x: 'setosa', y: 5.5, density: 0.2 },
    ]);
    expect(data[1][1]).toEqual({ x: 'virginica', y: 6.5, density: 0.5 });
  });

  test('names each curve so a reader knows which violin they are in', () => {
    const result = bindD3Violin(buildViolinSvg(CURVES), BASE);

    expect(result.maidr.subplots[0][0].legend).toEqual(['setosa', 'virginica']);
  });

  test('gives every curve a selector of its own', () => {
    // `ViolinKdeTrace` walks one curve at a time, so a single shared selector
    // would resolve both violins for either row.
    const result = bindD3Violin(buildViolinSvg(CURVES), BASE);

    expect(result.layer.selectors).toEqual([
      '#violin-svg path.violin[data-maidr-line-index="0"]',
      '#violin-svg path.violin[data-maidr-line-index="1"]',
    ]);
  });

  test('adds the box summary as a second layer when the chart draws one', () => {
    const result = bindD3Violin(buildViolinSvg(CURVES, SUMMARIES), {
      ...BASE,
      boxSelector: 'g.box',
    });

    expect(result.layers.map(layer => layer.type))
      .toEqual([TraceType.VIOLIN_KDE, TraceType.VIOLIN_BOX]);
    // Both in one subplot: a violin is one chart, navigated by switching
    // layers rather than by moving between panels.
    expect(result.maidr.subplots[0][0].layers).toHaveLength(2);
    expect((result.layers[1].data as BoxPoint[])[0]).toEqual({
      z: 'setosa',
      lowerOutliers: [],
      min: 4.3,
      q1: 4.8,
      q2: 5,
      q3: 5.2,
      max: 5.8,
      upperOutliers: [],
    });
  });

  test('keeps the KDE as the layer the binder is named for', () => {
    // `layer` was singular before this binder existed, so it stays the primary
    // one and a caller written against it reads what it always did.
    const result = bindD3Violin(buildViolinSvg(CURVES, SUMMARIES), {
      ...BASE,
      boxSelector: 'g.box',
    });

    expect(result.layer).toBe(result.layers[0]);
    expect(result.layer.type).toBe(TraceType.VIOLIN_KDE);
  });

  test('points each box selector at the body rather than the whole group', () => {
    const result = bindD3Violin(buildViolinSvg(CURVES, SUMMARIES), {
      ...BASE,
      boxSelector: 'g.box',
    });

    // A highlight over the group would cover the whiskers and outliers too.
    expect(result.layers[1].selectors).toEqual([
      '#violin-svg [data-maidr-violin-box="0"] rect',
      '#violin-svg [data-maidr-violin-box="1"] rect',
    ]);
  });

  test('reads the curves alone when no overlay is named', () => {
    const result = bindD3Violin(buildViolinSvg(CURVES, SUMMARIES), BASE);

    expect(result.layers.map(layer => layer.type)).toEqual([TraceType.VIOLIN_KDE]);
  });

  test('does not invent a summary from the density curve', () => {
    // Quartiles can be computed off a KDE, and they would be the bandwidth's
    // rather than the data's. A violin whose overlay states none is read as
    // its curves alone.
    const noStats = SUMMARIES.map(summary => ({
      species: (summary as { species: string }).species,
    }));
    const result = bindD3Violin(buildViolinSvg(CURVES, noStats), {
      ...BASE,
      boxSelector: 'g.box',
    });

    expect(result.layers.map(layer => layer.type)).toEqual([TraceType.VIOLIN_KDE]);
  });

  test('declines the whole summary when only some categories state one', () => {
    // `ViolinBoxTrace` pairs its selectors with its points by index, so a
    // summary read for one category and not the other would put the second
    // box's highlight on the first category.
    const partial = [SUMMARIES[0], { species: 'virginica' }];
    const result = bindD3Violin(buildViolinSvg(CURVES, partial), {
      ...BASE,
      boxSelector: 'g.box',
    });

    expect(result.layers.map(layer => layer.type)).toEqual([TraceType.VIOLIN_KDE]);
  });

  test('reads bins bound to the path directly, with the category on them', () => {
    // `.data(groups.map(g => g.bins))` leaves the array itself on the path, so
    // the category name can only come from a bin.
    const result = bindD3Violin(buildViolinSvg(CURVES), {
      selector: 'path.violin',
      value: 'v',
      density: 'estimate',
      fill: 'species',
    });

    expect((result.layer.data as ViolinKdePoint[][])[0][0].x).toBe('setosa');
  });

  test('reads bins the datum wraps alongside its category', () => {
    const wrapped = CURVES.map(bins => ({
      species: (bins[0] as { species: string }).species,
      kde: bins,
    }));
    const result = bindD3Violin(buildViolinSvg(wrapped as unknown as unknown[][]), {
      selector: 'path.violin',
      kde: 'kde',
      fill: 'species',
      value: 'v',
      density: 'estimate',
    });

    const data = result.layer.data as ViolinKdePoint[][];
    expect(data).toHaveLength(2);
    expect(data[1][0]).toEqual({ x: 'virginica', y: 6, density: 0.2 });
  });

  test('throws when the selector matches no violin', () => {
    expect(() => bindD3Violin(buildViolinSvg(CURVES), { ...BASE, selector: 'path.missing' }))
      .toThrow(/No elements found/);
  });
});
